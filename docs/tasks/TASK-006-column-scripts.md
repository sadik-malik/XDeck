# TASK-006: Column preload scripts ported from Swift + Hide Ads

**Status:** IN_PROGRESS  **Branch:** `task/006-column-scripts`  **Roadmap:** §1 (Injected JS row), §2 (column preload), §5.2 (`scripts`, `hide-ads` specs)

## Goal

Port the X-page behaviours from `XDeck/WebViewConfigurations.swift` into `src/column-preload/` and wire them per column exactly as `ContentView.makeColumn` does. Read both Swift files first. **Port the logic verbatim first**; only change what the Electron model forces you to, and list each change.

## Which scripts run where (Swift `makeColumn`)
| Column | Scripts |
|---|---|
| Every X column | (Swift `global` is a debug console bridge; **don't port it**: Electron has `console-message` on the webview) |
| `forYou` | `clickForYouTab` (`a[href='/home'][role='tab']` index 0) |
| `following` | `clickFollowingTab` (same selector, index 1) |
| Leftmost X column | nothing extra here (theme detection is TASK-008) |
| Other X columns | `hideSideHeader` (`header { display:none !important }`) and `hidePostArea` (the exact Swift selector) |
| Any column, when Hide Ads is on | `hideAds` (impression-pixel rule; **the #46 fix must survive**: `placementTracking` alone is NOT an ad) |
| Non-X custom columns | **nothing** |

Out of this task: `findUserName` (TASK-007), `findThemeColor` (TASK-008), `detectMediaOverlay` (TASK-009, via `did-navigate-in-page`).

## Mechanism
- The column preload runs in the guest's **isolated world**, shares the DOM, and **exposes nothing** to the page's main world.
- After the guest sends `xdeck:preload-ready` (already implemented), `<XColumn>` sends `webview.send('xdeck:column-setup', { scripts: string[], hideAds: boolean })`. It re-sends on every `preload-ready` (each page load).
- The preload applies the scripts on `DOMContentLoaded`, or immediately if the DOM is already ready, matching Swift's `wrapOnLoad`.
- `waitForElement` is ported as-is (MutationObserver, `once`).
- **Hide Ads toggle:**
  - `hideAds` is persisted with **electron-store** in the main process (default `false`, like `@AppStorage`);
  - IPC `settings:get` / `settings:set-hide-ads`, shell-main-frame-only like the config IPC;
  - on change, the renderer sends `xdeck:hide-ads` (`true`/`false`) to every column, and the preload runs `hideAds` or `showAds` (verbatim Swift semantics: `showAds` disconnects the observer and restores `display:flex`).
- **A minimal, unstyled "Hide Ads" checkbox in the toolbar** (visible in all builds). The real toggle visuals are TASK-010.

## Fake X
Extend `/home` (and `/notifications`) to resemble X closely enough for the selectors to be meaningful:
- a `<header>`;
- two `a[href='/home'][role='tab']` tabs that record clicks (e.g. set `data-clicked` and `document.title`);
- the DOM structure Swift's `hidePostArea` selector targets (`div:has(> main):has(> :nth-child(4)) > main div:has(> div > div[role='progressbar'])`);
- a timeline of `div[data-testid="cellInnerDiv"]` cells: normal tweets, **ads** (with a `[data-testid$="-impression-pixel"]` element), **video tweets** with `placementTracking` and no impression pixel;
- a button or script that **appends more cells after load**, including a new ad, to exercise the MutationObserver path.

## E2E
- **`scripts.e2e.ts`** with a config of `forYou, following, notifications, custom(non-X fixture)`:
  - (a) col 0 clicked tab 0 only, col 1 clicked tab 1 only;
  - (b) `<header>` is visible in col 0 (the leftmost X column) and hidden in cols 1 and 2;
  - (c) the post-area element is hidden in cols 1 and 2, and visible in col 0;
  - (d) the non-X custom column is untouched (header visible, no injected `<style>`);
  - (e) the page's main world has no XDeck globals (`hideAds`, `waitForElement`, `ipcRenderer`, `xdeck` all `undefined`).
- **`hide-ads.e2e.ts`:**
  - (a) Hide Ads off → all cells visible;
  - (b) toggle on → ad cells hidden, **video tweets and normal tweets visible**;
  - (c) cells appended after load: new ads get hidden within 1 s, new normal and video tweets stay visible;
  - (d) toggle off → ad cells visible again, and an ad appended after that stays visible (observer disconnected);
  - (e) the setting is persisted (read the electron-store file, or relaunch if that's reliable) and the checkbox reflects it.

## Acceptance criteria
- **AC1:** lint, typecheck, build pass.
- **AC2:** full `pnpm test:e2e` green 3 runs in a row (summaries).
- **AC3 (the #46 regression guard can fail):** temporarily change the ad rule to `placementTracking` (the pre-#46 bug). Show that hide-ads (b) fails because the video tweets get hidden. Then revert.
- **AC4:** a side-by-side diff table in the report: each Swift script → its TS port, with every deviation explained.
- **AC5:** nothing under `XDeck/` modified.
