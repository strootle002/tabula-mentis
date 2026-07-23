use notify_debouncer_full::{new_debouncer, notify::RecursiveMode, DebouncedEvent};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::mpsc,
    time::{Duration, Instant},
};

const DEBOUNCE: Duration = Duration::from_millis(300);

fn atomic_save(path: &Path, content: &str) {
    let temp = PathBuf::from(format!("{}.mindmap-tmp", path.display()));
    let backup = PathBuf::from(format!("{}.mindmap-backup", path.display()));
    fs::write(&temp, content).unwrap();
    if path.exists() {
        fs::rename(path, &backup).unwrap();
    }
    fs::rename(&temp, path).unwrap();
    if backup.exists() {
        fs::remove_file(backup).unwrap();
    }
}

fn receive_burst(
    receiver: &mpsc::Receiver<
        Result<Vec<DebouncedEvent>, Vec<notify_debouncer_full::notify::Error>>,
    >,
) -> Vec<PathBuf> {
    let deadline = Instant::now() + Duration::from_millis(900);
    let mut paths = Vec::new();
    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match receiver.recv_timeout(remaining.min(Duration::from_millis(450))) {
            Ok(Ok(events)) => {
                paths.extend(
                    events
                        .into_iter()
                        .flat_map(|event| event.event.paths.into_iter()),
                );
            }
            Ok(Err(errors)) => panic!("watch errors: {errors:?}"),
            Err(mpsc::RecvTimeoutError::Timeout) if !paths.is_empty() => break,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(error) => panic!("watch channel failed: {error}"),
        }
    }
    paths
}

fn production_filter(paths: Vec<PathBuf>, own_writes: &HashSet<PathBuf>) -> Vec<PathBuf> {
    let mut filtered = Vec::new();
    for path in paths {
        let text = path.to_string_lossy().replace('\\', "/");
        if text.ends_with(".mindmap-tmp") || text.ends_with(".mindmap-backup") {
            continue;
        }
        if own_writes.contains(&path) || filtered.contains(&path) {
            continue;
        }
        filtered.push(path);
    }
    filtered
}

#[test]
fn live_backend_covers_atomic_suppression_external_edits_and_bursts() {
    let root = std::env::temp_dir().join(format!(
        "mindmap-live-watcher-{}-{}",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ));
    let notes = root.join("notes");
    fs::create_dir_all(&notes).unwrap();
    let target = notes.join("live.md");
    fs::write(&target, "initial").unwrap();

    let (sender, receiver) = mpsc::channel();
    let mut debouncer = new_debouncer(DEBOUNCE, None, move |events| {
        sender.send(events).unwrap();
    })
    .unwrap();
    debouncer.watch(&root, RecursiveMode::Recursive).unwrap();
    std::thread::sleep(Duration::from_millis(100));

    // A normal app save and Keep Local both mark the destination as owned.
    let own = HashSet::from([target.clone()]);
    atomic_save(&target, "own save");
    let own_save = production_filter(receive_burst(&receiver), &own);
    assert!(
        !own_save.contains(&target),
        "own save reached conflict handling: {own_save:?}"
    );

    fs::write(&target, "clean external edit").unwrap();
    let clean = production_filter(receive_burst(&receiver), &HashSet::new());
    assert_eq!(
        clean.iter().filter(|path| *path == &target).count(),
        1,
        "clean external edit was not coalesced: {clean:?}"
    );

    // A dirty document sees one genuinely different external change, so the
    // frontend creates one conflict rather than repeatedly replacing it.
    for index in 0..8 {
        fs::write(&target, format!("dirty external edit {index}")).unwrap();
    }
    let dirty = production_filter(receive_burst(&receiver), &HashSet::new());
    assert_eq!(
        dirty.iter().filter(|path| *path == &target).count(),
        1,
        "burst should create one conflict input: {dirty:?}"
    );

    atomic_save(&target, "keep local");
    let keep_local = production_filter(receive_burst(&receiver), &own);
    assert!(
        !keep_local.contains(&target),
        "Keep Local echoed into conflict handling: {keep_local:?}"
    );

    fs::write(
        PathBuf::from(format!("{}.mindmap-tmp", target.display())),
        "temporary",
    )
    .unwrap();
    fs::write(
        PathBuf::from(format!("{}.mindmap-backup", target.display())),
        "backup",
    )
    .unwrap();
    let artifacts = production_filter(receive_burst(&receiver), &HashSet::new());
    assert!(
        artifacts.iter().all(|path| {
            let text = path.to_string_lossy();
            !text.ends_with(".mindmap-tmp") && !text.ends_with(".mindmap-backup")
        }),
        "atomic artifacts reached conflict handling: {artifacts:?}"
    );

    drop(debouncer);
    fs::remove_dir_all(root).unwrap();
}
