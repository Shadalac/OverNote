# Notes

A minimal offline notes app built with Tauri + Svelte, storing notes in a
local SQLite database. Runs on Windows and on Linux (including a Raspberry
Pi 5).

## Prerequisites

You need these installed once per machine you build on:

- [Node.js](https://nodejs.org/) 18+ (comes with npm)
- [Rust](https://www.rust-lang.org/tools/install) (via rustup)
- Platform build tools for Tauri — follow the "Prerequisites" section for
  your OS at https://v2.tauri.app/start/prerequisites/
  - **Windows**: Microsoft C++ Build Tools + WebView2 (WebView2 is
    preinstalled on modern Windows 10/11)
  - **Raspberry Pi OS / Debian-based Linux**: `webkit2gtk`, `libssl-dev`, and
    a few other system packages — the prerequisites page has the exact
    `apt install` command for your distro.

## Setup

```bash
npm install
```

## Run in development

```bash
npm run tauri dev
```

This opens the app in a window with hot-reload for the Svelte frontend.

## Build a release binary

```bash
npm run tauri build
```

The finished app lands under `src-tauri/target/release/bundle/` — an `.msi`
or `.exe` installer on Windows, and a `.deb`/AppImage (or similar) on Linux.
Build separately on each machine/architecture; Tauri does not cross-compile
by default.

## How it's put together

- `src/` — the Svelte UI (note list + editor)
- `src/lib/db.js` — all SQLite reads/writes, via the `@tauri-apps/plugin-sql`
  plugin. The schema is created automatically on first run.
- `src-tauri/` — the Rust shell that hosts the webview and the SQL plugin
- Notes are stored in a `notes.db` SQLite file inside the OS's per-app data
  directory (different path on Windows vs. Linux, handled automatically by
  Tauri/the SQL plugin) — nothing here talks to the network, so it works
  fully offline.

## Icons

The icons in `src-tauri/icons/` are placeholders. Once you have a logo you
like, replace `src-tauri/icons/icon.ico`-generation by running:

```bash
npm run tauri icon path/to/your-logo.png
```

which regenerates the full icon set for every platform from one source
image.

## Moving to the Raspberry Pi 5 later

The Svelte/Rust source is identical on both platforms. On the Pi, install
the Linux prerequisites (webkit2gtk, etc.), copy this project over (or
clone it from wherever you keep it), then run `npm install` and
`npm run tauri build` there to produce a native ARM64 binary. Tauri apps
are not portable binaries across architectures, so you build once on
Windows (x64) and once on the Pi (ARM64) — the code doesn't change.
