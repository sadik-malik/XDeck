# TASK-002c: Fix the sub-pixel bottom clip at fractional scaling (S1)

**Status:** IN_PROGRESS  **Branch:** `task/002c-subpixel-clip`  **Roadmap:** §2 (layout), §5.4

## Problem (found in TASK-002b, finding S1)

At 150% display scaling the window's content height can be fractional in CSS px (e.g. 715.33). The column strip's height is then fractional too (e.g. a webview of 676.33 CSS px). Chromium lays the guest page out at 677 CSS px, so the **bottom ~0.67 CSS px of every column is clipped**: the fixture's bottom red line, and in the real app the last pixel row of X's UI, disappear.

TASK-002b hid this in check (e) by forcing a whole-number content height with `setContentSize`. That workaround must go; the app has to be right at fractional sizes.

This is the same class of bug as the abandoned Tauri attempt's clipped bottom edge, so it gets a real fix and a real test.

## Scope
1. **Fix it in the app.** Make each column's `<webview>` height a whole number of CSS px that is ≤ the available strip height. Options:
   - floor the strip height in `ColumnStrip`/`XColumn`, measured with a `ResizeObserver` on the strip, and set the webview's `height` in px;
   - or give the strip `height: calc(...)` with rounding, if CSS `round()` is supported in Electron 44's Chromium.

   Pick the simplest one that works, and explain why. Any leftover sub-pixel gap (< 1 CSS px) must sit **below** the webview, painted with the strip background, not clipped from the guest.
2. **Remove the `setContentSize` workaround** from `columns.e2e.ts` (e).
3. **Add a fractional-size variant**: before (a) and (e), size the window so the content height is deliberately fractional at the current scale. For example, set an odd **physical** height via `setBounds` with a DIP height that gives `.33`/`.67` CSS px at 150%. Log the resulting `innerHeight` so the report shows it really is fractional. All four edges of every visible column must be found within ±2 device px in that state too.
4. Check the case where the strip shows a horizontal scrollbar (columns overflow). The webviews must still end above the scrollbar, with no clipping. Record what the scrollbar looks like (finding S2) in the report as a screenshot path, but **don't** change its design; that belongs to the toolbar/UI-fidelity task.

## Acceptance criteria
- **AC1:** lint, typecheck, build pass.
- **AC2:** `pnpm test:e2e` is green 3 runs in a row, with the fractional variants included and `setContentSize` gone from the spec (`grep` proof).
- **AC3 (the test can fail):** temporarily revert only the app fix (keep the new test). Show that the fractional variant fails on the **bottom** edge, then restore the fix. Paste the output.
- **AC4:** edge tables for the fractional (a) and (e) states, including the logged fractional `innerHeight`.
