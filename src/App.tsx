import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { MainView } from "./components/MainView";
import { MenuBar } from "./components/MenuBar";
import { CollapseIcon } from "./components/navIcons";
import { useAccessibleDialog } from "./components/useAccessibleDialog";
import { resolveTransientLinkingState } from "./mindmap/transientInteraction";
import { SearchPalette } from "./search/SearchPalette";
import { flushPendingAppSaves, useAppStore } from "./store/appStore";
import { resolveKeyAction } from "./mindmap/keymap";
import "./styles/global.css";

const ImportWizard = lazy(() =>
  import("./import-export/ImportWizard").then((module) => ({
    default: module.ImportWizard,
  })),
);
const CreateDialog = lazy(() =>
  import("./components/CreateDialog").then((module) => ({
    default: module.CreateDialog,
  })),
);
const ShortcutsModal = lazy(() =>
  import("./components/ShortcutsModal").then((module) => ({
    default: module.ShortcutsModal,
  })),
);

function Onboarding() {
  const openVault = useAppStore((s) => s.openVault);
  const createVault = useAppStore((s) => s.createVault);
  const error = useAppStore((s) => s.error);

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1>Tabula Mentis</h1>
        <p className="onboarding-tagline">map of the mind</p>
        <p>
          local maps + linked notes in a folder you pick. portable. yours.
        </p>
        <p className="hint">
          Pick a folder you own on this computer or an attached drive. If a
          saved drive is disconnected, reconnect it and select the vault again.
        </p>
        <div className="onboarding-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={() => void openVault()}
          >
            Open vault folder
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void createVault()}
          >
            Create vault in folder
          </button>
        </div>
        {error && (
          <p
            style={{
              marginTop: "1rem",
              color: "var(--danger)",
              fontSize: "0.9rem",
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function AboutModal() {
  const aboutOpen = useAppStore((s) => s.aboutOpen);
  const setAboutOpen = useAppStore((s) => s.setAboutOpen);
  const close = () => setAboutOpen(false);
  const { dialogProps, titleId } = useAccessibleDialog(aboutOpen, close);
  if (!aboutOpen) return null;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        {...dialogProps}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>About Tabula Mentis</h2>
        <p>
          Tabula Mentis. map of the mind. local mind maps and linked notes, no
          account, no cloud.
        </p>
        <p>
          How it works: pick a vault folder. maps live as JSON under{" "}
          <code>maps/</code>, notes as Markdown under <code>notes/</code>,
          images under <code>assets/</code>. open maps on the canvas, attach
          notes to nodes, jump tags and journals from the left rail.
        </p>
        <p>
          Architecture: desktop shell is Tauri. UI is React. state is Zustand.
          Rust only handles the vault trust boundary (folder picker + path
          grants). your files stay on disk so you can back them up or sync
          however you like.
        </p>
        <p className="hint">Version 0.1.0 · Tauri + React</p>
        <div className="modal-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={close}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ExternalConflictModal() {
  const conflict = useAppStore((s) => s.externalConflict);
  const reload = useAppStore((s) => s.reloadExternalDocument);
  const keepLocal = useAppStore((s) => s.keepLocalDocument);
  if (!conflict) return null;
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="external-conflict-title"
      >
        <h2 id="external-conflict-title">File changed outside Tabula Mentis</h2>
        <p>
          This {conflict.kind} has unsaved local changes. Reload the file from
          disk, or keep your local version and overwrite the external edit.
        </p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={() => void reload()}>
            Reload from disk
          </button>
          <button type="button" className="primary-btn" onClick={() => void keepLocal()}>
            Keep local
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const view = useAppStore((s) => s.view);
  const activeMapPath = useAppStore((s) => s.activeMapPath);
  const activeNotePath = useAppStore((s) => s.activeNotePath);
  const activeTag = useAppStore((s) => s.activeTag);
  const linkingFromId = useAppStore((s) => s.linkingFromId);
  const pendingLink = useAppStore((s) => s.pendingLink);
  const importOpen = useAppStore((s) => s.importOpen);
  const createDialog = useAppStore((s) => s.createDialog);
  const shortcutsOpen = useAppStore((s) => s.shortcutsOpen);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const resizing = useRef(false);
  const closeMobileNav = () => setMobileNavOpen(false);
  const mobileDialog = useAccessibleDialog(mobileNavOpen, closeMobileNav);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (view !== "map" && (linkingFromId || pendingLink)) {
      useAppStore.setState(
        resolveTransientLinkingState(view, { linkingFromId, pendingLink }),
      );
    }
  }, [linkingFromId, pendingLink, view]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [view, activeMapPath, activeNotePath, activeTag, vaultPath]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let closing = false;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void appWindow
      .onCloseRequested(async (event) => {
        // Second attempt (or destroy already in flight): let the OS close win.
        if (closing) return;
        event.preventDefault();
        closing = true;

        try {
          await flushPendingAppSaves();
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          useAppStore.setState({
            error: `Could not save all changes before closing: ${message}`,
          });
          // Still quit — never trap the user in a stuck window.
        }

        if (disposed) return;
        try {
          await appWindow.destroy();
        } catch (e) {
          closing = false;
          const message = e instanceof Error ? e.message : String(e);
          useAppStore.setState({
            error: `Could not close the window: ${message}`,
          });
        }
      })
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizing.current) return;
      setSidebarWidth(e.clientX);
    };
    const onUp = () => {
      resizing.current = false;
      document.body.classList.remove("resizing-sidebar");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [setSidebarWidth]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      if (target.closest(".ProseMirror,[contenteditable='true']")) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Allow native editing shortcuts inside text fields / note editors.
      if (isTypingTarget(e.target)) return;

      const action = resolveKeyAction(e);
      if (action === "toggle-node-panel") {
        const { view, toggleNodePanel } = useAppStore.getState();
        if (view !== "map") return;
        e.preventDefault();
        e.stopPropagation();
        toggleNodePanel();
        return;
      }

      const key = e.key.toLowerCase();
      const isUndo = (key === "z" || e.code === "KeyZ") && !e.shiftKey;
      const isRedo =
        (key === "z" && e.shiftKey) || key === "y" || e.code === "KeyY";
      if (!isUndo && !isRedo) return;

      const { activeMap, view, undo, redo } = useAppStore.getState();
      if (!activeMap || (view !== "map" && view !== "history")) return;

      e.preventDefault();
      e.stopPropagation();
      if (isUndo) undo();
      else redo();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (!ready) {
    return (
      <div className="onboarding">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  if (!vaultPath) {
    return <Onboarding />;
  }

  const shellWidth = sidebarCollapsed ? 52 : sidebarWidth;

  return (
    <div className="app-frame">
      <MenuBar />
      <button
        type="button"
        className="mobile-nav-trigger"
        aria-label="Open library navigation"
        aria-expanded={mobileNavOpen}
        aria-controls="library-navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        Library
      </button>
      <div
        className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
        style={
          {
            "--sidebar-width": `${shellWidth}px`,
          } as React.CSSProperties
        }
      >
        {mobileNavOpen && (
          <button
            type="button"
            className="mobile-nav-backdrop"
            aria-label="Close library navigation"
            onClick={closeMobileNav}
          />
        )}
        <div
          {...(mobileNavOpen ? mobileDialog.dialogProps : {})}
          ref={mobileDialog.dialogRef}
          id="library-navigation"
          className={`sidebar-host ${mobileNavOpen ? "open" : ""}`}
          aria-label={mobileNavOpen ? "Library navigation" : undefined}
          aria-labelledby={undefined}
        >
          <Sidebar
            forceExpanded={mobileNavOpen}
            onNavigate={mobileNavOpen ? closeMobileNav : undefined}
          />
        </div>
        {!sidebarCollapsed && (
          <div
            className="sidebar-resizer"
            title="Drag to resize"
            onPointerDown={(e) => {
              e.preventDefault();
              resizing.current = true;
              document.body.classList.add("resizing-sidebar");
            }}
          />
        )}
        {sidebarCollapsed && (
          <button
            type="button"
            className="nav-expand-edge"
            title="Show navigation panel"
            aria-label="Show navigation panel"
            onClick={toggleSidebar}
          >
            <CollapseIcon />
            <span>Show</span>
          </button>
        )}
        <MainView />
      </div>
      <Suspense fallback={null}>
        {importOpen && <ImportWizard />}
        {createDialog && <CreateDialog />}
        {shortcutsOpen && <ShortcutsModal />}
      </Suspense>
      <SearchPalette />
      <AboutModal />
      <ExternalConflictModal />
      {error && (
        <button
          type="button"
          onClick={clearError}
          style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            background: "var(--danger)",
            color: "white",
            padding: "0.55rem 0.8rem",
            borderRadius: 8,
            maxWidth: 360,
            zIndex: 60,
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            font: "inherit",
          }}
          title="Dismiss"
        >
          {error}
        </button>
      )}
    </div>
  );
}
