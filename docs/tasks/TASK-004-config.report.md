# TASK-004 report

**Branch:** task/004-config   **Commits:** 964ee42, fc5dd85, c24a259, 591acd5, e57c62f (+ this report commit)

## Summary
- Bundled defaults copied byte-identical to `resources/config/` (`cmp` verified). The Swift files in `XDeck/Config/` are untouched.
- `src/main/config.ts`: config dir is `~/.config/XDeck` (`os.homedir()`), overridable by `XDECK_CONFIG_DIR` in unpackaged builds only. Startup creates the dir, creates `settings.json` only when missing (`copyFile` with `COPYFILE_EXCL`), always overwrites `schema.json`, then parses and validates with Zod.
- The Zod schema is `.strict()` at every object level, mirrors `schema.json`, and checks `columnWidth` with `z.int()`. Failures return `{ ok:false, path, kind, issues }` and never throw. Issues are flattened so an unknown key is reported at its own path (`columns.0.width`, `theme`).
- IPC: `config:get` and `config:open-folder` are registered in `src/main/config-ipc.ts`. Each one rejects unless `event.sender.getType() === 'window'`, `event.senderFrame === sender.mainFrame`, and the frame URL is the app itself (`isAllowedAppUrl`). The shell preload adds only `getConfig` and `openConfigFolder`.
- Renderer: `App` renders nothing until `getConfig()` answers. On `ok: false` it shows `ConfigError` (full window, title, path, `path: message` list, Open settings folder, hint). On `ok: true` the strip renders unchanged.
- E2E: `e2e/configs/` has 16 fixtures (6 valid, 10 invalid). Parity against Ajv 8 on `resources/config/schema.json` passes for all 16. The Ajv devDependency is used only in E2E.
- The AC3 sabotage was caught by (d) and (e). The revert is proven by an empty `git diff`.

## Acceptance criteria
- [x] **AC1** lint, typecheck, build pass:
  - `pnpm lint` → `Checked 64 files in 38ms. No fixes applied.` (exit 0)
  - `pnpm typecheck` → exit 0 (node, web and e2e tsconfigs)
  - `pnpm build` → `✓ built in 1.61s` (exit 0)
- [x] **AC2** `pnpm test:e2e` green three runs in a row (the full suite, 5 spec files, 34 tests each run):
  - Run 1: `Spec Files: 5 passed, 5 total (100% completed) in 00:02:52`. Per file: columns 10, config-open-folder 1, config 10, smoke 6, webview-security 7.
  - Run 2: `Spec Files: 5 passed, 5 total (100% completed) in 00:03:25`. Same counts.
  - Run 3: `Spec Files: 5 passed, 5 total (100% completed) in 00:03:07`. Same counts.
  - Baseline before any change: `Spec Files: 3 passed, 3 total ... in 00:01:01` (23 tests).
- [x] **AC3** sabotage. In `src/main/config.ts` the column union was replaced by `z.union([z.strictObject({ type: z.string() }), z.strictObject({ type: z.literal('custom'), url: z.string() })])`, then `pnpm build` and the config spec were run. Result: `(d) invalid-unknown-type.json lists an issue at columns.0.type` FAILED, `(d) invalid-custom-no-url.json` FAILED, and `(e) Zod and schema.json agree` FAILED (mismatch on `invalid-unknown-type.json`). The other cases passed. The file was then restored with `git checkout -- src/main/config.ts`, and `git diff -- src/main/config.ts` is empty (0 bytes). A rebuild and a rerun of the config spec after the revert gave `10 passing (1m 20.5s)`.
  - Note: the first sabotage attempt passed everything because I had not rebuilt, and the specs run `out/`. The rebuilt run above is the real evidence.
- [x] **AC4** error screen screenshot from the built app (`out/main/index.js`) with `XDECK_CONFIG_DIR` pointing at a scratchpad dir holding the `invalid-unknown-type.json` fixture, captured via `XDECK_CAPTURE_PATH` (real `BrowserWindow.capturePage`):
  `C:\Users\devel\AppData\Local\Temp\claude\C--Users-devel-Code-XDeck\eeda5582-3def-40fd-9485-15de7360ac07\scratchpad\ac4-config-error.png`
  It shows the title, the path, `columns.0.type: Invalid discriminator value...`, the button, and the hint.
- [x] **AC5** `git diff main -- XDeck` is empty (0 bytes). `XDeck/` was only read.

## Specs (config.e2e.ts and config-open-folder.e2e.ts)
- (a) empty dir: `settings.json` and `schema.json` are byte-identical to the bundled files, and the strip shows.
- (b) existing `settings.json` is byte-identical after launch, and a stale `schema.json` (`{}`) is overwritten with the bundled one.
- (c) invalid JSON: error screen with `data-kind="json"`, the exact path, and `(file): <message>`. The message equals Node's `JSON.parse` message for the same text.
- (d) five launches, one per fixture. Each shows `kind=schema` and an issue at `columns.0.type`, `theme`, `columns.0.url`, `columns.0.width` or `columnWidth`. Every issue is rendered as `path: message`.
- (e) for all 16 fixtures, the app's verdict (error screen or strip) equals Ajv's verdict on the bundled `schema.json`. The test asserts zero mismatches and at least 10 fixtures.
- (f) in `config-open-folder.e2e.ts`: clicking Open settings folder calls the mocked `shell.openPath` with the config dir.
- (g) IPC hardening, see below.

### How (g) is checked
Two checks run in the same session, before any relaunch:
1. Inside a real column guest's main world, `window.xdeck` and `window.ipcRenderer` are both `undefined`. The column preload exposes nothing to x.com.
2. The registered `config:get` handler (read from `ipcMain._invokeHandlers`, which Electron 44 uses internally) is called with the real column-1 guest `webContents` and its `mainFrame` as the sender. It must reject with `config IPC is only available to the XDeck shell window`. A positive control calls the same handler with the shell window's `webContents` and `mainFrame`, and it must return `{"ok":true,...}`.

Check 2 depends on an undocumented Electron field. If that field moves, the spec fails loudly rather than passing silently.

## Resolved versions
- zod 4.6.5 (runtime, dependency)
- ajv 8.20.0 (E2E devDependency)
- electron 44.7.0, electron-vite 5.0.0, typescript 7.0.2
- webdriverio 9.32.0, @wdio/cli 9.32.0, @wdio/electron-service 10.4.0
- @biomejs/biome 2.5.15
- Chromium used by Electron for the E2E run: 152.0.7977.130 (chrome capability reported by wdio)

## Deviations from spec
1. **Config dir is fixed per worker session, not fresh per case.** The app reads `XDECK_CONFIG_DIR` at each launch, but chromedriver gives every relaunch the environment it was started with, so a changed `process.env` never reaches the app (confirmed: a relaunch with a new env value still showed the strip for an invalid file). `wdio.conf.ts` gives each session its own dir, and each case empties that dir and writes its own files before `browser.reloadSession()`. A case never sees files from an earlier case.
2. **The electron service's main-process bridge goes stale after `reloadSession()`.** Any `browser.electron.*` call after a relaunch fails with "Cannot find context with specified id", and the service's setup is not re-run. So (g) runs first in `config.e2e.ts`, before any relaunch. (f) needs a `browser.electron.mock`, so it has its own spec file, `e2e/specs/config-open-folder.e2e.ts`, which starts on the error screen. `beforeSession` (`e2e/wdio.conf.ts`) writes an invalid `settings.json` only for that spec file.
3. **(c) parser message** is compared with Node's `JSON.parse` message, not with the app's, for the same reason as item 2. Electron 44's V8 produced the same string.
4. **UTF-8 BOM is stripped** before `JSON.parse`, because Notepad writes one. The Swift app's behaviour here was not checked.
5. **Renderer blank until config answers.** `App` renders an empty background `div` while `getConfig()` is pending, so the strip is never mounted before the answer arrives. The spec did not say this.
6. **`(file)` and `(root)` issue paths.** JSON syntax and read errors use the path `(file)`. Root-level schema issues use `(root)`. These are my labels, not from the spec.
7. **Helper file added:** `e2e/helpers/config-screen.ts` (`settledScreen`), shared by the two config specs.
8. **No electron-builder config.** The spec said to resolve the bundled files for dev and `out/` for now. `bundledConfigDirectory()` uses `__dirname/../../resources/config` unpackaged and `process.resourcesPath/config` packaged. The `extraResources` entry is not added, because there is no electron-builder config in the repo yet.
9. **Readiness wait after relaunch.** `launchWith` waits for `document.readyState === 'complete'` via `browser.execute` before the spec continues. This was added after the first-call failures in item 2.

## Open questions
- (g) check 2 reads `ipcMain._invokeHandlers`, which is undocumented. Is there a public way to invoke a handler with a fake sender in Electron 44+? If there is, it should replace the internal read.
- Zod's own English messages are shown as they are (for example `Invalid discriminator value. Expected 'forYou' | ...`). Curated wording for each case is a possible follow-up.
- When the config is valid but the dir is not writable, startup reports a `read` failure and the error screen shows. This matches Swift (which also aborted), but it has not been tested on a read-only folder.

## Needs human verification
- Nothing in this task needs a human check. The AC4 screenshot is a real window capture from the built app on Windows 11 (display scale not recorded). It has not been checked at other scales or on macOS or Linux.
