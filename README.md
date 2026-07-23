# Tabula Mentis

*map of the mind*

Tabula Mentis is a local-first desktop application for visual thinking and linked
notes, built with Tauri 2, React, and TypeScript. Your maps, notes, and images
stay in a folder you choose instead of an application-owned cloud service.

> **Project status:** pre-1.0 and under active development. Back up important
> vaults and review the [limitations](#limitations) before relying on it.

## Features

- Folder-based, user-owned vaults with scoped native filesystem access
- Map canvas with pan, zoom, multiple layouts, collapse/expand, and
  keyboard navigation
- Per-node notes, images, colors, scale, and typography
- Markdown notes with `[[WikiLinks]]`, backlinks, and `#tags`
- Journals and generated concept-map views
- Data-grid and tag views, map history, and external-change conflict handling
- Vault search for note content, maps, nodes, tags, and paths (`Ctrl+K`)
- CSV, text, Freeplane `.mm`, and OPML import
- JSON, CSV, Freeplane, OPML, and viewport PNG export
- Themes and configurable default node styles
- Crash-aware writes with temporary-file cleanup and recovery copies

### Content foundations

Markdown paragraph and list blocks support explicit stable IDs with a trailing
`^block-id`. The block API resolves `((block-id))` references and
`{{embed ((block-id))}}` transclusions with cycle/depth protection. Indexing
does not rewrite existing notes; assigning missing IDs is explicit.

Safe local queries support `text`, `tag`, `page`, `map`, `property`, `task`,
and `status` predicates with `AND`, `OR`, `NOT`, and parentheses. Fenced
`query` directives can be parsed without evaluating JavaScript.

The versioned plugin registry is disabled by default and accepts only reviewed,
built-in adapters with declared capabilities. It does not load vault
JavaScript, dynamically import third-party code, or expose raw filesystem
access.

## Install prerequisites

Prebuilt packages may be attached to project workflow runs or releases. Unless
the release notes say otherwise, artifacts should be treated as unsigned.

To build from source, install:

- Node.js 22 LTS (Vite requires Node.js 20.19+ or 22.12+) and npm
- The stable Rust toolchain
- The [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for
  your platform

On Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential curl file libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libwebkit2gtk-4.1-dev patchelf
```

macOS requires Xcode Command Line Tools. Windows requires Microsoft C++ Build
Tools and WebView2; current Windows installations commonly include WebView2.

## Develop, test, and build

```bash
npm ci
npm run tauri dev       # desktop development
npm run dev             # frontend-only development

npm test
npm run lint
npm run format:check
npm run build           # production frontend
npm run tauri build     # native bundles for the current platform
```

Rust checks:

```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
cargo check --all-targets --all-features
```

## Vault format and data ownership

Tabula Mentis creates and edits ordinary files inside the directory you select:

```text
MyVault/
  .mindmap-vault-id
  maps/*.map.json
  notes/*.md
  assets/
  mindmap-meta/settings.json
```

Additional metadata, recovery, journal, and node-note files may be created
within these folders. Application preferences and the remembered trusted-vault
record live in the operating system's application-data directory.

You own and control the vault directory. You can inspect, copy, synchronize, or
version it with normal filesystem tools. Keep independent backups, especially
while the format is pre-1.0. Avoid editing the same file concurrently from
multiple applications unless you are prepared to resolve conflicts.

## Security and privacy

Tabula Mentis does not require an account or cloud backend. Native code grants the
webview access only after a folder is selected, validates its canonical path,
and verifies a vault identity marker before reopening a remembered location.
The packaged app uses a restrictive content security policy.

Local-first is not the same as encrypted: vault contents are plain JSON,
Markdown, and image files. Anyone or any process with access to your user
account or vault storage may read them. Tabula Mentis currently provides neither
vault encryption nor end-to-end sync encryption. See [SECURITY.md](SECURITY.md)
for responsible vulnerability reporting.

## Limitations

- The app and vault format are pre-1.0 and may evolve.
- There is no built-in cloud sync, real-time collaboration, or encryption.
- Automated packaging does not provide Apple notarization, Microsoft code
  signing, Linux repository signing, or update-channel verification.
- Cross-platform behavior is tested in CI, but desktop integration still needs
  hands-on testing on each operating system.
- Freeplane/OPML preserve hierarchy, notes, IDs, and supported styles.
  Freeplane associative links are preserved. OPML canvas positions, images,
  and cross-links are lossy because OPML has no standard representation for
  them. XML imports reject DTD/entity declarations and enforce resource limits.

## License

Tabula Mentis is available under the [MIT License](LICENSE).
