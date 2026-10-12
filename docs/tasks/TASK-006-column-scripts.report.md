# TASK-006 report

**Branch:** task/006-column-scripts   **Commits:** 9725342 (fake-X pages), ed8b72d (column preload scripts), b3ba8c1 (settings store, IPC, DOM typecheck), 41f408a (setup messaging, Hide Ads checkbox), ea71e2d (electron-store load fix), 3814e3c (scripts and hide-ads specs), 86d0e7f (hide-ads waits count ads only), plus this report commit

## Summary
- **Swift column scripts ported** into `src/column-preload/` (`scripts.ts`, `hide-ads.ts`, `wait-for-element.ts`, `index.ts`). The preload runs only the scripts it is told to run, by name. It exposes nothing to the page's main world (AC4 table below).
- **Per-column wiring** follows Swift `makeColumn`. `src/shared/column-scripts.ts` (`columnScripts`) gives each column its scripts. The leftmost X column gets no header or post-area hiding. `forYou` clicks tab 0, `following` clicks tab 1, other X columns hide the header and post area, and non-X custom columns get nothing.
- **Setup messaging.** On every `xdeck:preload-ready`, `Column.tsx` sends `xdeck:column-setup` (`{ scripts, hideAds }`). A Hide Ads change goes to each guest that has reported in as `xdeck:hide-ads`. The preload applies the setup on DOMContentLoaded, or at once if the DOM is ready.
- **Hide Ads persisted** with electron-store (`store.json` in userData, default `false`). The renderer reaches it only through `settings:get` and `settings:set-hide-ads`, which accept the shell main frame only. A minimal unstyled checkbox (`data-testid="hide-ads"`) sits in the toolbar in every build.
- **Hide Ads rule** is `[data-testid$="-impression-pixel"]`, so video tweets (placementTracking with no pixel) stay visible (#46).
- **Fake X** home and notifications pages have a header, two `role="tab"` links that record clicks, the hidePostArea post-area structure, a timeline of ad, video and normal cells, and cells appended after load. The shell renders 300 ms after load, like an SPA, so the MutationObserver path is exercised.
- **E2E:** `scripts.e2e.ts` (5 tests) and `hide-ads.e2e.ts` (5 tests) pass. The full suite is green on three consecutive runs: 11 spec files, 51 tests each run.

## Acceptance criteria
- [x] **AC1** lint, typecheck and build pass (final code, after the AC3 revert):
  ```
  $ pnpm lint        -> Checked 91 files in 66ms. No fixes applied.     exit=0
  $ pnpm typecheck   -> tsc node, web, column-preload, e2e              exit=0
  $ pnpm build       -> ✓ built in 2.52s                                exit=0
  ```
- [x] **AC2** `pnpm test:e2e` green three runs in a row (each run builds first). Logs in the scratchpad: `full1.log`, `full2.log`, `full3.log`. Passing tests per file, the same in each run:
  ```
  columns.e2e.ts              10 passing
  config-open-folder.e2e.ts    1 passing
  config.e2e.ts              10 passing
  hide-ads.e2e.ts             5 passing   (new)
  layout-fractional.e2e.ts    2 passing
  layout-order.e2e.ts         3 passing
  layout-single.e2e.ts        1 passing
  layout.e2e.ts               1 passing
  scripts.e2e.ts              5 passing   (new)
  smoke.e2e.ts                6 passing
  webview-security.e2e.ts     7 passing
  RUN 1  Spec Files: 11 passed, 11 total (100% completed) in 00:04:46   exit=0
  RUN 2  Spec Files: 11 passed, 11 total (100% completed) in 00:04:55   exit=0
  RUN 3  Spec Files: 11 passed, 11 total (100% completed) in 00:04:46   exit=0
  ```
- [x] **AC3** the test can fail. Temporary sabotage in `src/column-preload/hide-ads.ts`: `AD_SELECTOR` changed to `'[data-testid="placementTracking"]'` (the pre-#46 rule). The app was rebuilt, and `hide-ads.e2e.ts` was run. Test (b) fails on the explicit video assertions:
  ```
  1) hide ads (b) Hide Ads on: ad cells hidden, video and normal tweets visible
  - Expected  - 2
  + Received  + 2

    Array [
      "block",
  -   "block",
  -   "block",
  +   "none",
      "block",
  +   "none",
    ]
      at Context.<anonymous> (e2e/specs/hide-ads.e2e.ts:82:74)
  ```
  The video cells are the `none` entries. (The first sabotage run failed with a generic "ad cells were not hidden" timeout, because the waits then counted every hidden cell. The waits were changed to count ads only, in 86d0e7f, so the failure names the video cells. The failure output above is from the changed spec.)
  **Revert:** `git checkout -- src/column-preload/hide-ads.ts`, then `git diff -- src/column-preload/hide-ads.ts | wc -c` gives `0`. The file again has `const AD_SELECTOR = '[data-testid$="-impression-pixel"]'`. The app was rebuilt on the reverted code, and the full suite ran on it (AC2).
- [x] **AC4** side-by-side (Swift → TS). Deviations are listed in full under *Deviations from spec*.

  | Swift (`WebViewConfigurations.swift`) | TS port (`src/column-preload/`) | Deviation |
  |---|---|---|
  | `global` (console and error bridge to `webkit.messageHandlers`) | not ported | Out of scope per the spec. Electron has `console-message` on the webview. |
  | `hidePostArea` (style in `<head>`) | `scripts.ts` `hidePostArea` | Same CSS selector. `textContent` instead of `innerHTML`, and `document.head` instead of `querySelector('head')`. No behaviour change. |
  | `hideSideHeader` (style in `<head>`) | `scripts.ts` `hideSideHeader` | Same CSS. Same two changes as above. |
  | `clickForYouTab` (`waitForElement` `[role='tab']`, index 0, `click()`) | `scripts.ts` `clickForYouTab` → `clickTab(0)` | None. |
  | `clickFollowingTab` (same, index 1) | `scripts.ts` `clickFollowingTab` → `clickTab(1)` | None. |
  | `hideAds` (MutationObserver, 100 ms debounce, `*-impression-pixel` rule, guarded by `window.hideAdsMutationObserver`) | `hide-ads.ts` `hideAds` | Observer kept in a module variable (isolated world), not on `window`. Same selector, debounce and `display: none`. |
  | `showAds` (disconnect observer, `display: flex` on ad cells) | `hide-ads.ts` `showAds` | Also cancels the pending debounce timer. Swift does not, so a mutation within 100 ms before the toggle would re-hide the ads. |
  | `waitForElement` (MutationObserver on `document.body`, `once`) | `wait-for-element.ts` | Verbatim. |
  | `wrapOnLoad` (scripts inside a DOMContentLoaded listener, injected at document start) | `index.ts` (`pendingSetup`, `DOMContentLoaded`) | Scripts are not injected as strings. The renderer sends a setup by name on every page load, and the preload runs it on DOMContentLoaded (or at once if the DOM is ready). |
  | `getElementsByXPath` | not ported | No script in this task uses it. It is only in Swift `global`. |
  | `findUserName`, `findThemeColor`, `detectMediaOverlay` | not ported | Out of scope (TASK-007, TASK-008, TASK-009). |

## Resolved versions
- Node 24.19.0, pnpm 11.20.0 (`pnpm --version` as reported by the install).
- electron 44.7.0 (Chromium 152.0.7977.130, from the chromedriver log), electron-vite 5.0.0, typescript 7.0.2, webdriverio 9.32.0, zod 4.6.5 (from `pnpm ls --depth 0`).
- **electron-store 11.0.2** (new runtime dependency; the latest stable at the time). The package is ESM only.

## Deviations from spec
1. **Scripts are chosen by name, not injected as strings.** `ColumnScript` names cross IPC. The preload maps each name to a fixed function (`SCRIPTS` in `index.ts`), and an unknown name is ignored. No code crosses from the renderer.
2. **Setup on every page load.** The spec says the setup is re-sent on each `preload-ready`. That is implemented. The Swift `wrapOnLoad` inline script has no equivalent, because the preload is per page load.
3. **Hide Ads observer is in the isolated world.** `window.hideAdsMutationObserver` is replaced by a module variable. The page cannot see it. The e2e spec (e) in `scripts.e2e.ts` checks that no XDeck name is visible in the main world.
4. **`showAds` cancels a pending debounced hide** (see AC4). This is a deliberate fix to a Swift race, not a verbatim port.
5. **Style nodes are created with `textContent` and `document.head`.** Same CSS and placement.
6. **Hide Ads runs after the listed scripts,** not interleaved in Swift's order. The scripts touch different DOM nodes (headers, post area, tabs and ad cells), so the order has no effect on the result.
7. **Fake X renders after load (300 ms).** This is test-only. It keeps the waitForElement MutationObserver path meaningful. A static fake page would never mutate after the preload runs.
8. **Non-X fixture is `localhost/home`, not `127.0.0.1/column.html`.** `isXColumn` (TASK-005) treats a custom column whose host equals the test origin's host as an X column. A 127.0.0.1 fixture therefore counts as X, which would give it the header and post-area scripts. The localhost origin is non-X and still allowed (it is in the custom-origin allow-list). The fixture also renders the shell (header, tabs, post area), so the spec can show that nothing touches it.
9. **electron-store is loaded with `require`, not `import`.** In the built main bundle, `import Store from 'electron-store'` became `Store is not a constructor`. Rollup's namespace helper sets `default` to the whole module, and the `default` access fails. `src/main/settings.ts` takes the class from `require('electron-store').default`. A type-only import gives the type. The store file is `store.json`.
10. **Hide Ads checkbox.** It is a native `<input type="checkbox">` inside a `<label>`. It is unstyled and sits in the toolbar in every build (the spec's placeholder). The renderer loads the settings before it shows columns, so the first setup already has the right value.
11. **Typecheck for the column preload.** `src/column-preload` was under `tsconfig.node.json` (Node lib, no DOM), so every `document` reference failed. It now has `tsconfig.column-preload.json` (ES2022 + DOM, `types: []`), and the typecheck script runs it. `tsconfig.node.json` no longer includes that folder.
12. **New fixture directory `e2e/configs/scripts/`**, mapped in `wdio.conf.ts` for `scripts.e2e.ts` and `hide-ads.e2e.ts`. Each spec file gets its own worker session, as the TASK-005 pattern requires. `hide-ads.e2e.ts` runs (e) with `browser.refresh()` of the shell, so the checkbox and the ad cells are checked after the reload, not after a relaunch. The main-process store file is read directly from `XDECK_USER_DATA`.

## Open questions
- **waitForElement fires only on a later DOM mutation.** This is Swift's behaviour, ported as is. If a tab already exists when the observer starts, and no later mutation follows, the click never happens. The fake pages render after 300 ms, so the tests cannot hit this. On real x.com, React hydration should cause later mutations, but this is not verified (it needs a login). Should a follow-up add an immediate check, which would change the Swift port?
- **Ad rule on real X.** The impression-pixel rule is checked only on the fake timeline. Whether real X ads carry `[data-testid$="-impression-pixel"]` is not checked here.
- **Hide Ads store name.** The store is `store.json` in userData. Say if a different name is wanted, before settings grow.

## Needs human verification
- **Scripts and Hide Ads on real x.com.** Tab clicks, header and post-area hiding, and ad hiding on live X pages need a login (TASK-007). Nothing here contacted x.com. Everything ran against the fake X server.
- Visual check of the Hide Ads checkbox: none needed for this task (it is a placeholder for TASK-010).

## Process hygiene
- Every wdio and `pnpm test:e2e` run was run with a time limit (the run.mjs 10-minute kill switch, and `timeout` on each direct wdio call). No run hung.
- Port 4780 was not used (the fake-X server uses port 0, and the e2e run uses an ephemeral port).
- No process from this worktree was left running (checked with `Get-CimInstance Win32_Process` for the worktree path: no output).
- `git diff main -- XDeck` is 0 bytes. Nothing under `XDeck/` was modified.
- Stray files written during work (`scratch-build.log`, `scratch-tc.log`) were removed before each commit, and `git status` is clean after the report commit.
- Failure captures from the AC3 sabotage runs are in `e2e/artifacts/` (gitignored).
- Commits carry `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. No push or merge.
