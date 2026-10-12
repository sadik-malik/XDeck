# TASK-002c report

**Branch:** task/002c-subpixel-clip   **Commits:** cce895a (test: fractional states, setContentSize removed), 5ba51b5 (app fix), plus this report commit

## Summary
- **Fix (app):** `XColumn.tsx` sets the `<webview>` height to `round(down, 100%, 1px)` (was `100%`). The guest is always a whole number of CSS px, no larger than its column. Before the fix a fractional column height let the guest lay out one px taller than its box, and the column's `overflow-hidden` clipped the bottom edge (finding S1).
- **Test:** states (a) and (e) run at a fractional content height. The `setContentSize` workaround in (e) is gone (grep proof below). The layout height is asserted to be fractional in both states.
- **Verified:** the new (e) fails on the unfixed app (col-1 bottom edge missing) and passes with the fix. Full `pnpm test:e2e` is green three runs in a row.
- **S2 record:** a capture of the overflowing strip (scrollbar under the columns) is at `e2e/artifacts/columns-a-initial-overflow.png` (gitignored). No design change.
- Lint, typecheck and build exit 0.

## Acceptance criteria
- [x] **AC1:** lint, typecheck and build pass (run after the last code change, on 5ba51b5 with the fix restored).
  ```
  $ pnpm lint        -> Checked 41 files in 40ms. No fixes applied.   exit=0
  $ pnpm typecheck   -> tsc node, web, e2e                            exit=0
  $ pnpm build       -> exit=0
  ```
- [x] **AC2:** `pnpm test:e2e` green three runs in a row (HEAD 5ba51b5). Full logs: scratchpad `final1..3.log`.
  ```
  RUN 1 exit=0   [chrome 152] 10 passing (15.8s)  6 passing (11.1s)  7 passing (19.4s)   Spec Files: 3 passed, 3 total (00:01:04)
  RUN 2 exit=0   [chrome 152] 10 passing (16.1s)  6 passing (11.1s)  7 passing (19.5s)   Spec Files: 3 passed, 3 total (00:01:06)
  RUN 3 exit=0   [chrome 152] 10 passing (16.6s)  6 passing (11.2s)  7 passing (19.4s)   Spec Files: 3 passed, 3 total (00:01:03)
  ```
  `setContentSize` is gone from the e2e sources:
  ```
  $ grep -rn "setContentSize" e2e/        (no output)   exit=1
  ```
  Baseline before any change (for comparison): 10 / 6 / 7 passing.
- [x] **AC3 (the test can fail):** the fix was reverted temporarily (`XColumn.tsx` restored to its pre-fix content from cce895a, i.e. `height: '100%'`), the test kept, and the build rerun. State (e) fails on the **bottom** edge:
  ```
  == (e) expand col-1
  settled=true dpr=1.5 image=1479x1073 window=986x715 scrollLeft=0
  col-1   left           0       0       0      1.00  found
  col-1   right       1478    1478       0      1.00  found
  col-1   top            0       0       0      1.00  found
  col-1   bottom      1014       -       -      0.00  missing
  Error: (e) expand col-1: 1 edge(s) failed
  9 passing, 1 failing
  ```
  Restore: `git checkout -- src/renderer/src/columns/XColumn.tsx`. Then `git diff HEAD -- src/renderer/src/columns/XColumn.tsx | wc -c` gives `0`, and `git status --short` is empty.
- [x] **AC4:** edge tables for the fractional states, from the final run (`final3.log`). Layout height is the document's fractional height; `innerHeight` is an integer by CSSOM.
  ```
  fractional content: innerHeight=715 layout height=715.3333740234375

  == (a) initial, fractional height       (window=1266x715, dpr 1.5, strip scrollbar present)
  column  edge    expected  found   offset  coverage  status
  col-0   left           0       0       0      1.00  found
  col-0   right        671     671       0      1.00  found
  col-0   top            0       0       0      1.00  found
  col-0   bottom       991     991       0      1.00  found
  col-1   left         672     672       0      1.00  found
  col-1   right       1241    1241       0      1.00  found
  col-1   top            0       0       0      1.00  found
  col-1   bottom       991     991       0      1.00  found
  col-2   left        1242    1242       0      1.00  found
  col-2   right       1811    1811       0      1.00  found
  col-2   top            0       0       0      1.00  found
  col-2   bottom       991     991       0      1.00  found
  col-3   left        1812    1812       0      1.00  found
  col-3   right       2381       -       -         -  skipped: outside the visible strip (x=2381, strip [0, 1899))
  col-3   top            0       0       0      1.00  found
  col-3   bottom       991     991       0      1.00  found

  == (e) expand col-1, fractional height  (window=986x715, dpr 1.5, no strip scrollbar)
  col-0 / col-2 / col-3: skipped (hidden, width 0)
  col-1   left           0       0       0      1.00  found
  col-1   right       1478    1478       0      1.00  found
  col-1   top            0       0       0      1.00  found
  col-1   bottom      1014    1013      -1      1.00  found
  ```
  Notes on these tables:
  - (a) passes before and after the fix. The strip's horizontal scrollbar (about 15.33 CSS px) sits under the columns, so the column bottoms land on a whole px (661.0 CSS, 991 device). The clip does not show here. Only (e) exercises S1.
  - (e) col-1's bottom is found at row 1013, offset -1, inside the ±2 tolerance. The expected row 1014 is computed from the unrounded column box (676.33 CSS = 1014.5 device). The guest is now 676 CSS px tall, so its last row is 1013. The offset is an artifact of the expected position, not a clip, so the tolerance was not changed.

## Fix and rationale
- `src/renderer/src/columns/XColumn.tsx`: `style={{ ..., height: 'round(down, 100%, 1px)' }}` on the `<webview>`.
- Chosen over the two options in the spec for simplicity. One CSS line, no `ResizeObserver`, no re-render on resize. Electron 44 is Chromium 152, which supports CSS `round()` (verified: the fix passes, and the reverted build fails).
- The sub-px remainder (0.33 CSS px at 150 %) is the column's transparent background over the strip background, below the webview. It is not clipped from the guest.
- Width is not rounded. The task scopes the fix to height. No fractional width was observed in the tested states (the strip width is whole at 150 %), so the right edge is not known to clip. Open question below.

## Deviations from spec
1. **Fractional state set with `setBounds`, not `setContentSize`.** `setContentSize` snaps the content height to an even DIP value at 150 % (probe: DIP 713 -> 714, 715 -> 716, 717 -> 718), so it cannot produce a fraction. `setBounds` with frame height 752 at the current width gives content 715 DIP = 1073 physical px (odd) = 715.33 CSS px. This matches the initial window. The helper asserts the layout height is not an integer, so the state cannot pass by accident.
2. **`innerHeight` is an integer** (CSSOM `long`). The fraction is logged from `document.documentElement` layout height (715.333...) and the spec's "log innerHeight" is met by logging both.
3. **The spec's "before (a)" fractional state is masked by the strip scrollbar** (see AC4). The fraction still exists and both (a) and (e) run at it. The clip only appears when no scrollbar is present, which is (e).
4. **AC4 (e) bottom offset is -1 device px** (inside the tolerance), explained above.
5. **Failing run before the fix** (test commit cce895a, no app fix): (e) failed with `col-1 bottom 1014 missing`, not a timeout. Two earlier helper attempts were dropped before any commit: a `setContentSize` with a fractional DIP height (the argument failed to serialize, and the content height snaps to an even DIP), and a `setContentSize` with 715 DIP (it gave 716 CSS). Neither is in the branch.

## Resolved versions
- Node 24.19.0, pnpm 11.20.0.
- Electron 44.7.0 (Chromium 152.0.7977.130; chromedriver auto-matched to 152.0.7977.130).
- electron-vite 5.0.0, webdriverio 9.32.0, @wdio/electron-service 10.4.0.
- No new dependencies.

## Open questions
- **Width clip.** A fractional column width (e.g. from a fractional strip width at another scale or window size) could clip the right edge the same way. Not observed in any tested state. A `round(down, 100%, 1px)` on the width would be the same change. PM decision whether to add it now or on a test that shows it.
- **S2 (strip scrollbar takes height).** Unchanged, per spec. Capture: `e2e/artifacts/columns-a-initial-overflow.png` (not committed; the directory is gitignored). It shows the scrollbar at the bottom of the strip, under the columns, with the frame's side lines ending above it.

## Needs human verification
- None required by this task. Optional: at 150 %, open Expand col-1 and check the bottom of the column against the footer border. The remaining 0.33 CSS px gap should show the strip background, not a clipped line.

## Process hygiene
- Only `wdio` runs I started were executed, each under `timeout`. Port 4780 not touched. Fake-X uses an ephemeral port.
- `tasklist` shows no electron, chromedriver or wdio process after the last run.
- Temporary probe specs (`e2e/specs/zz-probe.e2e.ts`) were created for measurements and deleted before any commit. They are not in the branch.
- `git status --short` is empty after the report commit. Files staged explicitly per commit.
