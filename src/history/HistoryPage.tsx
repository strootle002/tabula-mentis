import { useAppStore } from "../store/appStore";
import { formatHistoryTime } from "./mapHistory";

export function HistoryPage() {
  const mapHistory = useAppStore((s) => s.mapHistory);
  const mapFuture = useAppStore((s) => s.mapFuture);
  const activeMap = useAppStore((s) => s.activeMap);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const restoreHistoryEntry = useAppStore((s) => s.restoreHistoryEntry);
  const backToMap = useAppStore((s) => s.backToMap);

  const combined = [
    ...mapHistory.map((e) => ({
      ...e,
      kind: "past" as const,
    })),
    ...(activeMap
      ? [
          {
            id: "current",
            label: "Current state",
            at: Date.now(),
            kind: "current" as const,
          },
        ]
      : []),
    ...[...mapFuture].reverse().map((e) => ({
      ...e,
      kind: "future" as const,
    })),
  ].reverse();

  return (
    <div className="history-page">
      <header className="history-page-header">
        <div>
          <h2>Edit history</h2>
          <p className="hint">
            {activeMap
              ? `Tracking changes for “${activeMap.title}”. Undo / redo also work with Ctrl+Z and Ctrl+Shift+Z.`
              : "Open a mindmap to record edit history."}
          </p>
        </div>
        <div className="history-actions">
          <button
            type="button"
            className="ghost-btn"
            disabled={mapHistory.length === 0}
            onClick={undo}
          >
            Undo
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={mapFuture.length === 0}
            onClick={redo}
          >
            Redo
          </button>
          {activeMap && (
            <button type="button" className="ghost-btn" onClick={backToMap}>
              Back to map
            </button>
          )}
        </div>
      </header>

      {combined.length === 0 ? (
        <p className="hint">
          No history yet. Edit the mindmap to start recording.
        </p>
      ) : (
        <div className="history-list">
          {combined.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`history-card ${entry.kind}`}
              disabled={entry.kind === "current"}
              onClick={() => {
                if (entry.kind === "current") return;
                restoreHistoryEntry(entry.id);
              }}
            >
              <div className="history-card-top">
                <strong>{entry.label}</strong>
                <span className="hint">
                  {entry.kind === "current"
                    ? "now"
                    : entry.kind === "future"
                      ? "redo"
                      : formatHistoryTime(entry.at)}
                </span>
              </div>
              <p className="hint">
                {entry.kind === "current"
                  ? "This is the live map state."
                  : entry.kind === "past"
                    ? "Click to restore this earlier version."
                    : "Click to jump forward to this version."}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
