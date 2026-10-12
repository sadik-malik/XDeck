# TASK-002 report

**Status: all acceptance criteria met on this branch. The human checklist (7 items) is NOT run and gates Phase 0.**

**Branch:** task/002-webview-strip   **Commits:** 722fdb4, c070d92, e568349, bad52b2, c7f64c6, 8095616, aecfde7, fa010e9, plus this report commit

## Summary
- **Fake-X server** (`e2e/fake-x/server.mjs`, `pnpm fake-x`): plain Node http, port 4780 by default, serves only `e2e/fake-x/public/`. Path traversal returns 403 (checked with `..%2Fpackage.json`). Fixtures: `column.html` (1 px red fixed border, 3000 px content) and `carousel.html` (5 wide boxes plus its own horizontal scroller).
- **Column strip** (`src/renderer/src/columns/`): `ColumnStrip` is a flex row with `overflow-x: auto` above a 48 px footer (1 px `x-border-light` top border, border-box). Columns: col-0 `https://x.com/explore` at 448 px, col-1 `column.html?n=1`, col-2 `carousel.html`, col-3 `column.html?n=3`, each 380 px. `XColumn` is the only component that owns a `<webview>`.
- **Dev toggles** (unpackaged builds only): Hide col-2 sets its width to 0. Expand col-1 gives col-1 the full strip width and sets the others to 0.
- **Main-process hardening** (`src/main/webview.ts`): `webviewTag: true` on the shell. `will-attach-webview` rejects any src outside `https://x.com`, `https://twitter.com` or the fixture origin, and forces preload, `persist:x`, contextIsolation, sandbox, no node integration. Guests get a `setWindowOpenHandler` that denies everything and sends off-origin https to `shell.openExternal`. `will-navigate` and `will-redirect` to off-origin URLs are cancelled. The `persist:x` session has a Chrome user agent built from `process.versions.chrome` and deny-all permissions.
- **Column preload** (`src/column-preload/index.ts`): empty apart from a comment, built as a second preload entry, so `out/preload/column-preload.js` exists and is forced onto every guest.
- **E2E**: `e2e/specs/webview-security.e2e.ts` (assertions a to f). `wdio.conf.ts` `onPrepare` starts the fake-X server on a free port and sets `XDECK_FIXTURE_ORIGIN`. `onComplete` stops it. Smoke (c) also expects `webviewTag: true`.
- **Bugs found and fixed during the run**: (1) popups were blocked by Chromium (`disablePopups` is true by default) before `setWindowOpenHandler` ran, so https links would never reach `shell.openExternal`. Fixed by allowing popups at the guest level, while the handler still denies every window. (2) The handler opened x.com popups externally too. Fixed: only off-origin URLs go to the browser.

## Acceptance criteria
- [x] **AC1:** lint, typecheck, build all exit 0 on HEAD fa010e9.
  ```
  $ biome check .
  Checked 38 files in 32ms. No fixes applied.
  lint exit=0
  $ tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && tsc -p e2e/tsconfig.json --noEmit
  typecheck exit=0
  out/main/index.js  7.03 kB
  out/preload/column-preload.js  0.01 kB
  out/preload/index.js           0.44 kB
  ../../out/renderer/index.html  0.64 kB
  build exit=0
  ```
- [x] **AC2:** smoke suite 6/6 (on HEAD, from `pnpm test:e2e`, exit 0):
  ```
  ✓ (a) window title is XDeck
  ✓ (b) renderer shows the XDeck heading
  ✓ (c) main window webPreferences are hardened
  ✓ (d) window bounds lie fully inside the display work area
  ✓ (e) renderer has no require or process globals
  ✓ (f) window.open from the renderer opens no new window
  6 passing (11.1s)
  ```
  The `XDeck` heading is an `sr-only` `<h1>` in the toolbar, so assertion (b) still passes without a visible title.
- [x] **AC3:** `webview-security` 6/6 (on HEAD):
  ```
  ✓ (a) 4 webviews attach, with the configured guest URLs
  ✓ (b) every guest has the hardened preferences, the forced preload and persist:x
  ✓ (c) a webview with an off-origin src and nodeintegration is blocked from attaching
  ✓ (d) the persist:x user agent is Chrome, not Electron
  ✓ (e) window.open in a guest opens no window and hands the URL to shell.openExternal
  ✓ (f) the guest page has no require or process globals
  6 passing (14.7s)
  Spec Files: 2 passed, 2 total (100% completed) in 00:00:36
  ```
  Notes on how each assertion works:
  - (a): col-0 is asserted by origin (`https://x.com`), because real x.com redirects a logged-out session to `/i/jf/onboarding/web?redirect_after_login=%2Fexplore`. The fixture URLs match exactly.
  - (b): `getLastWebPreferences()` on each guest shows `contextIsolation`, `sandbox` and `nodeIntegration`, and the guest's session is `persist:x`. It does **not** report `preload` or `partition`, so the forced preload is read from the attach-time `webPreferences` after our handler. A fifth guest (`column.html?n=2`) is attached for this and removed again. The four initial guests' preload is therefore not individually observed (see Deviations).
  - (c): the rogue webview is added from the renderer with `src="https://example.com"` and `nodeintegration`. After 2 s there are still 4 guests and none points at example.com.
  - (d): `session.fromPartition('persist:x').getUserAgent()` contains `Chrome/` and not `Electron`. Value on this machine: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36`.
  - (e): `window.open('https://example.com')` runs in the column-1 guest (user gesture). Window count unchanged. `shell.openExternal` mocked with `browser.electron.mock`, called with `https://example.com/`.
  - (f): `typeof require` and `typeof process` are both `undefined` in the guest's main world.
- [x] **AC4:** flipped assertion. (b) temporarily expected `sandbox` to be `false`. The app keeps `sandbox: true`. Output:
  ```
  ✖ (b) every guest has the hardened preferences, the forced preload and persist:x
  5 passing (15s)
  1 failing
  Expected: false
  Received: true
      at Context.<anonymous> (C:\Users\devel\Code\XDeck\e2e\specs\webview-security.e2e.ts:118:35)
  ```
  The spec was reverted (`git checkout --`) and `git status` was clean afterwards. The app code was never changed for this check.
- [x] **AC5:** real window pixels from `pnpm dev` with `XDECK_FIXTURE_ORIGIN=http://127.0.0.1:4780` and the fake-X server running. Captured with `BrowserWindow.capturePage()` via `XDECK_CAPTURE_PATH`.
  **Screenshot:** `C:\Users\devel\AppData\Local\Temp\claude\C--Users-devel-Code-XDeck\eeda5582-3def-40fd-9485-15de7360ac07\scratchpad\ac5-dev-window.png`
  What it shows: col-1 has the red border on the top, left, right and bottom edges. col-3 is partly outside the window's right edge (the strip is scrolled to the right), so its left, top and bottom edges are visible and its right edge is not in the frame. The carousel (col-2) has its own horizontal scroller. The two dev buttons are visible in the 48 px footer.
  The capture was taken one second after the main window loaded. Column 0 is still blank in that frame, because x.com was still rendering. A later capture of the column-0 guest shows the real x.com sign-in page (scratchpad `col0-guest.png`), so this is a timing gap, not a failure.
  An expanded-state capture (scratchpad `probe-expand.png`) shows col-1 at full width with the red border on the top, left and right edges. Its bottom edge sits at the footer boundary and is not resolvable at that scale, so I am not claiming it.
- [x] **AC6:** memory from `app.getAppMetrics()` with four columns loaded (about 8 s after load, on Windows, x.com onboarding page loaded in col-0). Working-set figures count shared pages more than once, so the column sum is an upper bound.

  | Process | Type | Working set MB | Private MB | Column |
  |---|---|---:|---:|---|
  | Browser | Browser | 115.6 | 46.9 | |
  | GPU | GPU | 324.5 | 290.2 | |
  | Network service | Utility | 64.6 | 20.3 | |
  | Audio service | Utility | 97.7 | 10.2 | |
  | Video capture service | Utility | 135.9 | 42.0 | |
  | Renderer | Tab | 231.0 | 141.7 | col-0 x.com |
  | Renderer | Tab | 86.7 | 23.4 | col-1 fixture |
  | Renderer | Tab | 89.3 | 24.9 | col-2 carousel |
  | Renderer | Tab | 90.7 | 26.2 | col-3 fixture |
  | Renderer | Tab | 88.0 | 37.7 | not a guest (probably the shell; not confirmed) |
  | Renderer | Tab | 117.2 | 28.0 | not identified |

  Total of the Tab rows: 702.9 MB working set. Total of all listed processes: 1441.2 MB. The 4 column guests account for about 500 MB of that, with x.com the largest at 231 MB (fixture columns about 87 to 91 MB each). These are Windows numbers only.
- [x] **AC7:** protected paths unchanged. `git diff main --stat -- XDeck XDeck.xcodeproj public .github/workflows/release.yml` printed nothing. Full branch diff against `main` is 23 files, all under `e2e/`, `src/`, the root config files `electron.vite.config.ts`, `tsconfig.node.json`, `package.json`, and this report.

## Horizontal-wheel observation (SYNTHETIC; the human touchpad check decides)
Probe: temporary spec (not committed), `webContents.sendInputEvent({type:'mouseWheel', x, y, deltaX, deltaY, wheelTicksX, wheelTicksY, canScroll: true})` sent to a guest with guest-relative coordinates. Strip `scrollLeft` read from the renderer.
- Over col-1 (plain column, no horizontal scroller), `deltaX: -120` twice then `+120`: strip `scrollLeft` 0 → 120 → 240 → 120. The horizontal wheel reaches the strip. Scroll chaining from guest to embedder works for this synthetic event, in both directions.
- Over the carousel (col-2), `deltaX: -120`: the carousel's own `scrollLeft` 0 → 120, and the strip stayed at 120. The carousel keeps its own horizontal scroll.
- Over col-1, `deltaY: -240`: the guest's `scrollY` 0 → 240, strip unchanged (120 → 120). Vertical scrolls inside the column.

So no wheel forwarder is needed for the synthetic case. A real touchpad sends gesture events and may latch differently, so the human check (item 4) decides whether TASK-003 needs a forwarder. No forwarder was added.

## Resolved versions
Unchanged from TASK-001 except the packages added by this task (none). Electron 44.7.0 (`process.versions.chrome` = 152.0.7977.130) · @wdio/electron-service 10.4.0 · webdriverio 9.32.0 · chromedriver 152.0.7977.130 (auto-matched by the service) · electron-vite 5.0.0 · vite 7.3.7 · typescript 7.0.2 · Node 24.19.0 on this machine.

## Deviations from spec
1. **Guest popups allowed (`disablePopups: false`).** The spec doesn't mention it, but without it Chromium blocks `window.open` before `setWindowOpenHandler` runs, so AC3(e) and the roadmap's external-link handling could never work. The handler still denies every window. Set via `Object.assign` because `disablePopups` is a runtime preference missing from Electron 44's typings.
2. **Preload not visible in `getLastWebPreferences()`.** The spec's (b) asks for it there. Electron 44 doesn't report `preload` or `partition` in that object, so (b) checks the attach-time values using a fifth guest. The four initial guests' preload is not individually observed.
3. **`will-redirect` guard added** on guests (the spec lists `will-navigate` only). Same policy: off-origin redirects are cancelled and https goes to the browser.
4. **Hide col-2 uses width 0**, not `display:none`. The guest stays attached and loaded, so re-showing it doesn't reload the page. `display:none` was the alternative. Not measured for re-show latency; the human check covers that.
5. **Smoke (b) kept passing** through an `sr-only` `<h1>XDeck</h1>` in the toolbar. The spec required "everything else unchanged", so the heading stayed.
6. **Fixture origin and dev-controls flag** are passed to the shell preload through `webPreferences.additionalArguments` (read from `process.argv`), not from the environment. Sandboxed preloads are not known to expose `process.env` in this Electron version, and I did not test that. Only unpackaged builds set them.
7. **Only exact origins** `https://x.com` and `https://twitter.com` are allowed. Subdomains such as `www.x.com` are treated as external. See Open questions.
8. **wdio config loads the fake-X server by native dynamic `import()`** in `onPrepare`. wdio transforms its config to CJS, which cannot load the `.mjs` server (top-level await and `import.meta` both fail).
9. **Popups from x.com are denied silently** (no browser open), as the spec says. Only off-origin https opens externally.
10. **Toolbar height:** 48 px including the 1 px border (border-box), matching the existing footer.

## Open questions
- **Inline-style CSP message.** When webviews are created, the renderer logs: `Applying inline style violates the following Content Security Policy directive 'style-src 'self''`. I could not find an inline style in app code. React sets styles through CSSOM, which CSP does not block. The likely source is Electron's internal `<webview>` markup, but I did not confirm it. Columns render correctly in every capture. The production CSP was not changed. Please decide whether to accept this or investigate further.
- **Login through SSO.** "Continue with Google" or Apple on x.com is off-origin, so it opens the system browser under the navigation policy. Username/password login stays in the column. Human check 7 will show whether this is acceptable.
- **Subdomains.** `www.x.com`, `mobile.x.com` and similar navigations go to the system browser under exact-origin matching. Confirm that is wanted, or allow `*.x.com` / `*.twitter.com`.
- **Network dependency.** Assertion (a) needs x.com to be reachable. I did not test offline. Column 0 would be the only failure point.
- **`Electron` in client hints.** I checked the user agent string only. I did not check `navigator.userAgentData` or the `Sec-CH-UA` headers for an Electron brand.
- **Memory.** Measured on Windows only. Two Tab processes are unidentified (table above).
- **Window size.** The column strip measured 1266 CSS px in a window set to 1280 px. I did not investigate the cause; it may be Windows frame borders.

## Needs human verification
Run from PowerShell. Use two terminals. Install first if needed: `pnpm install --frozen-lockfile`.

Terminal 1:
```powershell
cd C:\Users\devel\Code\XDeck
pnpm fake-x
```
Terminal 2:
```powershell
cd C:\Users\devel\Code\XDeck
$env:XDECK_FIXTURE_ORIGIN = 'http://127.0.0.1:4780'
pnpm dev
```
Then check:
1. Columns 1 and 3 show the red border on **all four** edges.
2. Drag-resize the window: no lag, flicker or misplaced columns.
3. Scroll the strip; click **Hide col-2** and **Expand col-1** in the footer (and their Show/Collapse counterparts): the columns follow instantly.
4. Two-finger **horizontal** swipe over col-1 or col-0 scrolls the strip. A **vertical** swipe scrolls inside the column. A horizontal swipe over the carousel in col-2 scrolls the carousel first. The synthetic check above is not a substitute.
5. Click into col-0's "Email or username" field and type: focus follows.
6. The window fits the screen and every footer button is clickable.
7. Log in to x.com in col-0. Quit the app, relaunch, and check you are still logged in. Note any SSO button that opens the system browser.

## Test-probe hygiene
Temporary probe specs (memory, wheel, toggles) were written under `e2e/specs/` and deleted before each commit. None is in the branch. Probe screenshots and JSON are in the scratchpad. The E2E failure artifacts from the AC4 run were removed from `e2e/artifacts/` (gitignored). Every process I started (fake-X, `pnpm dev` and its Electron child tree) was stopped by PID tree; port 4780 shows only TIME_WAIT connections.

## Round 1 response

**Branch:** task/002-webview-strip-r1   **Commits:** c81c311 (R1), f25401f (R2), 1b3f4f3 (R3), plus the report commit (R4 has no code change; see below)

### Summary
- **R1 (hermetic E2E):** `XDECK_X_ORIGIN` hook added (unpackaged only, loopback http only, validated by the same `devOrigin()` as `XDECK_FIXTURE_ORIGIN`). It points col-0 at `/explore` on the fake-X server and is also in the guest allow-list. `onPrepare` sets both variables; `onComplete` clears them. `e2e/fake-x/public/explore.html` is served at `/explore`. Spec (a) now expects all four guests on the fixture origin.
- **R2 (X hosts):** the allow-list is exactly `x.com`, `www.x.com`, `mobile.x.com`, `twitter.com`, `www.twitter.com`, `mobile.twitter.com`. No wildcards. New spec (g): `https://www.x.com/home` attaches; `https://x.com.evil.example/` and `https://evilx.com/` do not.
- **R3 (per-column proof):** the column preload calls `ipcRenderer.sendToHost('xdeck:preload-ready')` once and exposes nothing else. `XColumn` listens for `ipc-message` (via a callback ref) and sets `data-preload-ready="true"` on its container. Spec (b) now checks all four real columns: each guest's `session === session.fromPartition('persist:x')`, prefs `contextIsolation`/`sandbox`/no node integration, and the preload-ready flag. The fifth probe guest and the attach recorder are removed.
- **R4 (inline-style CSP report):** the source is Electron's internal `<webview>` shadow DOM, not app code. No CSP change. Measured: the iframe inside each `<webview>` fills its column exactly.

### Acceptance (R1–R4 verification)
- `pnpm lint`, `pnpm typecheck` pass on HEAD 1b3f4f3. Lint needed `pnpm format` once for formatting in the (b) rewrite; no behaviour change.
- Full `pnpm test:e2e`, three consecutive runs on HEAD 1b3f4f3, all exit 0:
  ```
  Run 1
  ✓ (a) window title is XDeck … ✓ (f) window.open from the renderer opens no new window
  6 passing (11.1s)
  ✓ (a) 4 webviews attach, with the configured guest URLs
  ✓ (b) each of the 4 columns has the hardened preferences, persist:x and the forced preload
  ✓ (c) a webview with an off-origin src and nodeintegration is blocked from attaching
  ✓ (d) the persist:x user agent is Chrome, not Electron
  ✓ (e) window.open in a guest opens no window and hands the URL to shell.openExternal
  ✓ (f) the guest page has no require or process globals
  ✓ (g) X hosts: www and mobile attach; lookalike hosts are blocked
  7 passing (19.4s)
  Spec Files: 2 passed, 2 total (100% completed) in 00:00:44

  Run 2
  6 passing (11.1s)   [smoke (a)–(f) all ✓, as run 1]
  7 passing (19.4s)   [webview-security (a)–(g) all ✓, as run 1]
  Spec Files: 2 passed, 2 total (100% completed) in 00:00:42

  Run 3
  6 passing (11.2s)   [smoke (a)–(f) all ✓, as run 1]
  7 passing (19.4s)   [webview-security (a)–(g) all ✓, as run 1]
  Spec Files: 2 passed, 2 total (100% completed) in 00:00:43
  ```
  The `…` in run 1 stands for the six smoke lines (a)–(f), which are all ✓. Runs 2 and 3 show the same test names and counts. The full logs are in the implementer's scratchpad (`final-run1..3.log`). Earlier runs were green too: three runs on c81c311 (after R1; smoke 6/6, security 6/6 each time) and one run on f25401f (after R2; smoke 6/6, security 7/7).

### R4 root cause (measured)
- A probe (temporary spec, deleted) recorded four `securitypolicyviolation`-equivalent console entries per launch: `Applying inline style violates the following Content Security Policy directive 'style-src 'self''`. The entries have `sourceId` = our bundled `out/renderer/assets/index-*.js` at the React DOM insert call site.
- A fresh `<webview>` appended in the renderer produced one `securitypolicyviolation`: `directive: style-src-elem`, `blocked: inline`, `sample: ""`, `target: WEBVIEW`.
- The `<webview>` shadow root (Electron's internal markup) holds `<style>:host { display: flex; }</style>` and `<iframe style="flex: 1 1 auto; width: 100%; border: 0px;">`. The `<style>` element is blocked: `shadowStyleSheets` = 0. The host's `display: flex` comes from our React inline style anyway.
- The iframe's rect equals its `<webview>` rect in all four columns: col-0 448×661 and col-1 to col-3 380×661 (container height 661 CSS px). Computed iframe border is 0px, so its style attribute applied.
- Conclusion: the message is from Electron's internal `<webview>` shadow DOM. App code sets no style attributes (React `style` props use CSSOM). The CSP is unchanged, with no `'unsafe-inline'`. The message appears once per `<webview>` per launch and nothing visibly breaks. Not investigated: the four `Electron Security Warning (Insecure Content-Security-Policy)` entries from `node:electron/js2c/sandbox_bundle`. They probably come from guest pages, which have no CSP of their own, but I did not check which renderer logged them.

### Deviations from the R-items
1. **R1, allow-list is additive, not a replacement.** The spec says `XDECK_X_ORIGIN` "replaces the X origin … in the guest allow-list". The real X hosts stay allowed, and the fixture origin is added beside them. Reason: R2's check that `www.x.com` attaches has to run in the same hermetic `onPrepare` run, and with a replacement it could not. The override is still used for col-0's URL, so (a) proves col-0 loads from the fixture. Please confirm this is acceptable.
2. **R2 (g) makes one real network request.** Attaching `https://www.x.com/home` starts loading the real page. The test checks only that the guest attaches, then removes it. It needs no credentials. A fully offline check would need a different probe, which I did not add.
3. **R3 does not read the preload path.** `getLastWebPreferences()` does not report `preload`, and the attach recorder is gone. The preload is proven by the `xdeck:preload-ready` message from the forced preload on each column. Only our preload sends that message.

### Files changed (by commit)
- c81c311: `src/main/webview.ts`, `src/main/security.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/columns/columnDefs.ts`, `src/renderer/src/columns/ColumnStrip.tsx`, `e2e/fake-x/public/explore.html`, `e2e/fake-x/server.mjs`, `e2e/wdio.conf.ts`, `e2e/specs/webview-security.e2e.ts`
- f25401f: `src/main/webview.ts`, `e2e/specs/webview-security.e2e.ts`
- 1b3f4f3: `src/column-preload/index.ts`, `src/renderer/src/columns/XColumn.tsx`, `e2e/specs/webview-security.e2e.ts`

### Process hygiene
Every run used wdio's own free port (`port: 0`). Port 4780 was not used. I started no long-lived process. Each `wdio` run exited normally with code 0. The temporary probe specs (`e2e/specs/zz-probe-r4.e2e.ts`) were created and deleted before each commit, and they are not in the branch.
