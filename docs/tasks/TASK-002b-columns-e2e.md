# TASK-002b: `columns` E2E spec — real-pixel edges, scroll chaining, reachability

**Status:** IN_PROGRESS  **Branch:** `task/002b-columns-e2e`  **Roadmap:** §5.4

## Goal

Lock in, as an automated regression suite, what the user verified by hand in TASK-002: the columns render fully, follow layout changes, and pass horizontal scroll to the strip. Every claim is checked on **real window pixels** (`BrowserWindow.capturePage()`), never on element rects alone.

The human check showed native swipe chaining works, so **no wheel forwarder** is added.

## Scope

1. **Pixel helper (`e2e/helpers/pixels.ts`)**
   - Capture the shell window via `browser.electron.execute(... win.capturePage() ...)` → PNG → decode with `pngjs` (a devDependency).
   - Given a column's expected rect (its `[data-column]` container `getBoundingClientRect()` × `window.devicePixelRatio`), locate the fixture's red 1 px border on each of the 4 edges.
     - Search a ±3 device-px band around each expected edge for a run of "red" pixels (R > 200, G < 60, B < 60) covering ≥ 90 % of the visible edge length.
     - Report found vs expected offsets.
   - Columns partly outside the window (e.g. col-3 at the right): check only edges inside the window, and say which edges were skipped.
   - On failure, write the capture plus an annotated copy (expected edges drawn in green) to `e2e/artifacts/`.
2. **Fixture tweak:** `explore.html` (col-0 in tests) and `carousel.html` get the same red border frame as `column.html`, so all four columns can be edge-checked.
3. **`e2e/specs/columns.e2e.ts`**, with these states in order. After each state, wait for layout to settle (two `requestAnimationFrame`s in the renderer, then a short poll until two consecutive captures are identical, max 2 s):
   - (a) initial: every visible edge of every column is found within **±2 device px**;
   - (b) window resized to 1000×650 (`win.setSize`): the same check;
   - (c) strip scrolled to `scrollLeft = 300`: the same check, with the columns shifted by 300 CSS px;
   - (d) Hide col-2: col-2's container has width 0 and **no red pixels in its former area**, and col-3 moves left by 380 CSS px (edges found);
   - (e) Expand col-1: col-1 spans the strip width with all its visible edges found, and the others are hidden;
   - (f) restore (un-expand, un-hide, scroll 0, window back to its initial size): the same as (a).
4. **Scroll chaining (synthetic; the human check stays the source of truth)**:
   - (g) horizontal `mouseWheel` (`deltaX: -120`) sent with `sendInputEvent` to **col-1's guest** at its centre → the strip's `scrollLeft` increases and col-1's own `scrollX` stays 0;
   - (h) the same over **col-2's carousel** → the carousel's `scrollLeft` increases and the strip's doesn't change;
   - (i) a vertical wheel over col-1 → the guest's `scrollY` increases and the strip's `scrollLeft` doesn't change.
5. **Reachability:** (j) for each toolbar button, `document.elementFromPoint` at its centre returns the button itself, and the centre lies inside the window's content bounds (within the work area).
6. **Hygiene:** add `.claude/worktrees/` to `.gitignore` (agent worktrees were showing up as untracked).

## Out of scope
App behaviour changes (if a check fails because of an app bug, report it; **don't** change the app to fit the test without flagging it), config, X scripts, toolbar visuals.

## Acceptance criteria
- **AC1:** lint, typecheck, build pass.
- **AC2:** `pnpm test:e2e` is fully green **3 runs in a row** (paste the summaries). The new spec stays under 90 s.
- **AC3 (the test can fail):** temporarily give `XColumn`'s container a 3 px bottom inset (e.g. `paddingBottom: 3px` on the column container) so the webview's bottom edge moves up. Show that (a) fails on the **bottom** edge, with the annotated artifact written. Then revert, and paste the failure output.
- **AC4 (the test can fail):** temporarily make Hide do nothing. Show that (d) fails. Then revert.
- **AC5:** the edge-finding numbers (expected vs found, per column and edge) for states (a) and (c) are pasted in the report.
