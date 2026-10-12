# TASK-005 review, round 1

**Verdict: APPROVED** ✅ (merged)

- PM rerun: lint ✅, typecheck ✅, `pnpm test:e2e` → 9 spec files, 41 tests, green (3 min 54 s).
- Code read: `src/shared/columns.ts`. The URL-by-type, `isXColumn` (exact X hosts), `+68` on the leftmost X column, `persist:x` / `persist:custom` by origin, and the main-process allow-list from the config it loaded itself all match the spec.
- AC3 sabotage (+68 on every X column → layout (a) fails `[448,448,448,448]`) reverted; diff empty.
- **Width grid accepted, as a documented deviation from Swift.** Widths snap down to the smallest CSS step that is also a whole number of device px (`widthGridStep(dpr)`): 1 px at 100%/200%, 2 px at 150%, 4 px at 125%/175%. That costs up to (step − 1) px per column versus Swift's exact width, in exchange for edges that are never clipped. It was only measured at 150%. → **TASK-005b** verifies the other scales.
- Deviations accepted: 0-based dev toggles, layout states split across spec files (one config per worker session), fixtures in `e2e/configs/layout/`, `setContentBounds` for sizing, fixture origin removed from the shell allow-list (custom-column origins now cover it), the profile placeholder keeps its width (moot once TASK-007 adds the login gate).
- Watch item: the E2E wall time is now ~4 min (9 sessions). Acceptable for now; revisit if it passes ~8 min.
