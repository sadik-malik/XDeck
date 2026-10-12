# TASK-001: Scaffold — electron-vite + React + Tailwind v4 + WebdriverIO E2E + CI

**Status:** IN_PROGRESS  **Branch:** `task/001-scaffold`  **Roadmap:** Phase 1, §2 (security baseline, per-platform notes), §3, §5.1

## Goal

An empty but production-shaped Electron app next to the Swift app. It opens a correctly configured window showing a Tailwind-styled placeholder, and a WebdriverIO E2E smoke suite launches the real app and passes. **No XDeck features yet.**

## Scope

1. **Project (repo root, pnpm)**, using **electron-vite**'s React + TypeScript layout:
   - `src/main/`, `src/preload/`, `src/renderer/` (`index.html` + React 19, TS strict).
   - Create `src/column-preload/` with a `.gitkeep` only.
   - **Don't** use or bundle the repo-root `public/` (it's the separate landing page). Prove it in AC6.
   - Latest stable **Electron**.
2. **Renderer**
   - Tailwind CSS v4 via `@tailwindcss/vite`, CSS-first `@theme`.
   - `src/renderer/src/theme/tokens.css` with these exact values (names may differ):
     - `x-bg-light #FFFFFF`, `x-bg-dark #17202A`
     - `x-border-light #EFF3F4`, `x-border-dark #38444D`
     - `x-text-light #536471`, `x-text-dark #8b98a5`
     - `toggle-dark-on #606D7C`, `toggle-off #BCC9D2`
   - Base font `system-ui, -apple-system, "Segoe UI", "Noto Sans", sans-serif`, 13px.
   - shadcn/ui initialised. Add only `button`, `switch`, `alert-dialog`.
   - Placeholder `App`: "XDeck" centred, plus a 48 px footer bar with a 1px top border (`x-border-light`). Nothing else.
   - Strict CSP via `<meta>` in `index.html` (`default-src 'self'`; allow only what Vite dev/HMR needs in dev).
3. **Main process (`src/main/`)**
   - `BrowserWindow`, title "XDeck", default 1280×900, **clamped to `screen.getDisplayMatching(...).workArea`** so it never extends under the taskbar or Dock. Centre it within the work area.
   - macOS: `titleBarStyle: 'hiddenInset'`. Windows/Linux: native frame, `autoHideMenuBar: true`.
   - **No window-state persistence.**
   - `webPreferences`: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: false` (TASK-002 enables it, with `will-attach-webview` hardening).
   - Deny `window.open` and navigation away from the app (`setWindowOpenHandler` → deny; `will-navigate` → prevent unless it's the dev server URL).
   - **Test hook:** when `!app.isPackaged` and `XDECK_USER_DATA` is set, call `app.setPath('userData', XDECK_USER_DATA)` before `ready`. Release builds must ignore it.
4. **Preload (`src/preload/`)**: `contextBridge` exposing `{ platform: process.platform }` only.
5. **E2E (`e2e/`)**: WebdriverIO + **`wdio-electron-service`** (Mocha). Launch the **built** app (electron-vite output via `appEntryPoint`; no packaging needed).
   - `e2e/specs/smoke.e2e.ts` asserts:
     - (a) the window title is `XDeck`;
     - (b) the renderer shows the "XDeck" heading;
     - (c) via `browser.electron.execute`, the main window's `webPreferences` really have `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`;
     - (d) the window bounds lie fully inside the display work area;
     - (e) the renderer has no `require`/`process` globals;
     - (f) `window.open('https://example.com')` from the renderer opens no new window.
   - Each spec gets a fresh temp `XDECK_USER_DATA`.
   - On failure, save a **real window screenshot** (`BrowserWindow.capturePage()`) and the renderer console log to `e2e/artifacts/` (gitignored).
6. **Tooling**
   - Biome: `pnpm lint`, `pnpm format`.
   - `pnpm typecheck` (main, preload and renderer tsconfigs).
   - `pnpm build`, `pnpm dev`, `pnpm test:e2e` (builds, then runs wdio).
   - `.gitattributes` with `* text=auto eol=lf`.
   - `.gitignore` additions: `node_modules/`, `out/`, `dist/`, `e2e/artifacts/`.
7. **CI** — new `.github/workflows/ci.yml` on push/PR to `main`:
   - matrix `macos-latest`, `windows-latest`, `ubuntu-latest`: install, lint, typecheck, build, `pnpm test:e2e`;
   - Linux runs under `xvfb-run`;
   - upload `e2e/artifacts/` on failure;
   - don't touch `release.yml`.

## Out of scope
`<webview>` columns, config loading, X scripts, the toolbar, packaging and electron-builder, Swift goldens. No Vitest, Cypress or Playwright (E2E only, per the decision).

## Acceptance criteria (paste real output)
- **AC1:** `pnpm install --frozen-lockfile` succeeds on a **fresh clone** of the branch.
- **AC2:** `pnpm lint` and `pnpm typecheck` pass.
- **AC3:** `pnpm build` succeeds.
- **AC4:** `pnpm test:e2e` passes on this machine (Windows, 150% scaling), with all 6 smoke assertions listed.
- **AC5:** Negative check: temporarily set `sandbox: false` and show that `pnpm test:e2e` **fails** on assertion (c). Then revert. Paste the failure.
- **AC6:** The build output contains nothing from the repo-root `public/` (show a listing).
- **AC7:** `git diff main --stat` shows no changes under `XDeck/`, `XDeck.xcodeproj/`, `public/` or `release.yml`.
- **AC8:** `pnpm dev` launches the app. A real window screenshot (`capturePage`) saved to your scratchpad shows the placeholder fully on-screen. Give the path; the PM will look at it.
- **AC9:** CI YAML parses (validate it with a YAML parser) and uses `xvfb-run` on Linux.

When done, write `docs/tasks/TASK-001-scaffold.report.md` (template in `docs/tasks/README.md`) and commit it.
