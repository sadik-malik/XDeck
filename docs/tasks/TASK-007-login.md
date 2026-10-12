# TASK-007: Login flow, username → profile column, session persistence

**Status:** IN_PROGRESS  **Branch:** `task/007-login`  **Roadmap:** §1 (Login row), §5.2 (`login` spec)

## Behaviour to port (read `XDeck/View/ContentView.swift`, `LoginView.swift`, and `findUserName` in `WebViewConfigurations.swift`)
- Swift keeps `profileUrl` in memory only. **Every launch** shows `LoginView`: a padded webview on `x.com/login`, with **no toolbar and no columns**. A logged-in session is redirected by X to `/home`, `findUserName` finds the profile link, and the UI switches to columns straight away. Logged-out users log in there first.
- `findUserName`: `waitForElement("a[aria-label='Profile'], a[data-testid='AppTabBar_Profile_Link']", 0, …)` → the first path segment of its `href` → username → `profileUrl = <X>/<username>`.
- Port this exactly: a login screen (the same `<webview>` hardening, `persist:x`, column preload) → columns once a username arrives. **Profile columns** now load `<X>/<username>` (replacing TASK-005's placeholder).

## Scope
1. **Login screen:** padded (16 px, like SwiftUI `.padding()`) full-window `<webview>` on `<X>/login`; no toolbar.
2. **`findUserName`** in the column preload (the login webview gets it; it's a script name like the others). Send `sendToHost('xdeck:user-name', name)`. The renderer **validates** the name against `^[A-Za-z0-9_]{1,15}$` before building a URL, and ignores anything else (a crafted href must never become a path or a URL).
3. **`waitForElement` fix (from TASK-006 review):** check the selector immediately; if it isn't there, observe mutations as before (`once` semantics unchanged). This applies to every user of the helper. Note it as a deliberate deviation from Swift.
4. **Fake X:**
   - a `/login` page with a username/password form; submitting sets a session cookie and redirects to `/home`;
   - `/login` with a valid cookie → redirect to `/home`;
   - `/home` shows the profile link (`a[data-testid='AppTabBar_Profile_Link'][href='/fakeuser']`) **only** with the cookie;
   - a `/fakeuser` profile page with the red frame.
   - **All existing specs must keep passing without a manual login.** Design the fake X so the default test path is "already logged in" (e.g. a cookie set by a test-only auto-login mode), and the login spec exercises the real form. Explain your design.
5. **Remove** the profile placeholder path from TASK-005 (except the error placeholders for invalid custom URLs).

## E2E — `login.e2e.ts` (plus a separate spec file if a relaunch is needed)
- (a) fresh profile → the login screen is shown (no toolbar, no columns), webview on `<X>/login`, padded 16 px;
- (b) submit the fake form → columns appear, and the `profile` column loads `<X>/fakeuser`;
- (c) **persistence:** relaunch with the **same** `XDECK_USER_DATA` → no login form is interacted with, columns appear, and the profile column is correct;
- (d) **validation:** fake X serves a profile link with a hostile href (e.g. `/..%2F..%2Fevil`, `//evil.example/x`, `/a b`) → no columns, still on the login screen, and no navigation to the hostile target;
- (e) **`waitForElement` immediate check:** a fake page whose tab or profile link exists **before** the setup message arrives and whose DOM never mutates afterwards → the script still fires;
- (f) every pre-existing spec still passes, listing what you had to change and why.

## Acceptance criteria
- **AC1:** lint, typecheck, build.
- **AC2:** full `pnpm test:e2e` green 3 runs in a row (summaries).
- **AC3 (the test can fail):** temporarily remove the username validation. Show that (d) fails, then revert.
- **AC4:** temporarily restore the old `waitForElement` (no immediate check). Show that (e) fails, then revert.
- **AC5:** a screenshot of the login screen against real x.com (logged out) from `pnpm dev`, path in the report.

## Human check (the user runs this after the PM review; list it in the report)
With the **bundled default config** and a real x.com account:
1. First launch shows the X login page with no toolbar.
2. After logging in: For you, Following, Notifications and **your own profile** columns appear. The For you and Following tabs are selected correctly, and X's left menu shows only in the first column.
3. Quit and relaunch: straight to the columns.
4. Tick Hide Ads: promoted tweets disappear, and regular video tweets stay.
