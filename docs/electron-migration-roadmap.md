# XDeck → Electron Migration Roadmap

**Targets:** macOS, Windows, Linux. (No mobile.)
**Goal:** one Electron codebase whose UI is near-identical to the current SwiftUI app, built with Tailwind CSS. UI fidelity is the part that must be tested well.

---

## 1. What we're porting

The Swift app is ~1,300 lines. Every behavior below must survive the port.

| Area | Swift source | Behavior to preserve |
|---|---|---|
| Config | `Config/AppConfig.swift` | `~/.config/XDeck/settings.json`, created from the bundled default if missing; `schema.json` rewritten on every launch. Column types `forYou`, `following`, `notifications`, `profile`, `custom(url)`; optional `columnWidth`. |
| Login | `View/LoginView.swift` | Padded webview on `x.com/login`. Columns appear once the username is extracted. |
| Columns | `View/ContentView.swift` | Horizontal scroll of webviews. The leftmost X column is `columnWidth + 68` (keeps X's side nav). The other X columns hide `header` and the post area. With no `columnWidth`, width = `(windowWidth − 68) / count`. Width × `pageZoom`. |
| Media overlay | `detectMediaOverlay` | Opening `/photo/N` or `/video/N` expands that column to full width and the others go to width 0. `popstate` collapses it. |
| Injected JS | `WebViewConfigurations.swift` | `findUserName`, `findThemeColor` (500 ms debounce), `clickForYouTab`, `clickFollowingTab`, `hideSideHeader`, `hidePostArea`, `hideAds`/`showAds` (impression-pixel rule, #46). |
| Webview behavior | `View/WebView.swift` | Custom Safari UA. Clicked links open in the system browser. JS `alert()` → native alert. Native file picker. |
| Toolbar | `ContentView.swift` | GitHub icon, version/update button, sun/moon dark toggle, Hide Ads toggle, "Buy me a coffee" bordered button, shortcut hints. 24 px group gap, 8 px inner gap, 1 px top border, own horizontal scroll. |
| Theme | `ContentView.swift` | Background follows X's `theme-color`. Border `#EFF3F4`/`#38444D`, text `#536471`/`#8b98a5`, dark default `#17202A`. The dark toggle sets the `night_mode` cookie and reloads; the toggle is disabled until the theme is confirmed (5 s timeout). |
| Shortcuts | hidden buttons | ⌘+ / ⌘- zoom ±0.2, ⌘. reset, ⌘R reload all, ⌘F fit window (only with `columnWidth`), ⌘, settings dialog. |
| Window | `XDeckApp.swift` | Hidden title bar. 1280×900 default. Frame **never** restored. Auto-fit width to content once, clamped to the screen. |
| Persistence | `@AppStorage` | `pageZoom`, `isDarkMode`, `hideAds`. |
| Update check | `UpdateButton.swift` | HEAD `releases/latest`, parse `/tag/([0-9]+\.[0-9]+)`, numeric compare. |

---

## 2. Key architecture decision: columns are `<webview>` tags in the React layout

The Tauri attempt failed on **native child views positioned over HTML placeholders**:
- clipped edges from DPI rounding;
- resize flicker;
- controls ending up under the taskbar;
- horizontal swipes trapped inside the column.

Electron's equivalent (`WebContentsView` + `setBounds`) has the same shape of problem, so we **don't use it for columns**.

Instead, each column is an Electron **`<webview>` element** inside the React DOM:

| Concern | Native overlay (Tauri / `WebContentsView`) | `<webview>` tag (chosen) |
|---|---|---|
| Layout | Rect sync over IPC every frame | Plain CSS/flex, the same code as the toolbar |
| Resize / scroll | Repaint lag, flicker | Composited by Chromium like any element |
| DPI rounding | Manual device-px workarounds | Chromium handles it |
| Horizontal swipe over a column | Trapped in the child | Chromium scroll chaining (guest → embedder); **verify in Phase 0** |
| Messages from x.com | Remote IPC capability | Webview preload → `ipcRenderer.sendToHost` → `<webview>` `ipc-message` event; never reaches the main process |
| Theme colour | Injected observer | Built-in `did-change-theme-color` event, plus the existing script as a fallback |
| Media overlay | `history.pushState` monkey-patch | Built-in `did-navigate-in-page` event; no page patching |

**Rejected alternatives:**
- `<iframe>` with `X-Frame-Options` stripped: x.com's cookies become third-party in a frame, so login breaks.
- `WebContentsView`: see above.

Electron's docs discourage `<webview>` for new apps, but it's still supported and maintained, and apps such as Ferdium depend on it. That's a known dependency risk (§7), so the column component is isolated behind one interface in case it ever has to change.

### Process layout

```
main process (Node)                         renderer (React + Tailwind)
├─ config.ts   settings.json + schema       ├─ Toolbar, toggles, dialogs
├─ store.ts    pageZoom/isDarkMode/hideAds   ├─ ColumnStrip  ─ flex row of <XColumn>
├─ window.ts   size, fit, work-area clamp    │     └─ <webview partition="persist:x"
├─ menu.ts     accelerators                  │           preload=column-preload.js
├─ update.ts   HEAD releases/latest          │           useragent=Chrome UA>
└─ security.ts link handling, permissions    └─ preload (contextBridge: config, store, update)

column-preload.js (runs inside each x.com webview, isolated world)
  findUserName · hideAds/showAds · hideSideHeader · hidePostArea · click tabs
  → ipcRenderer.sendToHost({type, body}) → <webview> 'ipc-message' in the renderer
```

### Security baseline
- **Shell window:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: true`, and a strict CSP.
- **Webviews:**
  - `will-attach-webview` in main **forces** `preload` and `partition` and strips `nodeIntegration`, so the page can't upgrade itself.
  - The preload exposes **nothing** to the page's main world.
- **Links:**
  - `setWindowOpenHandler` and `will-navigate` on webview contents send any non-x.com/twitter.com URL to `shell.openExternal`.
  - `openExternal` only allows `https:`.
- **Permissions:** `session.setPermissionRequestHandler` denies everything except what X needs (e.g. notifications, if ever wanted).

### Per-platform notes
- **User agent:** a current Chrome UA set on the `persist:x` session. The default Electron UA contains `Electron/x` and X may block it.
- **Shortcuts:** focus usually sits inside a webview, so shortcuts come from the **app menu accelerators** (all OSes) plus `before-input-event` on webview contents as a backstop. The menu bar is hidden on Windows/Linux (`autoHideMenuBar`); accelerators still fire. Labels say `⌘` on macOS and `Ctrl` elsewhere.
- **Window:** `titleBarStyle: 'hiddenInset'` on macOS; native frame on Windows/Linux. No window-state restore. **Clamp the initial size to the display's `workArea`** (a lesson from the Tauri spike: the 900 px window went under the Windows taskbar on a 1280×800 display).
- **Config path:** `~/.config/XDeck/` on macOS/Linux and `%USERPROFILE%\.config\XDeck\` on Windows, the same file and schema as today.

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Electron** (latest stable) | Same Chromium on all 3 OSes, so the UI renders identically everywhere |
| Build | **electron-vite** | One Vite config for main / preload / renderer, with HMR |
| Packaging | **electron-builder** | dmg + zip / NSIS / AppImage + deb + rpm; built-in notarization; custom `artifactName` keeps `XDeck-X.Y.zip` for Homebrew |
| UI | **React 19 + TypeScript (strict)** | |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`, `@theme` tokens = the Swift hex values) | |
| Primitives | **shadcn/ui on Radix** (Switch, AlertDialog, Button) | Accessible, restyled to match SwiftUI exactly |
| State | **Zustand** | |
| Persistence | **electron-store** (main process) | Replaces `@AppStorage` |
| Validation | **Zod** for `settings.json`, shared by main and renderer | Clear error screen instead of "Failed to load config file" |
| Icons | The existing GitHub / Sun / Moon SVG paths ported 1:1; **lucide-react** `Coffee` for `cup.and.saucer.fill` | Pixel parity |
| Lint/format | **Biome** | |
| Tests | **E2E only: WebdriverIO + `wdio-electron-service`** (Mocha runner), with `@wdio/visual-service` for screenshot comparison | Drives the real packaged app on all 3 OSes. See §5 |

### Repo layout

```
XDeck/                 # Swift app, deleted at cutover (Phase 5)
src/
  main/                # config, store, window, menu, update, security
  preload/             # shell preload (contextBridge)
  column-preload/      # injected X scripts (TS), one module per Swift script
  renderer/            # React app: components/, columns/, theme/tokens.css
e2e/
  specs/               # WebdriverIO specs (one per feature area)
  configs/             # settings.json variants used by the specs
  fake-x/              # local fake x.com fixture server
  baselines/<os>/      # screenshot baselines (Swift goldens + approved app shots)
tools/swift-snapshots/ # renders SwiftUI views to PNG goldens + ui-spec.json (run once, before cutover)
```

---

## 4. Phases

### Phase 0 — Spike: prove the column model (≈1 week). Gate for everything else.

Run on **Windows at 150% scaling, macOS and Linux**. The spike passes only if a **human** confirms every one of these. They are the exact failures seen in the Tauri spike:

1. 4 `<webview>` columns (one real x.com, three fixture pages with a 1 px red border on all four edges): **all four edges visible**.
2. Drag-resizing the window: no lag, flicker or misplaced columns.
3. Scrolling the strip, hiding a column and expanding one: the columns follow instantly.
4. **Two-finger horizontal touchpad swipe over a column scrolls the strip.** Vertical swipe scrolls inside the column. An X media carousel keeps its own horizontal swipe.
5. Clicking into a column and typing: focus follows.
6. The window fits the work area, and every control is clickable.
7. Login on x.com works with the Chrome UA; the session survives an app restart (`persist:x`).

Automated evidence: the first version of the WebdriverIO `columns` spec (§5.4), using real-window pixel captures (`BrowserWindow.capturePage()`), not element-rect readback.

**If check 4 fails** (no scroll chaining from guest to embedder), fall back to forwarding horizontal `wheel` from the column preload via `sendToHost`. That's cheap with `<webview>`, because no main-process IPC or capability is involved. Decide before Phase 1.

### Phase 1 — Scaffold (≈3 days)
electron-vite + React + Tailwind v4 + shadcn + Biome + WebdriverIO E2E skeleton (one smoke spec that launches the built app). Test hooks (§5.1) and the security baseline (§2) from day one. CI: lint, typecheck, build, and the E2E suite on macOS, Windows and Ubuntu (Linux under `xvfb`).

### Phase 2 — Feature parity (≈2 weeks)
Config + Zod error screen. Column strip from config (widths, the +68 rule, zoom). Column preload scripts ported from Swift **verbatim first**. Login → username → columns. Theme sync + dark toggle (cookie + reload, disabled state, 5 s timeout). Hide Ads. Media overlay via `did-navigate-in-page`. Shortcuts. Settings dialog → `shell.openPath(configDir)`. Window fit + work-area clamp. Update button.

### Phase 3 — UI fidelity (≈1–1.5 weeks, overlaps Phase 2)
Build the components against **Swift golden screenshots** and `ui-spec.json` (§5.3). Generate the goldens on a Mac **early (during Phase 0/1)**, while the Swift app still builds:
- system font stack at 13 px;
- SwiftUI `.bordered` button;
- 60×30 toggles with a 20 px knob and the exact knob offsets;
- 150 ms linear animation;
- disabled opacity 0.5;
- pointer cursors;
- accent colour from `systemPreferences.getAccentColor()` (it's empty in the Swift asset catalogue, so the app uses the system accent).

### Phase 4 — Packaging & release (≈1 week)
- **Matrix workflow, run by hand with version `X.Y`** (no `v`; it was started by a pushed tag until 2026-10-12).
- **macOS:**
  - universal build, signed with the existing Developer ID secrets (`BUILD_CERTIFICATE_BASE64` → `CSC_LINK`, `P12_PASSWORD` → `CSC_KEY_PASSWORD`), notarized with `APPLE_ID` / `APPLE_APP_PASSWORD` / `APPLE_TEAM_ID`;
  - the artifact stays **`XDeck-X.Y.zip` containing `XDeck.app`**, so the Homebrew cask keeps working;
  - `appId` is `io.github.sadik-malik.xdeck` (changed 2026-10-11: the author is now sadik-malik).
- **Windows:** NSIS installer, **unsigned for now**. SmartScreen will warn on first install ("Windows protected your PC" → More info → Run anyway); say so in the README and release notes. Signing can be added later without changing anything else.
- **Linux:** AppImage + deb + rpm.
- **Icon:** check whether electron-builder compiles the Icon Composer `XDeck.icon`. If not, generate `.icns`/`.ico`/`.png` from `xdeck-icon.svg`.
- **Updates:** the update button keeps the same regex. `electron-updater` for Windows/Linux is optional, later.
- Update `CLAUDE.md` with the new release process.

### Phase 5 — Beta & cutover
- Ship `4.0` as a GitHub pre-release on all 3 OSes, alongside Swift `3.x`.
- On first run (macOS), migrate `pageZoom` / `isDarkMode` / `hideAds` from the old `me.morishin.XDeck` defaults.
- **X login can't migrate** (WKWebView → Chromium storage), so show a one-time "please log in again".
- After one clean stable cycle, delete `XDeck/`, `XDeck.xcodeproj`, `ExportOptions.plist` and the Xcode release job.

**Total ≈ 6–8 weeks.**

---

## 5. Testing strategy: end-to-end only

Every test drives the **real, built Electron app** with **WebdriverIO + `wdio-electron-service`**. There are no unit or component tests. Things that would normally be unit-tested (column geometry, the injected X scripts, component styling) are asserted through the running app instead.

The renderer is Chromium on every OS, so one suite covers macOS, Windows and Linux. CI runs it on all three (Linux under `xvfb`).

> **Update 2026-10-10:** the user decided the suite runs against **real x.com with a real X account**. The fake X server and the `XDECK_X_ORIGIN` / `XDECK_FIXTURE_ORIGIN` hooks were removed from the app and the tests. `pnpm e2e:login` opens the app once on a persistent test profile outside the repo (`~/.xdeck-e2e/profile`, override `XDECK_E2E_PROFILE`), and the user logs in there. Every worker session starts from a fresh copy of that profile. Consequences:
> - the X specs need network access and that login, so **CI can only run the X-independent specs** (smoke, config);
> - the red-border pixel checks became "the guest viewport never exceeds its column box";
> - the hostile-username and static-page `waitForElement` checks have no real-X equivalent, so the code stays but is untested;
> - Hide Ads can only be proven when X shows the account ads; otherwise those tests report as skipped.
> The fake-X details below are kept only as history.

### 5.1 Test hooks (debug/test builds only)
These are compiled out of release builds:
- `XDECK_CONFIG_DIR`: points the app at a test `settings.json` from `e2e/configs/`, so specs can launch with any column setup.
- ~~`XDECK_X_ORIGIN`: fake X server~~ (removed 2026-10-10; see the update above).
- `XDECK_USER_DATA`: a fresh temporary profile per spec, so no state leaks between runs.

### 5.2 Feature specs (`e2e/specs/`)
| Spec | Asserts |
|---|---|
| `login` | Login page shown → log in on fake X → columns appear with the right profile URL. Restart → still logged in (`persist:x`). |
| `layout` | For several `settings.json` variants, the measured `<webview>` widths are **exact**: `columnWidth: 380` with 4 X columns → `448, 380, 380, 380`; no `columnWidth` at 1280 → `(1280−68)/4` with the first column `+68`; 1 column; zoom 1.2 / 0.8 via shortcuts; a non-X `custom` column gets no `+68`. |
| `media-overlay` | Opening `/photo/1` in a column expands it to full width (or `−68` when it's the leftmost X column) and the others go to 0; Back restores them. |
| `theme` | Background follows fake X's `theme-color`. The dark toggle sets the cookie, reloads, stays disabled until confirmed, and re-enables after the 5 s timeout if no confirmation comes. |
| `hide-ads` | Ad cells are hidden, **video tweets stay visible**, and toggling off restores the ad cells. |
| `scripts` | Non-leftmost X columns hide the header and post area; the For you/Following tabs get clicked. |
| `shortcuts` | Zoom ±/reset, reload all, fit window (only with `columnWidth`), settings dialog — sent while focus is **inside a column**. |
| `window` | The initial window fits the display work area; fit-to-content is clamped to the screen; size isn't restored across launches. |
| `links` | A non-X link opens externally (stub `shell.openExternal` and assert the URL) and the column doesn't navigate. |
| `update` | The update button shows "available" or "current" against a stubbed releases endpoint. |
| `config-error` | Invalid `settings.json` → readable error screen, not a crash. |

### 5.3 UI fidelity (the priority)
"Nearly the same UI" means **exact geometry, exact colours, and screenshots within a tolerance**. All three are checked in the running app:
1. **Swift goldens.** Before the Swift app is deleted, `tools/swift-snapshots` renders the real SwiftUI views to PNGs (toggles on/off/disabled, update-button states, toolbar light/dark, settings alert) and exports `ui-spec.json` (sizes, paddings, hex colours). This runs once on a Mac. The outputs are committed to `e2e/baselines/` and become the reference for good.
2. **Exact spec assertions** (`ui-fidelity` spec): WebdriverIO runs `getBoundingClientRect` / `getComputedStyle` in the renderer and compares against `ui-spec.json` **exactly**:
   - toggles 60×30 with a 20 px knob and the Swift knob offsets;
   - toolbar gaps 24 / 8 px and padding;
   - 1 px top border `#EFF3F4` / `#38444D`;
   - text colours `#536471` / `#8b98a5`;
   - background colours.
3. **Screenshot comparison** with `@wdio/visual-service`:
   - element screenshots of the toolbar, each toggle state and the settings dialog vs the Swift goldens (≤ 1 % for icons/toggles, ≤ 3 % for text, which renders differently per OS);
   - full-window screenshots vs approved per-OS baselines.

   Baseline updates need the `ui-baseline-update` PR label and a reviewer looking at the diff images.

### 5.4 Column integrity (the Tauri lessons)
A `columns` spec checks the failures seen in the Tauri spike, using **real window pixels** (`BrowserWindow.capturePage()`), never element rects alone:
- all four red border edges of every fixture column are present, before and after resize, strip scroll, hide and expand;
- a synthesized **horizontal wheel over a column** (`webContents.sendInputEvent({ type: 'mouseWheel', deltaX })` on the column's contents) scrolls the strip, and a vertical wheel scrolls inside the column without moving the strip;
- every toolbar control is reachable (hit-tested at its centre).

### 5.5 Human sign-off
Some things can't be automated: real touchpad gestures, perceived resize smoothness, real X login.

Phases 0, 2 and 3 end with the 7-item checklist from Phase 0, done by a person on Windows (150 %), macOS and Linux.

## 6. Compatibility contracts (must not break)
- Tag format **`X.Y`**, no `v`. electron-builder needs semver, so CI sets `version: X.Y.0` from the tag.
- macOS release asset **`XDeck-X.Y.zip`** containing `XDeck.app` (Homebrew cask URL).
- Update-check regex `/tag/([0-9]+\.[0-9]+)`.
- Bundle ID `io.github.sadik-malik.xdeck` (was `me.morishin.XDeck` in the Swift app).
- Config file location and JSON schema.

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `<webview>` discouraged upstream, could be deprecated | Low–Medium | Isolate it behind `<XColumn>`; track Electron release notes; `WebContentsView` is the fallback with the lessons from §2 |
| Horizontal swipe doesn't chain from guest to embedder | Medium | Phase 0 check 4; preload `wheel` → `sendToHost` fallback |
| X blocks or degrades the Electron/Chrome UA or login | Medium | Real Chrome UA on the session; Phase 0 check 7 |
| App size (~100 MB+) and memory (one renderer per column) vs. a few-MB Swift app | Certain | Accept; measure per-column memory in Phase 0 and document it |
| Font rasterization makes pixel diffs noisy | High | Tolerances + exact geometry/colour assertions (§5.3) |
| E2E-only suite is slower and harder to debug than unit tests | Medium | One spec per feature, fresh profile per spec, fake X server (no network), screenshots + logs saved on failure |
| Liquid Glass `.icon` unsupported by electron-builder | Medium | Fall back to `.icns` from the SVG |
| macOS users lose their X session on upgrade | Certain | Release notes + one-time re-login notice |
| Windows SmartScreen warnings (shipping unsigned) | Certain | Accepted for now; README/release-notes instructions; add signing later |

---

## 8. Decisions (confirmed 2026-10-10)
- **Real-X E2E:** tests use a real X account; the fake X server is gone (see §5).
- **UI:** shadcn/ui components with Tailwind for all UI.
- **New beyond Swift: resizable and reorderable columns (TweetDeck-style).**
  - Each column gets a slim header (its name plus a drag grip).
  - Dragging a divider grows or shrinks only that column, and the strip scrolls.
  - Dragging a header reorders the columns (dnd-kit). The visual order uses CSS `order`, so webviews are never re-parented or reloaded.
  - Widths and order are remembered per column (electron-store). `settings.json` still defines which columns exist, and `columnWidth` stays the default.
  - A "Reset layout" action restores the order and widths from `settings.json`.
  - The leftmost X column after reordering gets the +68 and X's side navigation.
  - Webviews ignore the pointer during a drag.
- **Workflow:** from 2026-10-10 the PM (Claude) implements directly in the session; there are no more subagents.
- **Hide Ads dropped (2026-10-11, TASK-038):** XDeck shows X as it is. The Swift-era Hide Ads (§1, §5.2) is gone from the app, its menus, settings and tests.

1. **Testing:** end-to-end only, with WebdriverIO + `wdio-electron-service`. No Cypress, no unit or component tests.
2. **macOS:** Electron **replaces** the Swift app (Phase 5 cutover).
3. **Windows:** ship **unsigned** for now; SmartScreen warnings are acceptable.

---

## 9. Instagram support (planned 2026-10-11; done and merged 2026-10-12, TASK-041 to TASK-051)

Instagram becomes a supported network beside X. Today it only works as a custom column (`https://www.instagram.com/`): it loads in the shared `persist:custom` session, with no header icon or title, no accounts, no unread count, and Instagram's own navigation taking room in a 380 px column.

### Phase I-1 — Instagram as its own network
- **Session and allow-list:** its own session (`persist:ig`) and origins (`instagram.com`, `www.instagram.com`), kept like X's in `src/shared/columns.ts` and `src/main/webview.ts`. No cookies shared with X or custom sites. Full screen allowed there (videos, Reels).
- **Columns:** ~~an `instagram` column type with a `view`~~ **Decided in step 1 (TASK-041):** Instagram columns are `custom` columns with an Instagram URL, the way X's search, list and bookmarks columns are stored, so settings.json and its schema do not change and any Instagram link works. `src/shared/column-kinds.ts` recognises them by host: feed, Reels, Explore, notifications (`/accounts/activity/`), messages (`/direct/inbox/`), a user and a hashtag; other Instagram pages show as "Instagram". The add-column picker has an Instagram section. Your own profile and Saved need the user name, so they wait for step 2.
- **Login:** an Instagram sign-in screen the first time an Instagram column is added. The user-name selectors live in one shared file, like X's `src/shared/x-user.ts`. "Continue with Facebook" does not work, as Google and Apple sign-in do not for X; the screen says so. Instagram's security-code and "was this you?" checks work in the window.
- **Layout:** at 380 px Instagram shows its phone layout. The column preload hides its top and bottom bars; the rail is the navigation.

### Phase I-2 — TweetDeck extras
- **Accounts:** each account records its network; several Instagram accounts, each with its own session (`persist:ig-<id>`). A column's account is network + user name, and the account menu shows a network badge.
- **Rail:** Instagram icons and unread counts on column buttons. Post asks X or Instagram and opens Instagram's create-post window for Instagram. Search offers Instagram users and hashtags.
- **Notifications:** an unread count from Instagram's page title, where it shows one (messages too, if the title carries them), feeding the badge and desktop notifications.
- **Filters:** media only, muted words, hide Reels. No ad hiding: XDeck dropped it (§8).
- **Theme:** the chrome follows the leftmost X column. A deck with only Instagram columns follows Instagram's light or dark theme.

**Theme done (TASK-047):** XDeck's Dark Mode reaches Instagram through the pages' color scheme; a deck with only Instagram columns takes the chrome's colour from Instagram's page background.

**Accounts done (TASK-049):** several Instagram accounts, each in its own session; a column's account is its network plus user name; the account menu shows a network badge. Add column offers Your profile and Saved for the chosen Instagram account.

### Phase I-3 — Polish
- Reels playback and full screen, a generic camera icon in column headers, landing page and README.

### Risks and open decisions
| Risk or decision | Notes |
|---|---|
| Meta's terms | Automated access is forbidden. Showing the user's own feed is fine; XDeck does not hide ads (§8), and filters only hide posts the user chose to filter. |
| Login checks | Meta is stricter than X with embedded browsers: expect security codes and "suspicious login" prompts. |
| E2E tests | The policy is real site, real account. Needs an Instagram test account through `pnpm e2e:login`, with less load than X (Meta locks accounts more readily). Without one, only offline checks (allow-list, sessions, schema) plus manual checks. **Open: is there a test account?** |
| Phase I-1 scope | Proposed: feed, Reels, activity, direct, profile. **Open: confirm.** |
| Branding | The landing page and README must not suggest a link with Meta. No Instagram logo as an app icon; a generic camera symbol in column headers. |

**Login redesign (TASK-043).** X's login screen was a gate in front of everything, Instagram included. It is gone: every account comes in through one login window, logged-out columns offer it, and a welcome screen greets a profile with no account.

### Order of work
1. Session, allow-list, schema, picker, recognised Instagram URLs. **Done (TASK-041).** Until step 2, an Instagram column shows Instagram's own login page, where the user can log in.
2. Login screen, user-name detection, the preload hiding Instagram's navigation. **Done (TASK-042),** with one Instagram account in the accounts menu (moved up from step 3 at the user's request): no separate login screen; Add Instagram account… opens Instagram's login in a window, and any Instagram column that shows the logged-in user also records the account.
3. Accounts across networks, rail, Post and Search. **Post done (TASK-044):** Post as Instagram opens Instagram's own create dialog in a window. Search stays X's: Instagram's web search is a panel with no URL, and the add-column picker already has Instagram User and Hashtag.
4. Unread counts, notifications and filters. **Unread and notifications done (TASK-045)**, from Instagram's page title. **Filters done (TASK-046):** Hide Reels and muted words (a muted word matches anywhere in the post, names included). Media only is X's alone: on Instagram every post is media.

Each step is its own task, branch and tests, with one full run before merging.

**Tested and merged (2026-10-12, TASK-051):** `instagram-columns.e2e.ts` checks everything that needs no Instagram login (offline too), and `instagram.e2e.ts` one feed column and one Post window on the Instagram test account.

---

## 10. Next: TanStack Store for renderer state (planned 2026-10-11, not started)

### Why
All shell state lives in `App.tsx` (664 lines, 22 `useState`s) and reaches components through props: `NavRail` takes 14 callbacks, `ColumnStrip` 14 props. The settings that main sends (`settings:changed`) are mirrored there too. The shortcut handler has to check every dialog flag one by one before it acts, and each new dialog adds another to the list (the user agent dialog, TASK-039, was the latest).

### What
`@tanstack/store` and `@tanstack/react-store`, pinned at 0.11.2 (still 0.x). Small stores in `src/renderer/src/state/`, made with `createStore(initial, actions)` so each carries its actions:
- **settings:** `AppSettings | null`, filled by the startup load and `settings:changed`. One `startSettingsSync()` replaces App's listener.
- **unread:** X's unread count per account, for the rail's badges.
- **data:** the config result, deck layouts, open deck, accounts, user name. A derived store, `createStore(() => …)`, gives the open deck (today's `openDeck()`).
- **overlay:** what is over the columns, as one value instead of nine flags: `{ kind: 'add-column', after, choice } | { kind: 'filters', key } | { kind: 'popup', page } | { kind: 'compose', account } | { kind: 'help' } | { kind: 'deck', … } | { kind: 'account-login', id } | { kind: 'remove-account', account } | { kind: 'notice', text } | { kind: 'user-agent' } | null`. Only one can be open at a time, and shortcuts act only when it is `null`.

Components read with `useSelector(store, selector)` (`useStore` is deprecated in 0.11; State section, per `write-react-code`), so `NavRail` and `ColumnStrip` lose most props. Form fields inside a dialog stay local `useState`.

### Rules
- The main process stays the source of truth for anything persisted (`settings.json`, `store.json`). Stores mirror it. A change goes through IPC, and the store takes main's answer, as App does now.
- No DOM nodes or `<webview>` refs in stores.
- No behaviour change: the E2E suite is the safety net, with one full run per step.

### Steps (each its own branch)
1. Add the packages; settings and unread stores. **Done (TASK-040 step 1):** `state/settings.ts` (`startSettingsSync`) and `state/unread.ts`; the columns report unread counts to the store directly.
2. The overlay store, and the shortcut gate becomes `overlay === null`. **Done (TASK-040 step 2):** `state/overlay.ts` (`open`, and `close(kind)`, which only closes that kind); App went from 20 `useState`s to 8.
3. The data store with the derived open deck; actions for decks, columns, filters and accounts move out of App. **Done (TASK-040 step 3):** `state/data.ts` (`dataStore`, `openDeckStore` derived with `createStore(() => …)`, `startDataLoad`, the actions); App went from 664 lines to about 380, with one `useState` left.
4. Slim `App`, `NavRail` and `ColumnStrip` down to what they render; remove the dead state. **Done (TASK-040 step 4):** `NavRail` takes no props and `ColumnStrip` only `onThemeColor`; both read `useLoaded()` (`state/loaded.ts`). The dialogs moved to `Overlays.tsx` and the shortcut handler to `shortcuts.ts`, which reads the stores when a key comes, so no ref keeps it fresh. App went from about 380 lines to about 125, and picks the screen. E2E sessions after the first started with the user name known, skipping the login screen's X page; since TASK-043 the app keeps the name itself and the E2E config seeds it in store.json.

### Risks
| Risk | Mitigation |
|---|---|
| 0.x API changes | Exact version pinned; upgrade on purpose. |
| Extra re-renders | Narrow selectors; stores split by topic. |
| A regression in a flow the tests do not reach | Steps small enough to review; full run per step; manual check of dialogs and decks. |

**Open:** approve the new dependency before step 1.

---

## 11. Facebook support (planned 2026-10-12; built 2026-10-12, TASK-050)

Facebook becomes a third network beside X and Instagram. It is built the way Instagram was (§9): Facebook columns are `custom` columns with a Facebook URL, recognised by host, in their own sessions, with accounts, logins, Post, unread counts, filters and theme. Work starts after the Instagram branch is tested and merged, on a new branch from main.

### Phase F-0: one home per network (no behaviour change)
A third network is the third repetition, so the network-specific code is extracted first (`coding-principles`). Today X and Instagram each have their own copy of these, often written as `network === 'instagram' ? … : …`:
- partitions and the account store;
- IPC;
- login window settings;
- unread keys and logged-out checks;
- account rows, the Post list and login buttons.

The extraction:
- `src/shared/networks.ts`: one entry per network, with id, name, origins, first partition and added-partition prefix, login URL, name rules, unread key, settings page and header icons.
- Main: one account module for every network's added accounts (begin, finish and cancel a login; remove; known ids). It replaces the near-copies in `accounts.ts` and `instagram.ts`. `will-attach-webview`, permissions, the Dark Mode reload and notifications loop over the networks.
- Renderer: the data store's `NETWORKS`, `LoginWindow`, the accounts menu, the Post list, `loginFor` and the add-column sections all read the same list.
- The X and Instagram E2E specs check it; by then they exist.

### Phase F-1: Facebook as its own network
- **Session and allow-list:**
  - Sessions: `persist:fb` for the first account, then `persist:fb-<id>` for each added account.
  - Origins: `facebook.com`, `www.facebook.com`, `web.facebook.com`, `m.facebook.com`. Media from `fbcdn.net` needs no entry, because the allow-list covers navigation only.
  - Permissions: full screen is allowed (videos); every other permission stays denied, so Facebook's push prompts do not work, and the README says so.
- **Link shim:** Facebook sends outbound links through `l.facebook.com/l.php?u=…` (and `lm.facebook.com`). That host is not allowed, so XDeck would cancel the navigation and send the shim URL to the browser. Instead, the webview handler unwraps `u` and sends the real https URL to the browser, still only within 5 s of a click or key press.
- **Columns:** `column-kinds.ts` recognises these pages. Other Facebook pages show as "Facebook". The add-column picker gets a Facebook section. No Messenger (decided 2026-10-12): no Messages column, and messenger.com is not allowed; a `/messages` link shows as "Facebook".

  | Column | Path |
  |---|---|
  | Feed | `/` |
  | Notifications | `/notifications` |
  | Video | `/watch` |
  | Reels | `/reel/` |
  | Groups | `/groups/feed/` |
  | A group | `/groups/<id>` |
  | A Page or person | `/<name>`, `/profile.php?id=` |
  | Marketplace | `/marketplace` |
  | Events | `/events` |
  | Saved | `/saved` |
  | Search | `/search/top?q=` |
  | A hashtag | `/hashtag/<tag>` |

- **Layout spike first (TASK-050):** at 380 px the desktop site keeps a top banner and may keep side rails. `m.facebook.com` is built for narrow screens, but it is a different app. A short spike, on a copy of the user's profile, picks one of:
  - the desktop site (www), with the preload hiding `div[role="banner"]`, the navigation and the contacts rail (`role="complementary"`);
  - m.facebook.com.

  Selectors use roles, aria attributes and links only: Facebook's class names are generated, and its text depends on the account's language.

### Phase F-2: logins and accounts
- **Account identity:** many Facebook accounts have no user name (`profile.php?id=…`).
  - A Facebook account is its numeric user id. Main reads it from the session's `c_user` cookie, with no page scraping.
  - The display name, used for labels, comes from the page (the "Your profile" link) and is kept with the id.
  - In settings.json, a Facebook column's `account` is that id; it fits the existing `[A-Za-z0-9._]{1,30}` pattern. Headers show the display name.
- **Login window:** the same `LoginWindow`.
  - A login is finished when `c_user` appears in the window's session (main's cookie `changed` event). This also covers Facebook's checkpoint and two-factor pages without knowing their paths.
  - A column is logged out when its session has no `c_user`, or its page shows Facebook's login form (`input[name="pass"]`).
- **Accounts menu:** the first account and added ones arrive together, since the F-0 code makes them cheap. Each row has:
  - a network badge;
  - Facebook's settings page in a popup;
  - a remove button, which clears the session.

  Add column offers Your profile (`/me`) and Saved for the chosen account.

### Phase F-3: TweetDeck extras
- **Post:** it works like Instagram's. A hidden window opens the feed and clicks the create-post box, which is found by role and position, not by its text. The window closes when Facebook's dialog closes. The spike checks that this is reliable; if it isn't, Post leaves Facebook out.
- **Unread and notifications:** read from Facebook's title ("(3) Facebook") under the keys `facebook` and `facebook:<id>`. They feed the Notifications column's rail badge, the app badge and desktop notifications.
- **Filters:** muted words and Hide Reels, applied to feed posts (`[role="feed"]` children / `aria-posinset`). No ad hiding (§8): Sponsored posts stay.
- **Theme:**
  - Facebook's dark mode is an account setting. When it is set to "Automatic", it follows XDeck's Dark Mode through the pages' color scheme.
  - A deck with no X or Instagram column takes the chrome's colour from Facebook's page background. The preload reports it, as it does for Instagram.

### Phase F-4: polish and tests
- **README and help:** what Facebook columns are, and what does not work: Messenger (no Messages column, no calls), push prompts, and "Log in with Facebook" on Instagram's or other sites' pages, since the sessions are separate.
- **Tests:**
  - Offline checks first: the allow-list, link-shim unwrapping, recognised URLs and schema fixtures.
  - Then one small real-Facebook spec, with few page loads and no repeated logins, as for Instagram.

### Risks and open decisions
| Risk or decision | Notes |
|---|---|
| Meta's terms | As for Instagram (§9): only the user's own feed, no automation beyond the user's clicks, no ad hiding. |
| Checkpoints and locks | Facebook flags new browsers harder than Instagram does; expect "confirm it's you" on the first login. The user agent choice (TASK-039) keeps a normal Chrome string. |
| Fragile page | Generated class names, language-dependent text and frequent redesigns. Use roles, aria labels, links and cookies only, from one shared selector file (`src/shared/facebook-user.ts`). |
| 380 px layout | Decided by the F-1 spike: the desktop site with its bars hidden, or m.facebook.com. |
| E2E tests | There is a Facebook test account (2026-10-12), logged in through `pnpm e2e:login` and used even more lightly than Instagram's: offline checks first, one small real-Facebook spec, no repeated logins, no rerun loops. |
| Messenger | Left out (decided 2026-10-12): no Messages column, no messenger.com, no calls. |
| First columns | Decided 2026-10-12: Feed, Notifications, Video, Groups, a group, a Page or person, Marketplace, Events, Your profile, Saved. Reels, Search and hashtag pages are recognised in headers but not offered in the picker. |
| Branding | No Facebook logo; generic icons in headers and the rail. The README and landing page say XDeck is not affiliated with Meta. |

### Order of work (each its own task, branch and tests)
0. Instagram's tests and merge (§9). Then F-0's network list, passing the full X run and the unchanged Instagram spec.
1. The layout spike (TASK-050), then the session, allow-list, link shim, recognised URLs and picker.
2. The login window, account identity from `c_user`, preload hiding and logged-out checks, and the accounts menu with several accounts.
3. Post, unread counts and notifications, filters, theme.
4. README, offline checks, one real-Facebook spec, a full run, merge.

**Built (TASK-050).** F-0 (`src/shared/networks.ts`, one account module) went in first with no behaviour change. The layout spike chose the desktop site: at 380 px Facebook leaves out its side columns by itself; XDeck hides its top bar and the 56 px shift below it. Names come from Facebook's page data (`CurrentUserInitialData`), the same in every language, and only when its user id matches the cookie. Post opens Facebook's own dialog through its post box. Facebook's floating Messenger dock is hidden too, found by its pencil icon's path: its only other hook is a label in the account's language.
