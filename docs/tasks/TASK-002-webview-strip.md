# TASK-002: Spike — `<webview>` column strip (Phase 0 gate, part 1)

**Status:** IN_PROGRESS  **Branch:** `task/002-webview-strip`  **Roadmap:** Phase 0, §2 (architecture, security baseline, per-platform notes)

## Goal

Prove the column model the whole port depends on: **four `<webview>` columns laid out by plain CSS** in a horizontally scrollable strip, hardened as §2 requires. The user then runs the **7-item human checklist**, which is the gate for everything else.

The automated pixel/wheel E2E spec for the columns is **TASK-003**. This task only needs the E2E checks listed under AC3.

## Scope

1. **Fake-X fixture server** (`e2e/fake-x/server.mjs`): plain Node `http`, no framework.
   - Serves static files from `e2e/fake-x/public/` on a port given by `--port` (default `4780`).
   - `column.html?n=N`: big "COLUMN N" heading, a **`position:fixed; inset:0` 1 px red border on all four edges**, and 3000 px of tall content.
   - `carousel.html`: a horizontally scrollable strip of 5 wide boxes (it stands in for an X media carousel), plus tall content.
   - Script `pnpm fake-x` runs it.
2. **Column strip (renderer)**: `src/renderer/src/columns/ColumnStrip.tsx` replaces the placeholder `App`.
   - `overflow-x: auto` flex row filling the height above a 48 px toolbar (1 px top border, `x-border-light`).
   - Columns: `col-0` = `https://x.com/explore`, **448 px** wide. `col-1` = `column.html?n=1`, `col-2` = `carousel.html`, `col-3` = `column.html?n=3`, each **380 px** wide.
   - Fixture URLs use the origin from the test hook `XDECK_FIXTURE_ORIGIN`, exposed through the shell preload (and only when `!app.isPackaged`). If it's unset, `col-1..3` show a "fixture server not configured" placeholder `<div>` instead of a webview.
   - Dev-only toolbar buttons: **Hide col-2** (width 0, or `display:none`; choose and justify) and **Expand col-1** (`col-1` full strip width, the others hidden), both toggles.
   - A small `<XColumn>` wrapper component owns the `<webview>` element, so it can be swapped later (roadmap §7).
3. **Main process: webview security (§2)**
   - Enable `webviewTag: true` on the shell window.
   - `will-attach-webview`:
     - **force** `webPreferences.preload` to the built `column-preload` script;
     - force `partition: 'persist:x'`;
     - force `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `nodeIntegrationInSubFrames: false`;
     - delete `preloadURL`;
     - **reject** (`event.preventDefault()`) any `src` whose origin isn't `https://x.com`, `https://twitter.com`, or (unpackaged only) `XDECK_FIXTURE_ORIGIN`.
   - For guest webContents (`did-attach-webview` / `web-contents-created` with type `webview`):
     - `setWindowOpenHandler` → for `https:` URLs outside x.com/twitter.com, call `shell.openExternal` and deny; otherwise deny;
     - `will-navigate` to a non-allowed origin → prevent and open externally (https only);
     - guests can't open new windows at all.
   - `persist:x` session:
     - **Chrome user agent** (no `Electron/` token; derive the Chrome version from `process.versions.chrome`);
     - deny-all permission handlers.
4. **Column preload** (`src/column-preload/index.ts`, built as its own electron-vite preload entry): **empty for now** apart from a comment. It must exist so `will-attach-webview` can force it. Expose nothing to the page.
5. **Window**: keep the work-area clamp from TASK-001. `webviewTag` is the only `webPreferences` change.
6. **Horizontal swipe: observe, don't fix yet.** Note in the report whether a horizontal wheel over a column reaches the strip natively (Chromium scroll chaining guest → embedder). **Don't** add a wheel forwarder in this task; the human check decides whether TASK-003 needs one.

## Out of scope
Config file, real column types, X scripts, theme, toolbar visuals, the pixel/wheel E2E spec (TASK-003), packaging.

## Acceptance criteria (paste real output)
- **AC1:** `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.
- **AC2:** The existing smoke suite still passes 6/6. Update assertion (c) to also expect `webviewTag: true`, and keep everything else unchanged.
- **AC3:** New `e2e/specs/webview-security.e2e.ts`. wdio's `onPrepare` starts the fixture server on a free port and sets `XDECK_FIXTURE_ORIGIN`; `onComplete` stops it. The spec asserts:
  - (a) 4 webviews attach, and their guest URLs are as configured;
  - (b) every guest's effective preferences (`getLastWebPreferences()` on the guest webContents) have `contextIsolation`, `sandbox`, no node integration, the forced preload path and partition `persist:x`;
  - (c) a webview the renderer adds with `src="https://example.com"` and `nodeintegration` attributes is **blocked** from attaching;
  - (d) the `persist:x` user agent contains `Chrome/` and **not** `Electron`;
  - (e) `window.open('https://example.com')` inside a fixture guest opens no window, and `shell.openExternal` is called with that URL (stub it in the test via `browser.electron.mock` or an equivalent from the service docs);
  - (f) the guest page has no `require`/`process`.
- **AC4:** Flipped-assertion check (as in TASK-001): temporarily make (b) expect `sandbox: false`, show the failure, then revert.
- **AC5:** A real window screenshot (via the TASK-001 `XDECK_CAPTURE_PATH` hook) from `pnpm dev` with the fixture server running. Save it to your scratchpad and give the path; the PM will look for the red borders.
- **AC6:** Memory: per-process memory from `app.getAppMetrics()` with 4 columns loaded (a table in the report).
- **AC7:** Protected paths unchanged (`XDeck/`, `XDeck.xcodeproj/`, `public/`, `release.yml`).

## Human checklist (the user runs this after review; list it in the report)
Run `pnpm fake-x` in one terminal and `pnpm dev` in another (with `XDECK_FIXTURE_ORIGIN` set; document the exact commands for PowerShell). Then:
1. Columns 1 and 3 show the red border on **all four** edges.
2. Drag-resizing the window: no lag, flicker or misplaced columns.
3. Scrolling the strip, Hide col-2 and Expand col-1: the columns follow instantly.
4. A **two-finger horizontal swipe** over col-1 or col-0 scrolls the strip; a vertical swipe scrolls inside the column; a horizontal swipe over the carousel in col-2 scrolls the carousel first.
5. Clicking into a column and typing: focus follows.
6. The window fits the screen and every toolbar button is clickable.
7. Logging in to x.com in col-0 works, and after an app restart you're still logged in.
