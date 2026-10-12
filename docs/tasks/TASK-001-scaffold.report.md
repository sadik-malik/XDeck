# TASK-001 report

**Status: INCOMPLETE. Handed back early. AC4 (E2E) is not met. AC1, AC5, AC8 and AC9 were not run.**

**Branch:** task/001-scaffold   **Commits:** b6f2737 (scaffold), 2fe6373 (import-order lint fix)

## Summary
- Project scaffolded at repo root: electron-vite 5 with `src/main`, `src/preload`, `src/renderer`, plus `src/column-preload/.gitkeep`.
- Main process: BrowserWindow with work-area clamp, `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webviewTag: false`, deny `window.open`, `will-navigate`/`will-redirect` guarded, permissions denied by default. `XDECK_USER_DATA` test hook gated on `!app.isPackaged`.
- Preload exposes only `{ platform }` via contextBridge.
- Renderer: React 19, Tailwind v4 (`@tailwindcss/vite`), tokens in `theme/tokens.css` with the exact hex values, shadcn `button`, `switch`, `alert-dialog` added. Placeholder App: centred "XDeck" heading, 48px footer with 1px `x-border-light` top border. Strict CSP meta in `index.html`.
- E2E: WebdriverIO 9 + `wdio-electron-service`, one `smoke.e2e.ts` with assertions (a) to (f). `wdio.conf.ts` launches `out/main/index.js`, sets a fresh `XDECK_USER_DATA` per spec, and on failure saves a `capturePage` PNG and browser logs to `e2e/artifacts/`.
- Tooling: Biome (`pnpm lint` passes), `pnpm typecheck` (passes), `pnpm build` (passes), `.gitattributes`, `.gitignore` additions, `.github/workflows/ci.yml` (not validated).

## Acceptance criteria
- [ ] AC1: not run. No fresh-clone `pnpm install --frozen-lockfile` was done. Install works in the working tree only through a temporary mirror `.npmrc` (see Deviations).
- [x] AC2 (lint, typecheck): `pnpm lint` exit 0 (`Checked 25 files ... No fixes applied.`); `pnpm typecheck` exit 0 (no output, all three tsconfigs).
- [x] AC3 (build): `pnpm build` exit 0. Output: `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html`, `out/renderer/assets/index--WIeVHXF.css`, `out/renderer/assets/index-Dv7Jy4MC.js` (642 kB).
- [ ] AC4 (E2E): **not met**. `pnpm test:e2e` builds, then launches Electron and chromedriver. Electron starts and the renderer process exists, but the WebdriverIO run stays at `RUNNING in chrome(152.0.7977.130)` with no spec result, until I killed it at about 35 minutes. None of the six assertions were observed. Earlier failure, now fixed: `session.defaultSession` was accessed before `app.ready` (`TypeError: Session can only be received when app is ready`, out/main/index.js:86). Cause of the hang is not yet diagnosed.
- [ ] AC5 (negative test with `sandbox: false`): not run.
- [~] AC6 (no repo-root `public/` in output): the build output contains only `out/main`, `out/preload` and `out/renderer` (no landing-page files). `public/` is not referenced by any config.
- [x] AC7 (protected paths unchanged): `git diff main --stat -- XDeck XDeck.xcodeproj public .github/workflows/release.yml` prints nothing. The full diff is 31 files, all new or root config (`.gitignore` modified).
- [ ] AC8 (`pnpm dev` screenshot): not done. There is no `capturePage` debug hook, and `pnpm dev` was not run. The dev-mode CSP is not implemented (see Open questions).
- [ ] AC9 (CI YAML parses, `xvfb-run` on Linux): `.github/workflows/ci.yml` is written with `xvfb-run --auto-servernum pnpm test:e2e` on Linux, but it has not been parsed.

## Resolved versions
electron 44.7.0 · electron-vite 5.0.0 · vite 7.3.7 · @vitejs/plugin-react 5.2.0 · tailwindcss 4.3.3 · @tailwindcss/vite 4.3.3 · react / react-dom 19.3.0 · @types/react 19.3.0 · @types/node 24.19.2 · @biomejs/biome 2.5.15 · typescript 7.0.2 · wdio-electron-service 9.2.1 (deprecated) · webdriverio 9.32.0 · @wdio/cli, local-runner, mocha-framework, spec-reporter, types 9.32.0 · @wdio/globals 9.31.3 · radix-ui 1.7.0 · class-variance-authority, clsx, tailwind-merge 3.7.0 · tw-animate-css 1.4.0 · @types/mocha · chromedriver 152.0.7977.130 (auto-downloaded by the service). The shadcn CLI 4.21.4 was run through `pnpm dlx` and is not a dependency.

## Deviations from spec
1. **npm registry blocked on this machine.** `registry.npmjs.org` resets TLS (curl exit 35 / ECONNRESET). I used a **temporary untracked `.npmrc`** (`registry=https://registry.yarnpkg.com/`, `replace-registry-host=always`). It is NOT committed. The lockfile still records `registry.npmjs.org` tarball URLs, which is correct for reviewers. A fresh-clone install on a machine with npmjs access should work, but this is unverified.
2. **pnpm 11 build approval.** Added `pnpm-workspace.yaml` with `allowBuilds`: `electron` and `esbuild` allowed, `edgedriver` and `geckodriver` denied.
3. **Electron 44 has no `postinstall`.** Its binary is not fetched on install. I added a root `postinstall` script, `node node_modules/electron/install.js`, which uses the checksum-pinned official installer. I ran it once here; `dist/electron.exe` is present.
4. **`wdio-electron-service` is deprecated** on npm ("moved to the official WebdriverIO organization", successor `@wdio/electron-service`, v10 migration guide). I kept the spec's package. **PM decision needed.**
5. **`getLastWebPreferences()` is missing from Electron 44's typings** but exists at runtime (verified with a probe app: returns `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`). The spec uses a narrow cast with a comment.
6. **shadcn:** wrote `components.json` by hand and added a root `tsconfig.json` (`@/*` path), because the CLI requires it. The CLI added a `cn` npm package; I replaced it with a local `src/renderer/src/lib/utils.ts` and added the missing `class-variance-authority`, `clsx`, `tailwind-merge`. Added `tw-animate-css` for the dialog animations. The shadcn theme file `theme/shadcn.css` uses placeholder colours.
7. **Biome config:** `css.parser.tailwindDirectives: true` (required for Tailwind v4); scope limited to app files (the repo's existing `xdeck-icon.svg` otherwise fails lint). The shadcn-generated files were formatted by `biome check --write`.
8. TypeScript 7.0.2 is used. Its tsconfig no longer accepts `baseUrl`, so `paths` uses `./`-prefixed targets.

## Open questions
- **Hang in the E2E run** (AC4 blocker). Next steps: run wdio with `logLevel: 'debug'` and a single `it` that only calls `getTitle`; check whether the service needs `browser.electron` before a window exists; check whether `XDECK_USER_DATA` reaches the app (it is set in `beforeSession`).
- **Deprecated service package:** keep `wdio-electron-service@9.2.1` or move to `@wdio/electron-service`.
- **Dev-mode CSP is not implemented.** `index.html` ships the strict meta (`script-src 'self'; style-src 'self'`). Vite dev needs style allowances, and `@vitejs/plugin-react` injects an inline React Refresh preamble, which a strict CSP blocks. The plan is a dev-only `transformIndexHtml` plugin or a nonce. Not done, so `pnpm dev` will likely show a blank window.
- **AC8 capture hook:** a dev-only env-gated `capturePage` to PNG was not added.
- `src/preload/index.d.ts` declares `window.xdeck` and is not yet imported by the renderer.

## Needs human verification
- Windows 150% visual check of the placeholder window (AC8). Not captured.

## Scrutiny points for the reviewer
- `src/main/index.ts` moved the permission handlers into `whenReady`; the earlier top-level placement crashed the app.
- `e2e/wdio.conf.ts` `afterTest` writes artifacts into `e2e/artifacts/` (gitignored). `getLogs('browser')` may not be supported by chromedriver, so console-log capture is unverified.
- `.npmrc` is **intentionally uncommitted**. The coordinator asked for it to be staged; I left it out because it points installs at a third-party mirror. Please confirm.
- Orphaned Electron processes from earlier failed runs were stopped. Only processes under `C:\Users\devel\Code\XDeck` were touched. Another project's `ezeepay-backend-repo` vitest processes were left alone.

## Round 1 response

**Branch:** task/001-scaffold   **Commits this round:** 2894f7c (R1), f7d8cb7 (R4). R3, R5 and R6 needed no code commit (see below). Final HEAD: f7d8cb7 (plus this report commit).

### Summary
- **R1 (E2E hang) fixed.** Root cause: the test hook's `app.setPath('userData', XDECK_USER_DATA)` also moves Chromium's profile directory. Chromedriver waits for `DevToolsActivePort` in its own `--user-data-dir`, never sees it, and retries for 60 s per attempt. The fix passes the same fresh temp directory to chromedriver (`--user-data-dir`) and to the app (`XDECK_USER_DATA`). The suite now passes 6/6 in about 14 s.
- Switched from the deprecated `wdio-electron-service@9.2.1` to `@wdio/electron-service@10.4.0`. Its README and v9-to-v10 migration guide say `services: ['electron']` is unchanged, and no other service config changed.
- Hard timeouts: `connectionRetryTimeout` 30 s, `connectionRetryCount` 1, mocha timeout 60 s. `pnpm test:e2e` now runs `e2e/run.mjs`, which kills the whole process tree after `E2E_TIMEOUT_MS` (default 10 min). Verified with a 6 s limit: the wrapper exited 1 with `E2E: exceeded 6000 ms`, and no XDeck Electron processes remained.
- **R2 (AC5) not run.** The `sandbox: false` negative run was denied by the auto-mode safety classifier as a security weakening. I reverted `src/main/security.ts` to `sandbox: true` straight away, and `git status` confirms it is clean. It needs your approval (see AC5 below).
- **R3 (AC1):** `.npmrc` deleted. A fresh clone of HEAD with `pnpm install --frozen-lockfile` passes with no registry override. The root `postinstall` is kept (see Deviations).
- **R4 (AC8):** dev-only CSP (serve-only Vite plugin; production policy unchanged) and env-gated capture (`XDECK_CAPTURE_PATH`, `!app.isPackaged`). `pnpm dev` screenshot taken.
- **R5 (AC9):** `ci.yml` parsed with the `yaml` package. CI runs `pnpm test:e2e`, which now uses the new service through `wdio.conf.ts`, so the workflow needed no change.
- **R6 (artifacts):** `browser.getLogs('browser')` works with this service (verified), so no alternative collection was needed. A throwaway probe spec that fails on purpose wrote the PNG and console JSON to `e2e/artifacts/`. The probe files are removed; the artifacts are copied to scratchpad `r6/`.

### Acceptance criteria
- [x] **AC1:** fresh clone of f7d8cb7 into scratchpad, `pnpm install --frozen-lockfile`, no `.npmrc`:
  ```
  + @wdio/electron-service 10.4.0
  . postinstall$ node node_modules/electron/install.js
  . postinstall: Done
  Done in 15.1s using pnpm v11.20.0
  EXIT=0
  node_modules/electron/dist/electron.exe
  ```
- [x] **AC2:** `pnpm lint` and `pnpm typecheck`:
  ```
  $ biome check .
  Checked 26 files in 17ms. No fixes applied.     (lint exit 0)
  $ tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && tsc -p e2e/tsconfig.json --noEmit
  typecheck exit=0
  ```
- [x] **AC3:** `pnpm build` exit 0:
  ```
  out/main/index.js  3.57 kB
  out/preload/index.js  0.16 kB
  ../../out/renderer/index.html  0.64 kB
  ../../out/renderer/assets/index--WIeVHXF.css  29.45 kB
  ../../out/renderer/assets/index-Dv7Jy4MC.js  642.01 kB
  ```
- [x] **AC4:** `pnpm test:e2e` exit 0 (Windows, 150 %):
  ```
  ✓ (a) window title is XDeck
  ✓ (b) renderer shows the XDeck heading
  ✓ (c) main window webPreferences are hardened
  ✓ (d) window bounds lie fully inside the display work area
  ✓ (e) renderer has no require or process globals
  ✓ (f) window.open from the renderer opens no new window
  6 passing (11.1s)
  Spec Files: 1 passed, 1 total (100% completed) in 00:00:14
  EXIT=0
  ```
- [ ] **AC5: not met, not run.** Denied by the safety classifier (`[Security Weaken]`). Planned check, pending your approval: set `src/main/security.ts` `sandbox: true` to `false`, run `pnpm test:e2e`, expect assertion (c) to fail, then revert. The file is reverted and clean.
- [x] **AC6:** the build output lists only the three app bundles, nothing from repo-root `public/`:
  ```
  out/main/index.js
  out/preload/index.js
  out/renderer/assets/index--WIeVHXF.css
  out/renderer/assets/index-Dv7Jy4MC.js
  out/renderer/index.html
  ```
- [x] **AC7:** `git diff main --stat -- XDeck XDeck.xcodeproj public .github/workflows/release.yml` prints nothing. Full `git diff main --stat` is 33 files.
- [x] **AC8:** `pnpm dev` with `XDECK_CAPTURE_PATH` set. Screenshot from `BrowserWindow.capturePage()` (dev build, dev CSP active):
  `C:\Users\devel\AppData\Local\Temp\claude\C--Users-devel-Code-XDeck\eeda5582-3def-40fd-9485-15de7360ac07\scratchpad\ac8-dev-window.png`
  It shows "XDeck" centred and the 48 px footer's 1 px top border at the bottom edge, with the whole window on screen. The window height is clamped to the work area at 150 % scaling. I did not measure the work area separately.
- [x] **AC9:** `ci.yml` parsed with `yaml@2.9.1` (taken from the pnpm store, not added to the project):
  ```
  triggers: {"push":{"branches":["main"]},"pull_request":{"branches":["main"]}}
  os matrix: macos-latest, windows-latest, ubuntu-latest
  step: E2E (Linux under xvfb)  run: xvfb-run --auto-servernum pnpm test:e2e  if: runner.os == 'Linux'
  step: E2E                     run: pnpm test:e2e  if: runner.os != 'Linux'
  ```

### R1 root cause: log evidence
Failing run, `logLevel: 'debug'`, single trivial test (`getTitle`), before the fix:
```
WARN chromedriver: DevTools listening on ws://127.0.0.1:63998/devtools/browser/...
WARN webdriver: WebDriverError: session not created: DevToolsActivePort file doesn't exist ... method "POST"
INFO webdriver: Retrying 1/3
WARN chromedriver: Starting inspector on localhost:63992 failed: address already in use   (leftover app from the previous attempt)
(retries at 05:54:34 and 05:55:34: about 60 s per attempt)
```
Passing run, same probe, after `--user-data-dir` is passed:
```
INFO webdriver: RESULT XDeck
PROBE title= XDeck
✓ gets title
1 passing (10s)    Spec Files: 1 passed, 1 total (100% completed) in 00:00:17
```
Also ruled out: the service bridge (it initialised), chromedriver/Electron mismatch (Electron 44.7.0 with Chromedriver 152.0.7977.130, which the service matched), `show: false` (the title was read, so the window was reachable), the strict CSP (the built app loads), and `XDECK_USER_DATA` (it reached the app).

### Resolved versions (changed this round)
`@wdio/electron-service` 10.4.0 replaces `wdio-electron-service` 9.2.1, which is removed. All other versions are unchanged from round 0. `pnpm-lock.yaml` records the exact resolutions.

### Deviations from spec
1. **Root `postinstall` kept (R3).** The review said to remove it only if the fresh-clone install gets the binary without it. It does not: `node_modules/electron/package.json` has no `scripts` (checked), so nothing else fetches `electron.exe`. I did not run a separate `--ignore-scripts` experiment, so this rests on that package.json check.
2. **Dev CSP (R4)** differs from production in `script-src 'unsafe-inline'`, `style-src 'unsafe-inline'` and the `ws://localhost:*` connect allowance. It is applied only in serve mode (`apply: 'serve'`). The built `out/renderer/index.html` keeps `script-src 'self'; style-src 'self'`.
3. **Capture hook (R4)** is an addition: `XDECK_CAPTURE_PATH` is read only when `!app.isPackaged`.
4. **Timeout wrapper (R1):** `e2e/run.mjs` is new and replaces the bare `wdio run` in `test:e2e`. A shell `timeout` is not portable (pnpm runs scripts through cmd on Windows, and macOS has no `timeout`).

### Open questions
- **AC5 approval.** Shall I run the `sandbox: false` negative check now, if you approve it explicitly? It is a temporary change to a security setting, reverted afterwards, which the safety rules do not allow without your approval.
- **Fuse warning.** Each run logs `electron-service: Could not verify fuse configuration: Could not find sentinel ... Electron 12 and higher`. It is only a warning, the tests pass, and I did not investigate it further.
- The status line at the top of this report (`INCOMPLETE`) is left as written, since the PM owns the header.

### Needs human verification
- AC8: look at the screenshot path above (Windows 150 % placeholder). Not checked on macOS or Linux.
- AC5: needs your go-ahead, as above.

### AC5 (flipped assertion)

Done as the flipped-assertion check that the user chose. `src/main/security.ts` was not touched. The app stays `sandbox: true`, and only the spec's expectation in assertion (c) was flipped to `false`, temporarily.

Failing run (`pnpm test:e2e`, spec line 29 flipped to `toBe(false)`):
```
✓ (a) window title is XDeck
✓ (b) renderer shows the XDeck heading
✖ (c) main window webPreferences are hardened
✓ (d) window bounds lie fully inside the display work area
✓ (e) renderer has no require or process globals
✓ (f) window.open from the renderer opens no new window
5 passing (11.2s)
1 failing
Error: expect(received).toBe(expected) // Object.is equality
Expected: false
Received: true
    at Context.<anonymous> (C:\Users\devel\Code\XDeck\e2e\specs\smoke.e2e.ts:29:27)
EXIT=1
```
Failure artifacts written to `e2e/artifacts/` (gitignored): `-c-main-window-webpreferences-are-hardened.png` (10176 bytes, real `capturePage()`) and `-c-main-window-webpreferences-are-hardened.console.json` (`[]`, no renderer console output in that test). Copies are in scratchpad `ac5/`.

Revert: `git checkout -- e2e/specs/smoke.e2e.ts`, then the rerun:
```
✓ (a) window title is XDeck
✓ (b) renderer shows the XDeck heading
✓ (c) main window webPreferences are hardened
✓ (d) window bounds lie fully inside the display work area
✓ (e) renderer has no require or process globals
✓ (f) window.open from the renderer opens no new window
6 passing (11.1s)
EXIT=0
```
The probe artifacts were deleted from `e2e/artifacts/`. `git status` shows only the untracked review file, and no Electron, chromedriver or wdio processes are left.
