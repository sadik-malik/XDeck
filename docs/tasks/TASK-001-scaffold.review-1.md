# TASK-001 review, round 1

**Verdict: CHANGES_REQUESTED.** Incomplete: AC1, AC4, AC5, AC8 and AC9 aren't met.

## PM findings
- **The npm registry is not blocked.** `curl https://registry.npmjs.org/electron` → **200** from this machine. The untracked `.npmrc` (`registry=https://registry.yarnpkg.com/`, `replace-registry-host=always`) was a workaround the implementer created. **Delete it**, and do AC1 without any registry override. If install really fails, paste the exact error.
- The code read so far is reasonable: the security options are in `security.ts`, the permission handlers run after `ready` (correct), the `XDECK_USER_DATA` hook is gated on `!app.isPackaged`, and the protected paths are untouched (AC7 ✅).
- **Spec error (PM's):** `wdio-electron-service` is deprecated. Switch to its successor **`@wdio/electron-service`** (latest), and follow *its* current docs for setup. That includes any required main-process or preload imports for `browser.electron.execute`, and how the service works with `sandbox: true` preloads.
- **Root `postinstall` that runs `node_modules/electron/install.js`:** pnpm 11 blocks dependency build scripts unless allowed, and you've already allowed `electron` in `pnpm-workspace.yaml` `allowBuilds`. Remove the redundant root `postinstall` if the fresh-clone install (AC1) gets the Electron binary without it. If it doesn't, keep it and explain why.

## Required changes
1. **R1 — Fix the E2E hang (AC4).**
   - Switch to `@wdio/electron-service`.
   - Run with `logLevel: 'debug'` and a single trivial test first.
   - Paste the relevant log lines showing the root cause of the hang. Suspects to rule in or out:
     - a missing service bridge setup;
     - chromedriver/Electron version mismatch (Electron 44 = Chromium 152);
     - `show: false` until `ready-to-show`;
     - the strict CSP blocking something;
     - the `XDECK_USER_DATA` temp dir.
   - Then make all **6 smoke assertions** pass, and keep `logLevel` back at `warn` afterwards.
   - **Add a hard timeout** so a hang fails fast instead of sitting for 35 minutes: a wdio `connectionRetryTimeout`, a mocha timeout, and an overall `timeout` wrapper in the `test:e2e` script.
2. **R2 — AC5 negative test** (`sandbox: false` → assertion (c) fails, then revert). Paste the failure.
3. **R3 — AC1** fresh clone + `pnpm install --frozen-lockfile` with no `.npmrc`. Delete the untracked `.npmrc`.
4. **R4 — AC8.**
   - Dev-only CSP: allow what Vite HMR and the React refresh preamble need **in dev only**. The production `index.html` CSP stays strict. Prove the production build still loads under the strict CSP (the E2E runs against the built app).
   - Env-gated (`!app.isPackaged`) `capturePage` → PNG into a path passed by env var, e.g. `XDECK_CAPTURE_PATH`.
   - Take the screenshot of `pnpm dev` and give its path.
5. **R5 — AC9:** parse `ci.yml` with a real YAML parser (e.g. `node -e` with the `yaml` package from `node_modules`) and paste the output. Make CI use `@wdio/electron-service` too.
6. **R6 — the artifact hook:** verify that `browser.getLogs('browser')` works with this service. If it doesn't, collect the renderer console another way (e.g. a `console-message` listener on webContents in a test-only path). Prove the hook works by temporarily failing one assertion, showing the PNG and console file get written to `e2e/artifacts/`, then reverting.

## Accepted
- Local `lib/utils.ts` instead of the `cn` package.
- `allowBuilds` (electron, esbuild allowed; edgedriver, geckodriver denied).
- The narrow cast for `getLastWebPreferences()`, with a comment.
- Electron 44, Vite 7 / electron-vite 5, TS 7.
