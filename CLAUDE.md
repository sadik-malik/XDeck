# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XDeck is a TweetDeck-style X/Twitter desktop client for **macOS, Windows and Linux**, built with **Electron**. Each column is an Electron `<webview>` showing x.com, laid out by plain CSS in a React + Tailwind shell. A column preload selects the home timeline tab, applies column filters and finds the logged-in user's name. XDeck shows X as it is: there is no ad hiding (dropped, TASK-038).

It was ported from a SwiftUI/WKWebView macOS app, which has been removed. The plan and decisions are in `docs/electron-migration-roadmap.md`, and task history is in `docs/tasks/`. The author and maintainer is **sadik-malik** (repo `sadik-malik/XDeck`).

## Build & Run

- Package manager: **pnpm** (Node 24). Install: `pnpm install`.
- Dev: `pnpm dev`. Build: `pnpm build` (electron-vite → `out/`).
- Lint/format: `pnpm lint` / `pnpm format` (Biome). Typecheck: `pnpm typecheck`.
- Git hooks: lefthook (`lefthook.yml`, installed by `pnpm install`). Before each commit, Biome fixes and lints the staged files (and stages its fixes), and `pnpm typecheck` runs when TypeScript files are staged.
- Packages: `pnpm dist:win` / `dist:mac` / `dist:linux` (electron-builder → `dist/`). Icon: `pnpm icon` renders `xdeck-icon.svg` (staggered columns on blue, TASK-028) to `build/icon.png` (packages), `resources/icon.png` (the window and taskbar icon, also when run from the repo) and the landing page's `public/assets/icon.png`.

## Architecture

- `src/main/`: the main process.
  - `index.ts`: app startup.
  - `config.ts` and `config-ipc.ts`: `settings.json`.
  - `webview.ts`: webview hardening, partitions, the allow-list and the columns' user agent (TASK-039: a preset or custom string from `src/shared/user-agents.ts`, set on every column session and open page; Settings → User Agent… in the rail).
  - `menu.ts`, `view.ts` and `theme.ts`: the app menu: zoom, reload, fit window, dark mode, updates, links. The UI never names settings.json (TASK-032): there is no menu item to edit it, and the settings error screen only offers its folder.
  - `settings.ts` and `settings-ipc.ts`: electron-store for dark mode, zoom, desktop notifications, the user agent and the column layout.
  - `notifications.ts`: desktop notifications and the app badge from X's unread count, which the renderer reads from X's page titles (X's web push doesn't reach Electron).
- `src/preload/`: the shell preload. It exposes a small, validated `window.xdeck` bridge.
- `src/column-preload/`: runs in each x.com guest's isolated world and exposes nothing to the page. It holds the X scripts: tab clicks, side-header and post-area hiding, column filters, and the user-name lookup. In Instagram columns it hides Instagram's top and bottom bars and reports the logged-in Instagram user name (`src/column-preload/instagram.ts`, selectors in `src/shared/instagram-user.ts`). It also forwards XDeck's single-key shortcuts (`src/shared/shortcuts.ts`: 1–9, N, /, ?) to the shell, except while typing.
- `src/renderer/src/`: the React shell.
  - `App.tsx`: picks the screen: loading → settings error → rail, column strip (or `login/Welcome.tsx` while there is no account at all) and `Overlays.tsx` (every dialog and popup). There is no login screen (TASK-043). `shortcuts.ts` runs XDeck's shortcut keys, reading the stores when a key comes.
  - `columns/ColumnStrip.tsx` and `columns/Column.tsx`: headers (icon, title, click to scroll to top, menu), TweetDeck-style resize, dnd-kit reorder, and photo/video expand.
  - `rail/NavRail.tsx`: the 68 px navigation rail (TweetDeck-style): Compose, Search, a button per column, Add column, X's settings and Log out, and a settings menu that runs app-menu items through `menu:run` (an allow-list in `src/shared/rail.ts`). Every rail button has a tooltip with its shortcut key; the shell gets no pointerleave when the pointer moves into a `<webview>`, so the column preload sends `xdeck:pointer-enter` and open tooltips close on it (TASK-026). Notifications columns' buttons show X's unread count. It replaces X's side navigation, which every X column now hides. `rail/ComposePopup.tsx` is Post: X's editor, as tall as its content (read from X's toolbar), kept loaded between posts and preloaded for the main account a few seconds after the columns (TASK-025). `rail/PagePopup.tsx` shows X settings and Log out as an X page over the columns.
  - `columns/AddColumnDialog.tsx`: the add-column picker. Added and removed columns are written to `settings.json` through `config:set-columns` (main re-reads the file, keeps its other fields, and updates the custom-column allow-list).
  - `theme/useAppTheme.ts`: the chrome follows X's theme colour.
  - `state/`: TanStack Store (`@tanstack/store`, pinned 0.11.2; read with `useSelector`), holding the renderer's state (roadmap §10, TASK-040); components read it themselves instead of taking it as props. `settings.ts` mirrors main's settings (`startSettingsSync`); `unread.ts` holds X's unread count per account. `data.ts` holds settings.json, the deck layouts, the open deck, the accounts and the user name, with `openDeckStore` derived from it and the deck, column, filter, layout and account actions. `overlay.ts` is what is over the columns: one dialog or popup at a time, or null; `close(kind)` only closes that kind, and XDeck's shortcuts act only when it is null. `loaded.ts` (`useLoaded()`) gives the components App shows only after loading (the rail, the strip, the overlays) the open deck, user name, accounts and settings, non-null. Main stays the source of truth for anything persisted.
- `src/shared/`: logic used by main and renderer: column widths (every column is the same base width; the rail takes the 68 px the Swift app gave the leftmost X column), column keys and layout, settings, theme. `column-kinds.ts` turns a column into its header icon and title (x.com custom URLs are recognised as search, list, user, bookmarks...) and builds picker entries.
- **Networks** (roadmap §11 F-0): `src/shared/networks.ts` holds each network once: name, hosts, origin, first session and added-session prefix, account-name rule, unread keys. Code that differs by network reads it (`NETWORK_INFO`, `networkOfOrigin`, `networkOfPartition`, `accountSession`) instead of asking "X or Instagram?". Main keeps every network's accounts in one module (`src/main/accounts.ts`, `accounts:*` IPC with the network), and the renderer's data store holds them as one record by network (`accounts`).
- **Instagram** (roadmap §9, TASK-041/042): Instagram columns are `custom` columns with an Instagram URL. The first Instagram account is in `persist:ig` (its user name, as an Instagram page showed it, kept in `store.json` as `instagramAccount`); each added one has `persist:ig-<id>` (`instagramAccounts`, TASK-049), made and checked by `src/main/instagram.ts` like X's. A column names its Instagram account by user name, as X columns do (`columnAccount`, `src/shared/accounts.ts`).
- **Facebook** (roadmap §11, TASK-050): Facebook columns are `custom` columns with a Facebook URL (`persist:fb`, added accounts `persist:fb-<id>`). A Facebook account is its numeric user id, which main reads from the session's `c_user` cookie (`facebook:session-user`; the login window asks until it is set), never from the page; its name is a label from Facebook's page data (`CurrentUserInitialData`, only when the id matches the cookie), kept in `store.json` (`accountLabels`) and shown with `accountLabel`. Selectors and the link-shim unwrap (`l.facebook.com/l.php?u=…` goes to the browser as its target) are in `src/shared/facebook-user.ts`; the preload is `src/column-preload/facebook.ts`. Post as Facebook clicks Facebook's post box in a hidden feed (`NetworkPostPopup`, shared with Instagram). No Messenger.
- **Logins** (TASK-043): every account comes in through `LoginWindow` (`rail/AccountDialogs.tsx`), for X or Instagram, a new account or one logged in again. A column whose account is not logged in shows a Log in button: no account, an account not in XDeck, or a page that landed on X's login pages (`isXLoggedOutPath`) or Instagram's login form (the preload's `xdeck:logged-out`). After a login, that session's open pages load again (`sessionLogins` in the data store). A profile from before TASK-043 has its X login found once, out of sight (`login/XSessionProbe.tsx`).
- **Accounts** (TASK-023): the first X account uses `persist:x`, its user name kept in `store.json` (`xAccount`); each added account has `persist:x-<id>`, where main makes the id (`src/main/accounts.ts`) and `will-attach-webview` accepts an account session only for an id main made. Accounts live in `store.json`; a column names its account by user name (`"account"` in settings.json, `src/shared/accounts.ts`).
- **Security rules** (roadmap §2):
  - the shell runs with contextIsolation and sandbox;
  - `will-attach-webview` forces each guest's preload, partition (`persist:x` for X, `persist:custom` for other custom columns) and hardened preferences;
  - guests may only load X hosts, Instagram's (`instagram.com`, `www.instagram.com`, roadmap §9) or the configured custom-column origins;
  - every IPC handler accepts only the shell window's main frame;
  - an off-origin link goes to the browser only within 5 s of a click or key press in that page;
  - the only permission granted is full screen, and only in X's and Instagram's sessions (not custom columns);
  - packages flip Electron fuses (`electronFuses` in `electron-builder.yml`): cookies encrypted on disk, no run-as-Node, `NODE_OPTIONS` or `--inspect`, asar integrity checked. Dev and E2E runs use the stock binary;
  - `ELECTRON_RENDERER_URL` (the dev server) is honoured only in unpackaged builds, like every test hook.
- **No bottom toolbar, no menu bar.** XDeck draws its own 32 px title bar (`src/renderer/src/TitleBar.tsx`, TASK-024) with the app icon, and the open deck's name once there are two or more decks: macOS insets its traffic lights; Windows and Linux draw the window buttons over it (`titleBarOverlay`), coloured by the renderer through `window:title-bar-colors`. The app menu is still set for its shortcuts (and macOS), but no menu bar shows on Windows/Linux, not even on Alt; every item is in the rail's menus (`menu:run`, allow-listed in `src/shared/rail.ts`).
- **Borders:** Tailwind v4 draws `border` in the text colour unless told otherwise; `src/renderer/src/theme/shadcn.css` sets the default border and focus-ring colours, so give borders no colour class unless they need one.

### Configuration

User settings live at `~/.config/XDeck/settings.json` (all OSes). It has `columns` (one deck, called Main) or `decks` (`[{ name, columns }]`, TASK-022), never both; read it through `configDecks` (`src/shared/decks.ts`). The app writes `decks` once there is more than one deck, and saves changes through `config:set-decks`. Each deck's order and widths are stored by deck key (`name#n`) in `store.json` (`deckLayouts`); the pre-deck `columnLayout` belongs to the first deck until it gets its own. The app creates it from `resources/config/settings.json` if it's missing, and rewrites `~/.config/XDeck/schema.json` on every launch. Column types: `forYou`, `following`, `notifications`, `profile`, `custom` (any http/https URL; X and Instagram URLs are recognised for the header, and Instagram ones load in their own session `persist:ig`, TASK-041). Optional `columnWidth`. Any X column can have `filters` (`hideReposts`, `mediaOnly`, `mutedWords`), and any Instagram column `hideReels` and `mutedWords` (TASK-046), applied by `src/column-preload/filters.ts`; `src/main/config.ts` (Zod) and `resources/config/schema.json` must stay in step (the config spec checks every fixture against both). The dragged order and widths, the open deck, dark mode (and `darkBg`, X's last dark colour: Dim or Lights out, which the next switch to dark asks X for), notifications and zoom are stored separately in the app's `store.json`.

## Agent skills

`.claude/skills/` holds three skills from `piplupjs/skills` (pinned in `skills-lock.json`; update with `npx skills add piplupjs/skills --skill <name> -a claude-code`): `write-react-code` (renderer components and hooks), `coding-principles` and `code-spacing`. The code follows them (TASK-034); new code must too:
- Components and hooks: body sections State → Compute → Services → Compute → Form → Callbacks → Table → Effects under `// ─── Name ───` headers (74 characters), stable `useCallback` callback refs, repeated same-shape markup as data rendered with `map`.
- Blank lines: one per step; one before a `return`/`throw` that follows other statements; one after a closed block before the next statement. Biome stays the formatter for everything else.
- One home per piece of knowledge (for example X's user selectors in `src/shared/x-user.ts`); extract on the third repetition, not before.

## Tests (E2E only)

WebdriverIO + `@wdio/electron-service` drive the built app. There are no unit or component tests (a project decision).

- **Tests run against real x.com with a real account. There is no fake X.** Run `pnpm e2e:login` once and log in; the profile is kept in `~/.xdeck-e2e/profile`, outside the repo, and every session starts from a copy of it. Then run `pnpm test:e2e`. `x-accounts.e2e.ts` also needs a second account: in the `pnpm e2e:login` app, More → Add X account…; without one it is skipped. `instagram.e2e.ts` and `facebook.e2e.ts` need the Instagram and Facebook test accounts (More → Add Instagram account… / Add Facebook account…), and only they get those accounts; without one, each is skipped. Never run E2E specs while the `pnpm e2e:login` app is open: they copy the same profile, and the run's process sweep can close it.
- **Keep the load on the X account low:**
  - one full run before each merge;
  - rerun an infrastructure failure (chromedriver crash, X stuck on its splash screen, HTTP 429) once, per spec;
  - put checks that don't need X in specs that start on the settings error screen (see `menu-actions.e2e.ts`).
- **Keep the load on the Instagram and Facebook accounts lower still** (Meta locks accounts readily): checks that need no login go in `instagram-columns.e2e.ts` and `facebook-columns.e2e.ts` (a fresh profile; each loads only its network's login page, with no account), and `instagram.e2e.ts` and `facebook.e2e.ts` stay one small spec each: one feed column, one Post window, no logins, no reloads, never rerun in a loop.
- **No CI:** there is no CI workflow. `XDECK_E2E_OFFLINE=1` runs only the specs that need no logged-in account, on a fresh profile.
- **Test hooks** (`XDECK_USER_DATA`, `XDECK_CONFIG_DIR`, `XDECK_CAPTURE_PATH`, `XDECK_NOTIFY_DRY_RUN`) are honoured only in unpackaged builds. The E2E config sets `XDECK_NOTIFY_DRY_RUN=1`, so test runs record notifications (`globalThis.xdeckNotifications` in main) instead of showing them.
- **X's page-load limit:** X rate-limits how often an account loads its pages (HTTP 429), and every spec's startup loads several. Each session's store.json gets the test account's user name (`xAccount`), from the profile's own store.json or `<profile>-username.txt` (written by the first session that found it; `pnpm e2e:login` deletes it), so the app does not look it up on X. `x-login.e2e.ts` always starts without it.

## public/

A static landing page in English and Japanese (`ja/`), separate from the app and not part of its build. Published to GitHub Pages by `.github/workflows/pages.yml`; links are relative, since it is served under `/XDeck/`. `assets/screenshot.jpg` is a capture of XDeck with public profile columns (no account's own feed).

## Release

`.github/workflows/release.yml` runs only by hand (Actions → Release → Run workflow, with the version) and builds macOS (universal zip, ad-hoc signed, not notarized), Windows (NSIS, unsigned for now) and Linux (AppImage and deb). It publishes all of them as one GitHub Release.

- **Version format:** plain `MAJOR.MINOR` (e.g. `1.0`), **no `v` prefix**; the workflow checks it, sets the package version to `X.Y.0`, and creates the tag `X.Y` on the commit it built.
  - The in-app update check (`src/main/view.ts`) reads `/tag/([0-9]+\.[0-9]+)` from the redirect of `releases/latest`.
  - The macOS asset is `XDeck-X.Y.zip` containing `XDeck.app`, the shape Homebrew casks expect.
- **macOS signing:** ad-hoc (`identity: "-"` in `electron-builder.yml`, user decision 2026-10-12: no Apple Developer account), so no secrets. Apple Silicon needs a signature to run; without notarization Gatekeeper blocks the first launch until the user allows it (README), and the keychain may ask again after an update, since an ad-hoc signature changes with every build. With a Developer ID later: its certificate as `CSC_LINK`/`CSC_KEY_PASSWORD` secrets, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` for notarization, and `hardenedRuntime` and `notarize` back on.
- **Homebrew:** the existing `xdeck` cask in `Homebrew/homebrew-cask` points at the original author's repository, not this one. Homebrew's main cask repository is phasing out apps that are not notarized, so an ad-hoc signed XDeck fits a tap of its own better. Pointing a cask at `sadik-malik/XDeck` needs a cask update, or a separate tap.

The landing page (`public/`) is published to GitHub Pages (https://sadik-malik.github.io/XDeck/) by `.github/workflows/pages.yml` when a change to it reaches main, or by hand; the repository's Pages source must be "GitHub Actions".

To release: run the Release workflow by hand on GitHub (Actions → Release → Run workflow) with the version, or `gh workflow run release.yml -f version=X.Y`. Pushing a tag no longer starts it.
