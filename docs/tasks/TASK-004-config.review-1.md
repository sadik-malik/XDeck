# TASK-004 review, round 1

**Verdict: APPROVED** ✅ (merged)

- PM rerun: lint ✅, typecheck ✅, `pnpm test:e2e` → 5 specs, 34 tests, all green (2 min 37 s).
- Code read: `config.ts` (Zod `strictObject` + `discriminatedUnion` mirroring `schema.json`; the `XDECK_CONFIG_DIR` hook is unpackaged-only), `config-ipc.ts` (sender must be the shell window's main frame with an app URL; guests and subframes are rejected).
- Error screen screenshot reviewed: title, path, `columns.0.type` issue, Open settings folder, restart hint.
- AC3 sabotage (loosened union → (d) and (e) fail) done after a rebuild; reverted, diff empty.
- Check (g) uses the undocumented `ipcMain._invokeHandlers` but **throws** if it's missing, so it can't pass silently. Accepted.
- Deviations 1–5 accepted (per-session config dir reset per case; separate open-folder spec; Node `JSON.parse` message comparison; BOM strip; render nothing until config arrives).
- **Follow-up for TASK-011 (packaging):** `bundledConfigDirectory()` expects `process.resourcesPath/config` when packaged, so electron-builder must ship `resources/config` as `extraResources` → `config`.
