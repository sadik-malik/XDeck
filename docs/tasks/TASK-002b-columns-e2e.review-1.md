# TASK-002b review, round 1

**Verdict: APPROVED** ✅ (merged as `5bbfdeb`)

- PM rerun: lint ✅, typecheck ✅, `pnpm test:e2e` → columns 10/10, smoke 6/6, webview-security 7/7.
- Sabotage proofs (AC3 bottom inset → (a) fails on the bottom edge; AC4 no-op Hide → (d) fails) reported and reverted; `git diff main -- src` is empty.
- Deviations 1, 3, 4, 5 accepted: fixture scrollbars hidden (a fixture artifact), the (d) area check, neighbour-line reservation, settle waits.
- **Deviation 2 is NOT accepted long-term.** (e) forces a whole-number content height to avoid finding **S1** (bottom clip at fractional heights). That's a real app bug, so it moves to **TASK-002c**, which fixes the app and removes the workaround.
- Finding S2 (strip scrollbar under the columns) is deferred to the UI-fidelity task (010).
