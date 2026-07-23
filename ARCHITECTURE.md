# Architecture

## System overview

Tabula Mentis is a local-first Tauri 2 desktop application:

- **React and TypeScript (`src/`)** render the shell, mindmap canvas, notes,
  tags, history, imports/exports, and settings.
- **Zustand (`src/store/`)** coordinates vault state, navigation, indexing,
  conflict handling, external-change watching, and serialized saves.
- **Vault services (`src/vault/`)** validate relative paths and read or write
  maps, Markdown notes, assets, settings, and recovery files through Tauri's
  scoped filesystem API.
- **Rust and Tauri (`src-tauri/`)** provide the native shell and the trust
  boundary for selecting and reopening a vault. A vault is accepted only after
  an explicit folder-picker grant, canonical-path checks, and vault identity
  verification.

The frontend is built by Vite into `dist/` and embedded in platform-native
Tauri bundles. Most domain behavior is TypeScript so it can be unit tested
without launching a desktop window; native path authorization remains in Rust.

## Data model and ownership

A vault is a user-selected directory. Maps are JSON documents under `maps/`,
long-form notes are Markdown under `notes/`, binary images are under `assets/`,
and vault settings and derived metadata live under `mindmap-meta/`. A hidden
`.mindmap-vault-id` marker prevents a remembered path from silently resolving
to a different folder or mounted drive.

Vault files are the user's data: they can be backed up, synchronized, inspected,
or versioned with ordinary filesystem tools. Writes use temporary and backup
files for crash recovery. Compatibility and recoverability take priority over
compact storage. Application preferences and the last trusted vault record are
kept in the platform app-data directory.

## Design constraints

- No cloud service or account is required.
- Renderer filesystem access stays limited to an explicitly selected vault.
- User-controlled relative paths are normalized and validated cross-platform.
- Externally edited files should be detected without overwriting either side
  silently.
- Map and note formats should remain understandable and migration-friendly.
- Accessibility, keyboard operation, and usable behavior across Linux, macOS,
  and Windows are core requirements.
