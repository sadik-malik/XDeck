# TASK-007 report

**Status: NOT COMPLETE. AC2 is not met.** Full `pnpm test:e2e` has not been green three runs in a row. The blocker is an intermittent chromedriver or app failure at session start, described under "Hang and session-start investigation". AC1, AC3, AC4 and AC5 are done with evidence below.

**Branch:** task/007-login   **Commits:** 0176dee (before this round), ee4f2a7, 52c31e2, 5c83e70, and this report (see `git log`)

## Summary
- Committed the pending edits from the handback (relative login counts; `settledConfigScreen()`), after deleting the stray `e2e-*.log` files (ee4f2a7).
- PM decision 1 done (52c31e2): the app flushes the `persist:x` cookie store when a valid user name arrives (shell-only IPC `session:flush-x-cookies`, called by the login screen) and on `before-quit`. The relaunch spec no longer forces a flush; it still hard-kills the app.
- `config (e)` timed out in run 1: wdio applies the 60 s `mochaOpts.timeout` before the test body runs, so `this.timeout()` inside the body is ignored. Fixed by making one test per fixture (5c83e70). The assertion (Ajv accepts exactly when the app accepts) is unchanged.
- Full run 1: 13 of 15 spec files passed. Full run 2 (after 5c83e70): 14 of 15 passed. The one failing spec in each run is `wait-for-element` (session start), see below.
- AC3 and AC4 failed as the spec requires when the check is removed or the old helper is restored. Both were reverted with an empty diff.
- AC5 screenshot of the real x.com logged-out login screen, captured from `pnpm dev` (path below).

## Acceptance criteria
- [x] AC1 — lint, typecheck, build (on 52c31e2 and 5c83e70; the lint fix is in 52c31e2):
  - `pnpm lint` → `Checked 105 files in 47ms. No fixes applied.` exit 0 (before the fix it reported 6 errors: formatting and import order in the new files and CRLF line endings, which I fixed with `biome check --write` and LF normalisation).
  - `pnpm typecheck` → exit 0.
  - `pnpm build` → `✓ built in 2.22s`, exit 0.
- [ ] AC2 — **not met.** Full runs (`pnpm test:e2e`, the runner's overall limit is 10 min):
  - Run 1 (on 52c31e2): `Spec Files:	 13 passed, 2 failed, 15 total (100% completed) in 00:06:25`, exit 1. Failures: `config (e)` → `Error: Timeout after 59997ms` (fixed in 5c83e70); `wait-for-element` → `✖ Failed to create a session`.
  - Run 2 (on 5c83e70): `Spec Files:	 14 passed, 1 failed, 15 total (100% completed) in 00:06:18`, exit 1. Failure: `wait-for-element` → `✖ Failed to create a session`. `config` passed (26 passing).
  - No third run was attempted after the failures, because the failure is not explained yet (see below).
- [x] AC3 — removed the username validation (`if (typeof userName === 'string') {` in `LoginScreen.tsx`), built, ran `login-validation.e2e.ts` alone (log kept in the scratchpad):
  ```
  ✓ (d) a valid profile link (control): /fakeuser shows the columns
  ✖ (d) an encoded path traversal: /..%2F..%2Fevil leaves the login screen, with no columns
  ✓ (d) a protocol-relative link to another host: //evil.example/x leaves the login screen, with no columns
  ✖ (d) a path with a space: /a b leaves the login screen, with no columns
  2 passing (32.8s)  2 failing
  ```
  The `//evil.example/x` case still passes without the validation: `findUserName`'s same-origin rule rejects it (PM decision 3). Reverted (`git checkout`), diff empty, rebuilt.
- [x] AC4 — restored the old observer-only helper (`git show 733040d^:src/column-preload/wait-for-element.ts`), built, ran `wait-for-element.e2e.ts` alone:
  ```
  ✖ (e) the profile link (login) and the tabs (col-0) are found without any DOM change: the columns appear, and the tab is clicked
  Error: the columns did not appear after the login
  1 failing (40.1s)
  ```
  Reverted, diff empty, rebuilt. **Note:** the PM's path `0176dee^` is wrong. That commit is `ed0a53e` and already contains the immediate check. The old observer-only version is at `733040d^`.
- [ ] AC5 — screenshot of the logged-out login screen, real x.com, from `pnpm dev`:
  `C:/Users/devel/AppData/Local/Temp/claude/C--Users-devel-Code-XDeck/eeda5582-3def-40fd-9485-15de7360ac07/scratchpad/ac5-login.png` (the window's own `capturePage`, shows "See what's happening" with the cookie banner left unanswered).
  The shipped capture hook fires 1 s after the shell's load and produced a blank white frame (`ac5-login.png` from the first attempt, overwritten). For the captured frame I changed that delay to 12 s temporarily, ran `pnpm dev` with `XDECK_CAPTURE_PATH`, `XDECK_USER_DATA` and `XDECK_CONFIG_DIR` pointed at scratch directories, and reverted the change. The real `~/.config/XDeck` was not touched.
  Marked `[ ]` because the screenshot is not the shipped timing. The PM may accept it as is or ask for a re-capture.
- Login specs in run 2: `login`, `login-relaunch`, `login-validation` and `config` all passed. `wait-for-element` failed at session start in both full runs, so its assertion (e) was never reached in a full run. When run alone it passes (`1 passing (10.1s)`).

## Resolved versions
- Electron 44.7.0 (from the user agent `Electron/44.7.0`)
- Chromium / chromedriver 152.0.7977.130
- webdriverio, @wdio/cli, @wdio/mocha-framework, @wdio/runner 9.32.0 (from the node_modules paths)
- @wdio/electron-service 10.4.x (the `10.4_6b2759…` pnpm entry)
- Node 24, pnpm 11 (per the environment)
- Biome 2.5.15 (the schema in `biome.json`)

## Deviations from spec
- **`waitForElement` checks immediately, then observes** (spec scope 3, deliberate): applies to every user of the helper.
- **`findUserName` ignores cross-origin links** (PM decision 3): a security deviation from Swift.
- **Cookie persistence is the app's job** (PM decision 1): the login screen calls `window.xdeck.flushXCookies()` when a valid name arrives, and `before-quit` flushes once before quitting. The relaunch spec no longer calls `cookies.flushStore()`.
- **`config (e)` is one test per fixture** (5c83e70): the single loop timed out. Reason: wdio reads the per-test timeout before the body runs, so `this.timeout()` set inside a test body has no effect beyond the 60 s `mochaOpts.timeout`. The `config (c)`, `config (d)` and `login-relaunch (c)` tests also call `this.timeout(…)`, which is ineffective the same way. They each finish within 60 s, so I left them alone.
- **Login specs count submits relative to the start of each test** (ee4f2a7): the fake-X counter is shared by the run.
- **`settledConfigScreen()`** (ee4f2a7): config (e) waits for error or accepted before comparing.

## Hang and session-start investigation
**Hang mechanism (reproduced).** A chromedriver session whose app exits while the debugger is attached waits. In one diagnostic run (verbose chromedriver log, `pair9`) the app printed `Waiting for the debugger to disconnect...` right after the first `GetWindow`. The next command ran 237 s later and failed with `session deleted as the browser has closed the connection`. The shell limit (250 s) killed the run with exit 124. The runner's overall 10-minute limit (`e2e/run.mjs`) is the backstop; it did not trigger in any run I made.

**Session-start failure (not yet explained).** `wait-for-element` (and once the first session of a two-spec run) fails at session creation. Two shapes were captured:
- Mode A (`pair12`, instrumented): the chromedriver log ends in the middle of `InitSession`, with the app's CSP console messages as the last lines and no `RESPONSE`. The chromedriver process was gone (POST got `ECONNRESET`, then `ECONNREFUSED`). The app process stayed alive.
- Mode B (`pair9`): the app quit right after the first `GetWindow`, and the service's DevTools fetch failed.
- Frequency: about half of the runs with `smoke` followed by `wait-for-element`; 2 of 2 full runs failed on it. Passing pairs also occurred. A 20 s pause before each session did not remove it (2 of 3 pairs still failed).
- Not found: a Windows Application Error event for chromedriver (checked the last two hours), or a port clash.
- Not tested: the commit before 52c31e2 (the flush change). All failures happened after it, so I cannot rule it out.

**Orphaned app trees (confirmed).** A failed session leaves its app process tree running. For example, after `pair3`/`pair6` seven processes carried that session's `--user-data-dir`. I tried an `afterSession` kill keyed on the session profile path. It did not remove those trees, and I did not confirm why. I reverted it, so nothing about it is committed.

**Experiments, all reverted (tree clean at 5c83e70):** main-process diagnostics (`app.quit` stacks, exit code), an `afterSession` kill, a `beforeSession` 20 s pause, chromedriver verbose logging (`wdio:chromedriverOptions: { logPath: <file>, verbose: true }`; `logPath` must be a file, not a directory).

## Open questions (for the PM)
1. **The session-start failure blocks AC2.** Options: (a) keep hunting the cause, using the verbose chromedriver log method above, possibly on the commit before 52c31e2 to rule the flush change in or out; (b) accept a spec-level retry in `wdio.conf.ts` (`specFileRetries`) as a harness mitigation, logged and reported. I have not added a retry, because the PM asked for a root cause rather than a retry.
2. **Orphaned app trees** after failed sessions: I have no verified fix. A cleanup keyed on the profile path is the likely route, but it has to cover sessions that never reach `afterSession`.
3. **`this.timeout()` in test bodies is ignored by wdio** above 60 s. Raising `mochaOpts.timeout`, or splitting long tests as done for config (e), is the PM's choice.
4. AC5 timing: keep the 12 s capture as evidence, or should the shipped hook change? (Not changed here; the spec says the screenshot comes from the existing hook.)

## Needs human verification
With the bundled default config and a real x.com account:
1. First launch shows the X login page with no toolbar.
2. After logging in: For you, Following, Notifications and your own profile columns appear. The For you and Following tabs are selected correctly, and X's left menu shows only in the first column.
3. Quit and relaunch: straight to the columns.
4. Tick Hide Ads: promoted tweets disappear, and regular video tweets stay.

## Round 4 (PM, implemented directly, 2026-10-10)

The user stopped the subagent workflow and asked for tests against a **real X account**. Changes:

- **Startup failure root cause:** not an app crash. Launching without the test driver: 19/19 runs alive at 15 s, with the login handing over to the columns within about 0.4 s. Chromedriver's session start raced with the webviews being swapped on the fast-login path (wait-for-element alone: 2 of 10 runs failed). That spec is gone with fake X.
- **Fake X removed** from the app (`XDECK_X_ORIGIN`/`XDECK_FIXTURE_ORIGIN`, `--xdeck-x-origin`) and from the tests. `pnpm e2e:login` stores a logged-in profile in `~/.xdeck-e2e/profile`, and each worker session copies it.
- **Real bug fixed (also in the Swift app):** X renders the home tabs as `div[role=tab]` without an href, so `a[href='/home'][role='tab']` matched nothing and the Following column showed For you. The selector is now `[role='tablist'] [role='tab']`.
- **The bottom toolbar was removed (user decision).** Hide Ads moved to the app menu, View → Hide Ads (`src/main/menu.ts`, with a main → renderer `settings:changed` push). The dev Hide/Expand controls and the `--xdeck-dev-controls` flag are gone.
- **Harness:**
  - `cdpBridgeTimeout` 45 s;
  - the run sweep never adopts processes that existed before the run (Windows PID reuse made an unrelated `setup.exe` count as a survivor);
  - the vertical-wheel check uses the For you column and runs before the horizontal one (synthetic wheels latch).
- **New real-X specs:** x-login, x-scripts, x-hide-ads, x-layout, x-layout-fill, x-columns, x-security, x-custom-column (plus smoke, config, config-open-folder).
- **Result: 3 consecutive full runs, 11/11 spec files each** (6:25, 7:46, 6:52), with 0 processes left after each sweep.
- **Open:**
  - Hide Ads (b)/(c) **skipped**: the test account was shown 0 ad cells in every run, so the ad rule is unproven on real X (tracked as 007b);
  - the hostile-username and static-page waitForElement checks have no real-X equivalent (the code stays, untested).

### Human check (user, real account)
1. `pnpm dev`: first launch shows the X login page (already logged in → the columns appear by themselves).
2. Columns: For you, Following (**Following tab selected**), Notifications, your profile; X's left menu only in the first column; no bottom toolbar.
3. Quit and relaunch: straight to the columns.
4. View → Hide Ads (Alt shows the menu bar on Windows): promoted posts disappear, if your timeline shows any.
