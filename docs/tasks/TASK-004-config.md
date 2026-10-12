# TASK-004: Config — settings.json load/create/schema + error screen

**Status:** IN_PROGRESS  **Branch:** `task/004-config`  **Roadmap:** §1 (Config row), §2 (config path), §5.1 (`XDECK_CONFIG_DIR`), §5.2 (`config-error` spec)

## Goal

Port `XDeck/Config/AppConfig.swift` behaviour exactly. Read it first, then reproduce what it does, plus a readable error screen. Columns are **not** driven by the config yet (that's TASK-005); this task only loads, validates and exposes it.

## Scope
1. **Bundled defaults:** copy (don't move) `XDeck/Config/settings.json` and `XDeck/Config/schema.json` into `resources/config/` and ship them with the app (electron-vite/electron-builder `extraResources`-style; for now just resolve them correctly in dev and in the built `out/`). The Swift files stay put until cutover.
2. **Config dir:**
   - `path.join(os.homedir(), '.config', 'XDeck')` on all three OSes;
   - test hook `XDECK_CONFIG_DIR`, unpackaged builds only, like the other hooks.
3. **Startup behaviour (same as Swift `createConfigFileIfNotExist` + `loadConfig`):**
   - create the dir if missing;
   - if `settings.json` is missing, write the bundled default;
   - **always** overwrite `schema.json` with the bundled schema;
   - then read and parse `settings.json`.
4. **Validation with Zod** (`src/main/config.ts`), mirroring `schema.json` exactly:
   - top level: optional `$schema` (string), optional `columnWidth` (integer), required `columns` (array), with no other keys allowed (`.strict()`);
   - each column is either `{ type: 'forYou' | 'following' | 'notifications' | 'profile' }` with no other keys, or `{ type: 'custom', url: string }` with no other keys.
   - Result type: `{ ok: true, config } | { ok: false, path, kind: 'read' | 'json' | 'schema', issues: { path: string, message: string }[] }`. JSON errors include the parser's message.
5. **IPC:**
   - `ipcMain.handle('config:get')` returns the result loaded at startup;
   - `ipcMain.handle('config:open-folder')` calls `shell.openPath(configDir)`;
   - both handlers **reject calls whose sender isn't the shell window's main frame** (guests and other frames get an error);
   - the shell preload exposes `xdeck.getConfig()` and `xdeck.openConfigFolder()`, and nothing else new.
6. **Renderer:**
   - on `ok: false`, show a full-window **config error screen** instead of the strip: title "Couldn't load settings.json", the file path, each issue as `path: message`, an **Open settings folder** button, and the hint "Fix the file and restart XDeck" (the same wording idea as the Swift alert);
   - on `ok: true`, show the existing strip unchanged;
   - plain Tailwind tokens, no design work yet.

## E2E (`e2e/specs/config.e2e.ts`)
Every case uses a fresh temp `XDECK_CONFIG_DIR` (it sets the env per session, like `XDECK_USER_DATA`).
- (a) **Empty dir:** `settings.json` is created byte-identical to the bundled default, `schema.json` is created, and the strip is shown.
- (b) **Existing custom `settings.json`** is left untouched, and a stale `schema.json` (e.g. `{}`) is overwritten with the bundled one.
- (c) **Invalid JSON** → error screen with `kind` json, the file path and the parser message.
- (d) **Schema violations**, one launch each: an unknown column type, an extra top-level key, `custom` without `url`, an extra key on a column, non-integer `columnWidth` → the error screen lists an issue whose path points at the offending field.
- (e) **Schema/Zod parity:** `e2e/configs/` holds ≥ 10 fixture files, valid and invalid. For each, the app's verdict (error screen or not) must equal **Ajv**'s verdict on the bundled `schema.json` (Ajv as an E2E devDependency only). This keeps Zod and `schema.json` from drifting.
- (f) **Open settings folder:** clicking it calls `shell.openPath` with the config dir (mock it via `@wdio/electron-service`).
- (g) **IPC hardening:** calling `config:get` from inside a column guest (via `executeJavaScript` in an isolated world, or by checking that the guest preload has no access) fails or is unavailable. Pick a real, meaningful check and explain it.

## Acceptance criteria
- **AC1:** lint, typecheck, build pass.
- **AC2:** `pnpm test:e2e` (all specs) green 3 runs in a row; paste the summaries.
- **AC3 (the test can fail):** temporarily make the Zod schema accept unknown column types. Show that (d) and (e) fail, then revert.
- **AC4:** a screenshot of the error screen (via `XDECK_CAPTURE_PATH`), path given in the report.
- **AC5:** protected paths unchanged. `XDeck/Config/*` is only **read**, never modified (`git diff main -- XDeck` is empty).
