# TASK-007 review, round 1 (partial handback)

**Verdict: CHANGES_REQUESTED.** The work is incomplete. A fresh implementer continues on `task/007-login` in the existing worktree `.claude/worktrees/agent-ac00df3a5bba0167e`.

## State at handback
- Committed: fake-X login flow + `/__control`, the `waitForElement` immediate check, the login screen + `findUserName` + renderer validation + profile column, 16 px padding, the login/relaunch/validation/wait-for-element specs.
- **Uncommitted:** relative login counts (`login.e2e.ts`, `login-relaunch.e2e.ts`) and `settledConfigScreen()` (`e2e/helpers/config-screen.ts`, `config.e2e.ts`). Review them and commit them.
- Full run 1: 13/15 spec files passed (login (b), config (e) failed; both since changed). **Full run 2 hung**: the log stops while a worker waits for the debugger to disconnect. The PM killed the leftover process tree. Stray `e2e-*.log` files in the worktree root must not be committed; delete them.

## PM decisions
1. **Cookie persistence is the app's job, not the test's.** Chromium writes cookies on a ~30 s timer. The app must call `session.fromPartition('persist:x').cookies.flushStore()`:
   - **(a)** right after a valid username is received (login success);
   - **(b)** on `before-quit`.

   Then **remove the test-side forced flush** from `login-relaunch`. The relaunch test may still hard-kill the app (that's realistic), and it must pass because of (a).
2. **Fix the hang, don't just retry.** If a full run hangs again, find the cause (likely the hard-kill + `reloadSession` pattern in `login-relaunch`, or a worker waiting for the debugger) and fix it. `e2e/run.mjs`'s overall timeout must turn any hang into a failure with a summary, never an indefinite wait. Report what you found.
3. **`findUserName` ignores cross-origin links:** accepted as a deliberate security deviation from Swift.
4. **`config.e2e (e)` settled check:** accepted. The Ajv-vs-app comparison is unchanged.

## Still required (from the spec)
- AC2: full `pnpm test:e2e` green **3 runs in a row** (paste the summaries).
- AC3: remove the username validation → login-validation (d) fails → revert (diff empty).
- AC4: old observer-only `waitForElement` (`git show 0176dee^:src/column-preload/wait-for-element.ts`) → wait-for-element (e) fails → revert.
- AC5: login-screen screenshot against real x.com (logged out) from `pnpm dev`.
- The report `docs/tasks/TASK-007-login.report.md`, with the human check list.

## Round 2 notes (PM, after the bisect)
- **Bisect result:** the failure happens **before** the cookie-flush commit too (`ee4f2a7`: 5/6 failing pairs), so the flush is **not** the cause. Caveats:
  - the bisect script ran two `--spec` in one wdio invocation, which the first implementer had already found unreliable;
  - Git Bash `timeout` did not kill the native node/electron tree, so one run took 2 h 14 min.
- **New hypothesis:** `wait-for-element` is the spec where the username arrives fastest (static `/home` → the login `<webview>` is unmounted almost immediately). The implementer also saw the **app quit right after the first `GetWindow`**. That fits a **main-process or renderer crash when a `<webview>` is destroyed while it's still attaching or loading**, which would be a real product bug for fast logged-in launches.
- **Next experiments (TASK-007 round 3):**
  - **E1:** launch the built app **without wdio/chromedriver** (plain `electron out/main/index.js`, fresh `XDECK_USER_DATA`, `XDECK_X_ORIGIN` = fake X in `homeStatic` + `autoLogin` mode, `ELECTRON_ENABLE_LOGGING=1`), 20 times, recording the exit code and whether the process is still alive at 15 s.
  - **E2:** log `render-process-gone`, `child-process-gone` and `did-fail-load` in the main process (debug-only), plus `crashReporter` local dumps.
  - **E3:** run `wait-for-element` alone through `run.mjs` 10 times.
  - Then fix the root cause, with an E2E that reproduces it.
- **Teardown:** `run.mjs` must sweep **all descendant processes** after every run (not only on timeout). Any experiment loop must use a tree-killing timeout (`run.mjs`, or PowerShell + `Stop-Process` on the tree), never Git Bash `timeout`.
