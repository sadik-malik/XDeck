# TASK-002b report

**Branch:** task/002b-columns-e2e   **Commits:** 9fea69f (gitignore), b00e35b (carousel frame, pngjs), eac44f1 (columns spec, pixel helper, fixture scrollbars), plus this report commit

## Summary
- **Pixel helper** (`e2e/helpers/pixels.ts`): `browser.electron.execute` runs `BrowserWindow.capturePage()`, decoded with `pngjs`. Each visible column edge is searched in a +/-3 device-px band for a red line (R>200, G<60, B<60) covering >=90 % of the visible edge. An edge passes when it is found within +/-2 device px. Edges outside the strip or window are skipped with a reason. Failures write the capture, an annotated copy (expected edges in green) and a JSON file to `e2e/artifacts/`.
- **Columns spec** (`e2e/specs/columns.e2e.ts`): states (a) to (f) run the pixel check after a layout settle (two rAF, then identical captures, max 2 s). (g) to (i) send synthetic `mouseWheel` events to the guests. (j) hit-tests the toolbar buttons.
- **Fixtures:** `carousel.html` gets the red frame. All three fixture pages now hide their own scrollbars, which the frame needed (see Deviations, item 1).
- **Two real findings from the pixel work** (not fixed in the app; see Open questions): a sub-pixel clip of the bottom edge at 150 %, and the strip's native scrollbar shortening the columns.
- **Sabotage** (AC3 and AC4) fails the test for the right reason and is reverted, with `git diff` empty.
- The suite is green three runs in a row. Lint, typecheck and build pass.

## Acceptance criteria
- [x] **AC1:** lint, typecheck and build exit 0 on HEAD eac44f1 (run after the last code change).
  ```
  $ pnpm lint      -> Checked 41 files in 31ms. No fixes applied.   exit=0
  $ pnpm typecheck -> tsc (node, web, e2e)                          exit=0
  $ pnpm build     -> ✓ built in 1.46s                              exit=0
  ```
- [x] **AC2:** `pnpm test:e2e` green three runs in a row (HEAD eac44f1). Full output per run is in the scratchpad (`final1..3.log`). Trimmed summaries:
  ```
  RUN 1 exit=0 secs=81
  [windows #0-0] 10 passing (16.3s)     <- columns.e2e.ts
  [windows #0-1]  6 passing (11.2s)     <- smoke.e2e.ts
  [windows #0-2]  7 passing (19.4s)     <- webview-security.e2e.ts
  Spec Files: 3 passed, 3 total (100% completed) in 00:01:08

  RUN 2 exit=0 secs=80
  [windows #0-0] 10 passing (16s)
  [windows #0-1]  6 passing (11.2s)
  [windows #0-2]  7 passing (19.4s)
  Spec Files: 3 passed, 3 total (100% completed) in 00:01:06

  RUN 3 exit=0 secs=81
  [windows #0-0] 10 passing (16.8s)
  [windows #0-1]  6 passing (11.1s)
  [windows #0-2]  7 passing (19.4s)
  Spec Files: 3 passed, 3 total (100% completed) in 00:01:06
  ```
  The columns spec runs in about 16 s, under the 90 s limit. The whole suite takes about 80 s.
  The columns tests, all passing in every run: (a) initial, (b) resized, (c) scrolled 300, (d) hide col-2, (e) expand col-1, (f) restore, (g) horizontal wheel over col-1, (h) horizontal wheel over the carousel, (i) vertical wheel over col-1, (j) toolbar hit-test.
- [x] **AC3 (the test can fail):** `paddingBottom: '3px'` added to the `XColumn` container style. (a) fails on the **bottom** edge. The artifacts are written and the diagnostic offset is -5 device px (outside the +/-3 search band).
  ```
  == (a) initial
  settled=true dpr=1.5 image=1899x1073 window=1266x715 scrollLeft=0
  column  edge    expected  found   offset  coverage  status
  col-0   bottom       991       -       -      0.00  missing
  col-1   bottom       991       -       -      0.00  missing
  col-2   bottom       991       -       -      0.00  missing
  col-3   bottom       991       -       -      0.00  missing    (left/top/right of each column still found)
  artifacts: e2e\artifacts\columns--a-initial.capture.png, ...annotated.png, ...json
  Error: (a) initial: 4 edge(s) failed
  ...
  6 failing (the same bottom edge fails in (a) to (f), since the inset persists)
  4 passing (g) to (j)
  ```
  Revert: `git checkout -- src/renderer/src/columns/XColumn.tsx` then `git diff -- src/renderer/src/columns/XColumn.tsx | wc -c` gives `0`.
- [x] **AC4 (the test can fail):** `if (false && layout.hideCol2 && def.id === 'col-2')` in `columnWidth`, so Hide does nothing. Test (d) fails:
  ```
  ✖ (d) Hide col-2: width 0, no red in its former area, col-3 moves left by 380
  Error in "... (d) Hide col-2 ..."
  Expected: 0
  Received: 380
  ```
  Revert: `git checkout -- src/renderer/src/columns/columnDefs.ts`, then the diff is `0` bytes.
  Proof that no app code remains changed: `git diff main --stat -- XDeck XDeck.xcodeproj public .github/workflows/release.yml` prints nothing, `git diff main -- src` prints nothing, and `git status --short` is empty.
- [x] **AC5:** edge-finding numbers for (a) and (c) (from the final run, `final3.log`, window and DPR as shown). Expected and found are device px. Every visible edge is found at offset 0.
  ```
  == (a) initial
  settled=true dpr=1.5 image=1899x1073 window=1266x715 scrollLeft=0
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

  == (c) scrolled 300
  settled=true dpr=1.5 image=1479x920 window=986x613 scrollLeft=300
  column  edge    expected  found   offset  coverage  status
  col-0   left        -450       -       -         -  skipped: outside the visible strip (x=-450, strip [0, 1479))
  col-0   right        221     221       0      1.00  found
  col-0   top            0       0       0      1.00  found
  col-0   bottom       838     838       0      1.00  found
  col-1   left         222     222       0      1.00  found
  col-1   right        791     791       0      1.00  found
  col-1   top            0       0       0      1.00  found
  col-1   bottom       838     838       0      1.00  found
  col-2   left         792     792       0      1.00  found
  col-2   right       1361    1361       0      1.00  found
  col-2   top            0       0       0      1.00  found
  col-2   bottom       838     838       0      1.00  found
  col-3   left        1362    1362       0      1.00  found
  col-3   right       1931       -       -         -  skipped: outside the visible strip (x=1931, strip [0, 1479))
  col-3   top            0       0       0      1.00  found
  col-3   bottom       838     838       0      1.00  found
  ```

## Edge-finding summary per state (run 3)
- (a) 15 visible edges found, col-3 right skipped (outside the window).
- (b) window content 986x613 CSS (`setSize(1000,650)`, the window frame is included): col-3 fully outside, all its edges skipped.
- (c) 14 found, col-0 left and col-3 right skipped.
- (d) col-2 hidden (width 0), col-3 moved 380 CSS px in content coordinates, no stray red in the former area.
- (e) col-1 spans the strip (1478 right, 862 bottom), all four found, others hidden.
- (f) back to the (a) geometry, all visible edges found.

## Resolved versions
- Electron 44.7.0 (`process.versions.chrome` = 152.0.7977.130), chromedriver auto-matched to 152.0.7977.130 by `@wdio/electron-service`.
- webdriverio 9.32.0, `@wdio/cli` 9.32.0, `@wdio/electron-service` 10.4.0, electron-vite 5.0.0.
- **New devDependencies:** `pngjs@7.0.0` (latest; no bundled types), `@types/pngjs@6.0.5`.
- Node 24.19.0, pnpm 11.20.0.

## Deviations from spec
1. **Fixture scrollbars hidden (all three fixture pages).** The guests have their own vertical scrollbar, about 23 device px wide at 150 %. The 1 px frame then sits at the scrollbar's left edge, not the column's edge. The top row stops short by the same amount. Measured: col-0 top coverage 0.90 and right edge found on the neighbour line. Hiding the scrollbars (`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`) keeps scrolling working. The carousel's own scroller is hidden the same way. This is a fixture-only change.
2. **(e) integer content height.** Before (e), the test calls `setContentSize` with the current content size, which leaves the content height whole (the state header shows 986x614 CSS). Reason: finding S1 below. The spec only named `setSize` for (b) and (f), and those still use `setSize`.
3. **(d) "no red in its former area".** After col-2 is hidden, col-3 occupies the same area, so a literal check cannot work. The check scans the interior of col-3's box with a 3 px margin around its own frame lines. Any red there would come from col-2 still painting.
4. **(d) "moves left by 380".** Measured in content coordinates (`rect.left - strip.left + scrollLeft`). The strip's scroll clamps when the content shrinks (300 became 222), so screen positions alone would not show the shift.
5. **Neighbour lines reserved.** Adjacent columns are 1 device px apart, so a neighbour's red line could stand in for a missing edge (a false pass for a 3+ px shift). Vertical searches therefore skip the expected lines of the other visible columns. This is a test-design safeguard that the spec does not mention.
6. **Diagnostic band.** For a missing edge the helper reports where a red line sits within +/-12 px (`nearestOutsideBand`). It is used only for the report, never for pass/fail.
7. **Smooth scroll settle.** Wheel scrolling of the strip is animated. `settleStripScroll()` waits until `scrollLeft` is unchanged for 300 ms before any baseline or comparison. Without it, (g) returned at 8 px and (h) compared against a moving value.
8. **(j) extra checks.** The footer must hold exactly two buttons (the dev toggles), and each centre must also lie inside the display work area, not only the window.

## Open questions (app findings, not changed; PM decision)
- **S1. Bottom edge clipped by a sub-pixel layout (app).** At 150 % the window content height can be fractional (715.33 CSS in the initial window; 613.33 after `setSize(1000,650)`). The footer measures 39 CSS px, so the strip's bottom edge lands at a fraction too, e.g. 676.33 CSS. Chromium lays out a guest at the next whole CSS px: probe values in the initial window were webview bottom 676.33, guest `innerHeight` 677, frame rect bottom 677.33. The column's `overflow-hidden` clips the bottom 0.67 CSS px, and the bottom red line is invisible (no red row in the capture below y=850). This shows up with no strip scrollbar, as in (e). Candidate fix: floor the webview height in the strip layout. Not done, since it is an app change.
- **S2. Native strip scrollbar takes height.** When the columns overflow, the strip's horizontal scrollbar (about 15.33 CSS px at 150 %) sits under the columns, so the columns end above the strip bottom (559 vs 574.33 in one state). This is current behaviour, not a bug, but it is a design point.
- **S3. Test window size.** `setSize(1000, 650)` gives a content area of 986x613 CSS at 150 % (the native frame counts). The test uses the measured values, so this does not affect the checks.
- Earlier open questions from TASK-002 still stand (subdomain allow-list, SSO, CSP style message). Not in this task's scope.

## Needs human verification
- None required by this task. The wheel checks are still synthetic, and the TASK-002 touchpad check remains the source of truth for scroll chaining.
- Suggested visual check for S1: open the expanded col-1 state (Expand col-1) at 150 % and look at the bottom of the column against the footer border. The PM can decide whether a fix is wanted.

## Process hygiene
- `e2e/artifacts/` is gitignored. The AC3 and AC4 artifacts (captures, annotated copies and JSON) are left there.
- Each `wdio` run opened fake-X on a free port (`port: 0`), never 4780, and closed it in `onComplete`. No long-lived process was started. After the last run, `tasklist` shows no electron or chromedriver process.
- The temporary probe spec (`e2e/specs/zz-probe.e2e.ts`) was created to measure S1 and deleted before any commit. It is not in the branch.
- Protected paths unchanged: `git diff main --stat -- XDeck XDeck.xcodeproj public .github/workflows/release.yml` prints nothing.
