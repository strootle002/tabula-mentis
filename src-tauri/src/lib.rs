use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{Manager, Runtime};
use tauri_plugin_fs::FsExt;
use tauri_plugin_store::StoreExt;

const VAULT_SCOPE_RECORD: &str = "trusted-vault.json";
const VAULT_ID_MARKER: &str = ".mindmap-vault-id";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultScopeRecord {
    canonical_path: PathBuf,
    vault_id: String,
}

fn canonical_vault(path: &Path) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Vault is unavailable or unmounted: {error}"))?;
    if !canonical.is_dir() {
        return Err("The selected vault is not a directory.".into());
    }
    #[cfg(unix)]
    if canonical == Path::new("/") {
        return Err(
            "Select a vault folder or mounted volume, not the system filesystem root.".into(),
        );
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        // Mount roots may belong to root while a user-owned folder beneath them is safe.
        // Require ownership of the selected folder itself; no standard-directory allowlist
        // is used, so /media, /mnt and /Volumes remain supported.
        let owner = fs::metadata(&canonical)
            .map_err(|error| format!("Could not inspect the selected vault: {error}"))?
            .uid();
        if owner != unsafe { libc::geteuid() } {
            return Err(
                "Select a folder you own on this drive (create one inside the mount if needed)."
                    .into(),
            );
        }
    }

    Ok(canonical)
}

fn scope_record_path<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data: {error}"))?;
    fs::create_dir_all(&app_data)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;
    Ok(app_data.join(VAULT_SCOPE_RECORD))
}

fn grant_vault<R: Runtime>(app: &tauri::AppHandle<R>, canonical: &Path) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(canonical, true)
        .map_err(|error| format!("Could not grant vault filesystem access: {error}"))?;
    app.state::<tauri::scope::Scopes>()
        .allow_directory(canonical, true)
        .map_err(|error| format!("Could not grant vault image access: {error}"))
}

fn read_or_create_vault_id(canonical: &Path) -> Result<String, String> {
    let marker = canonical.join(VAULT_ID_MARKER);
    if marker.exists() {
        let id = fs::read_to_string(&marker)
            .map_err(|error| format!("Could not read the vault identity marker: {error}"))?;
        let id = id.trim();
        uuid::Uuid::parse_str(id)
            .map_err(|_| "The vault identity marker is invalid.".to_string())?;
        return Ok(id.to_string());
    }
    let id = uuid::Uuid::new_v4().to_string();
    fs::write(&marker, &id)
        .map_err(|error| format!("Could not create the vault identity marker: {error}"))?;
    Ok(id)
}

#[tauri::command]
fn trust_selected_vault<R: Runtime>(
    app: tauri::AppHandle<R>,
    path: PathBuf,
) -> Result<PathBuf, String> {
    // The dialog plugin adds an explicitly selected folder to this dynamic scope.
    // Refuse arbitrary renderer-provided paths that did not come through a picker.
    if !app.fs_scope().is_allowed(&path) {
        return Err("Vault access must be granted through the folder picker.".into());
    }
    let canonical = canonical_vault(&path)?;
    if !app.fs_scope().is_allowed(&canonical) {
        return Err("The selected folder resolves outside the picker grant.".into());
    }

    grant_vault(&app, &canonical)?;
    let vault_id = read_or_create_vault_id(&canonical)?;
    let record = serde_json::to_vec(&VaultScopeRecord {
        canonical_path: canonical.clone(),
        vault_id,
    })
    .map_err(|error| format!("Could not encode vault access record: {error}"))?;
    fs::write(scope_record_path(&app)?, record)
        .map_err(|error| format!("Could not remember the selected vault: {error}"))?;
    Ok(canonical)
}

#[tauri::command]
fn reopen_trusted_vault<R: Runtime>(app: tauri::AppHandle<R>) -> Result<Option<PathBuf>, String> {
    let record_path = scope_record_path(&app)?;
    if !record_path.exists() {
        return Ok(None);
    }
    let record: VaultScopeRecord = serde_json::from_slice(
        &fs::read(&record_path)
            .map_err(|error| format!("Could not read the saved vault access record: {error}"))?,
    )
    .map_err(|error| format!("The saved vault access record is invalid: {error}"))?;
    let canonical = canonical_vault(&record.canonical_path)?;
    if canonical != record.canonical_path {
        return Err(
            "The saved vault now resolves to a different location. Select it again to continue."
                .into(),
        );
    }
    let marker = canonical.join(VAULT_ID_MARKER);
    let current_id = fs::read_to_string(marker).map_err(|_| {
        "The saved vault is unavailable or unmounted. Reconnect it, then select it again."
            .to_string()
    })?;
    if current_id.trim() != record.vault_id {
        return Err(
            "A different folder or drive is now at the saved vault location. Select the vault again."
                .into(),
        );
    }
    grant_vault(&app, &canonical)?;
    Ok(Some(canonical))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            app.store("mindmap-app.json")?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            trust_selected_vault,
            reopen_trusted_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{canonical_vault, read_or_create_vault_id, VAULT_ID_MARKER};
    use std::fs;

    #[test]
    fn canonical_vault_accepts_owned_directory() {
        let dir = std::env::temp_dir().join(format!("mindmap-vault-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(canonical_vault(&dir).unwrap(), dir.canonicalize().unwrap());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn canonical_vault_rejects_missing_and_file_paths() {
        let missing = std::env::temp_dir().join("mindmap-definitely-missing-vault");
        assert!(canonical_vault(&missing).is_err());

        let file = std::env::temp_dir().join(format!("mindmap-vault-file-{}", std::process::id()));
        fs::write(&file, b"not a directory").unwrap();
        assert!(canonical_vault(&file).is_err());
        fs::remove_file(file).unwrap();
    }

    #[test]
    fn vault_identity_is_stable_and_rejects_invalid_markers() {
        let dir = std::env::temp_dir().join(format!("mindmap-id-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let first = read_or_create_vault_id(&dir).unwrap();
        assert_eq!(read_or_create_vault_id(&dir).unwrap(), first);
        fs::write(dir.join(VAULT_ID_MARKER), "not-an-id").unwrap();
        assert!(read_or_create_vault_id(&dir).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn canonical_vault_rejects_filesystem_root() {
        assert!(canonical_vault(std::path::Path::new("/")).is_err());
    }
}
