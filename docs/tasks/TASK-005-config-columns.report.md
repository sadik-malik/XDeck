# TASK-005 report

**Branch:** task/005-config-columns   **Commits:** 2624c96 (fake-X pages), b843c26 (main allow-list, partitions), d4baa9e (renderer columns from config), 6d16b14 (columns and webview-security on fixture config), edf614b (layout specs, width grid), plus this report commit

## Summary
- **Columns come from settings.json.** `src/renderer/src/columns/ColumnStrip.tsx` builds the strip from the loaded config. `columnDefs.ts` (the hard-coded `COLUMNS`) is gone. `XColumn.tsx` is renamed to `Column.tsx`, because it now also renders custom and placeholder columns.
- **Widths are the Swift geometry** (`src/shared/columns.ts`, `columnWidths`): `columnWidth` or `(strip − 68) / n`, and the leftmost X column gets +68. `isXColumn`, `columnTarget` and the X hosts are shared by main and renderer.
- **Main owns the guest allow-list.** `setCustomGuestOrigins` takes the http/https origins of the custom columns from the config main loaded itself (`src/main/index.ts`). `guardWebviewAttach` picks the partition from the guest's origin: `persist:x` for X origins, `persist:custom` otherwise. `persist:custom` gets the same permission denial and Chrome user agent as `persist:x`. The fixture origin is no longer in the allow-list or the shell preload.
- **Dev toggles address columns by index.** `Hide #2` and `Expand #1` (0-based, the same as the `col-N` ids). A button only appears when its index exists in the config.
- **Width rounding was needed.** Widths are rounded down to a 2 CSS px grid at 150 % (see Deviations 2). Without it, the real-pixel checks fail: the right frame of a column is clipped.
- **E2E:** all 9 spec files pass, 41 tests, on three consecutive full runs. Columns, webview-security and config run on fixture configs. Four layout spec files cover (a) to (g).

## Acceptance criteria
- [x] **AC1** lint, typecheck, build pass (on the final code, after the AC3 revert):
  ```
  $ pnpm lint       -> Checked 78 files in 76ms. No fixes applied.     exit=0
  $ pnpm typecheck  -> tsc node, web, e2e                             exit=0
  $ pnpm build      -> ✓ built in 2.60s                               exit=0
  ```
- [x] **AC2** `pnpm test:e2e` green three runs in a row (HEAD edf614b, each run builds first). Logs: scratchpad `final1.log`, `final2.log`, `final3.log`. Each run is the same:
  ```
  columns.e2e.ts              10 passing
  config-open-folder.e2e.ts    1 passing
  config.e2e.ts              10 passing
  layout-fractional.e2e.ts    2 passing
  layout-order.e2e.ts         3 passing
  layout-single.e2e.ts        1 passing
  layout.e2e.ts               1 passing
  smoke.e2e.ts                6 passing
  webview-security.e2e.ts     7 passing
  RUN 1  Spec Files: 9 passed, 9 total (100% completed) in 00:03:43   exit=0
  RUN 2  Spec Files: 9 passed, 9 total (100% completed) in 00:03:43   exit=0
  RUN 3  Spec Files: 9 passed, 9 total (100% completed) in 00:03:41   exit=0
  ```
- [x] **AC3** the test can fail. Temporary sabotage in `src/shared/columns.ts`: `index === leftmost` was replaced by `columns[index].isX`, which gives +68 to every X column. The build and `layout.e2e.ts` then failed:
  ```
  Error: expect(received).toEqual(expected) // deep equality
  - Expected  - 3
  + Received  + 3
    Array [
      448,
  -   380,
  -   380,
  -   380,
  +   448,
  +   448,
  +   448,
  ```
  Revert: `git checkout -- src/shared/columns.ts`, then `git diff -- src/shared/columns.ts | wc -c` gives `0`, and `git status --short` is empty.
- [x] **AC4** the spike's hard-coded columns are gone from `src/`:
  ```
  $ grep -rn "COLUMNS\|/explore\|column\.html\|carousel\.html\|xPath\|fixturePath\|col-[0-3]" src/     (no output)   exit=1
  ```
  (`src/renderer/src/columns/columnDefs.ts` is deleted. `col-N` ids are generated as `` `col-${index}` ``.)
- [x] **AC5** `pnpm dev` with the bundled default config (forYou, following, notifications, profile, columnWidth 380) against real x.com. Logged-out pages. Screenshot: `C:\Users\devel\AppData\Local\Temp\claude\C--Users-devel-Code-XDeck\eeda5582-3def-40fd-9485-15de7360ac07\scratchpad\ac5-dev-default.png` (copy at `e2e/artifacts/ac5-dev-default.png`, gitignored). It shows the forYou, following and notifications columns on x.com's logged-out sign-in flow, with the strip's horizontal scrollbar under them. The profile placeholder is past the right edge. The capture hook fires once, 1 s after the shell loads, so it caught blank columns. For this capture only, I raised the delay to 20 s, ran `pnpm dev`, and then reverted it (`git diff -- src/main/index.ts` is `0` bytes).

### Layout measurements (observed by passing assertions)
| State | Spec file | Config | Measured column widths (CSS px) | Pixels |
|---|---|---|---|---|
| (a) columnWidth 380, four X columns | layout.e2e.ts | layout/a.json | 448, 380, 380, 380 (exact, DOM) | every visible edge found |
| (b) no columnWidth, content 1280 | layout-fractional.e2e.ts | layout/b.json | 370, 302, 302, 302 (raw 371 and 303, rounded to the 2 px grid) | every visible edge found |
| (c) one column, content 1280 | layout-single.e2e.ts | layout/c.json | 1280 (exact) | every visible edge found |
| (d) non-X custom first, columnWidth 380 | layout-order.e2e.ts | layout/d.json | 380, 448, 380, 380, 380 (offsets 0, 380, 828, 1208, 1588) | not checked (placeholders) |
| (e) profile placeholder | layout-order.e2e.ts | same | placeholder, no webview, text "profile: not configured yet" | n/a |
| (f) fractional strip W = 987.333 (frame 1001 DIP) | layout-fractional.e2e.ts | layout/b.json | 296, 228, 228, 228 (sliver 7.33 at the end) | every visible edge found |
| (g) partitions | layout-order.e2e.ts | same | localhost guest in `persist:custom`, 127.0.0.1 X guest in `persist:x`, ftp:// placeholder with the error | n/a |

### Width rounding was needed
Yes, at 150 % (dpr 1.5). Without rounding, state (b) and (f) fail the real-pixel check: the right frame of a column is missing from the capture, and the frame line sits one device px into the next column. The rounding grid is 2 CSS px at 150 % (whole CSS px and whole device px), not the 1 px the spec suggests (see Deviations 2).

## Resolved versions
- zod 4.6.5 (runtime), electron 44.7.0, electron-vite 5.0.0, typescript 7.0.2, webdriverio 9.32.0 (from `pnpm ls`).
- Chromium used by Electron for E2E: 152.0.7977.130 (chromedriver).

## Deviations from spec
1. **Dev toggles are 0-based by index.** `Hide #2` is `col-2` (the third column), and `Expand #1` is `col-1`. The spec example is read this way, because the existing `col-N` ids and tests use 0-based indices. The buttons are shown only when the index exists in the config. Existing selectors were renamed (`button=Hide col-2` to `button=Hide #2`, etc.), and no assertion changed.
2. **Width grid is 2 CSS px at 150 %, not `round(down, …, 1px)`.** Evidence, from the real-pixel check of state (f) at fractional W:
   - A 1 CSS px grid (floor to whole CSS px): edges fail, `col-1 right` and `col-3 right` missing.
   - A 1/64 px floor after device-pixel floor: state (b) still fails, every right edge missing.
   - The 2 CSS px grid (`widthGridStep`, `src/shared/columns.ts`): states (b) and (f) pass.

   A width must be a whole number of CSS px and of device px. My working hypothesis, not verified directly: a guest's layout width is an integer CSS px, so a fractional box can round up past its edge and clip the right frame. The outcomes above fit that, but I did not read `innerWidth` of a guest. The cost is a sliver of up to 8 CSS px at the strip's end (state (f): 7.33). At other scales the grid differs (1 CSS px at 100 % and 200 %). Only 150 % was tested.
3. **Layout states are split across four spec files.** Each file needs its own settings.json, and the app reads it once per launch. A relaunch leaves the main-process bridge stale (TASK-004). `wdio.conf.ts` `SPEC_CONFIGS` maps each spec file to a fixture, and wdio starts one worker session per spec file. `layout.e2e.ts` holds (a). `layout-fractional.e2e.ts` holds (b) and (f). `layout-single.e2e.ts` holds (c). `layout-order.e2e.ts` holds (d), (e) and (g).
4. **Layout fixtures are in `e2e/configs/layout/`, not `e2e/configs/layout-*.json`.** With the fixtures at the top level, the config parity test (e) had 21 files instead of 16, ran past the 60 s mocha timeout, and aborted the session. The subdirectory is not read by (e), so (e) is unchanged.
5. **`config.e2e.ts` starts on `layout/columns.json`** (the mapping in `wdio.conf.ts`). Its (g) needs the column 1 fixture guest on the first launch. No assertion in config.e2e changed.
6. **Window sizes use content bounds.** `setBounds` sets the frame, which includes about 14 DIP of native borders. So `setBounds(1280)` gives a 1266 content width. The layout specs use `setContentBounds` for exact content widths, and `setWindowBounds` only for (f).
7. **Fixture origin removed from the shell allow-list and preload.** `XDECK_FIXTURE_ORIGIN` is still set by wdio `onPrepare` and used by `webview-security.e2e.ts` and the config fixtures. It is no longer in `src/`. `/explore` stays in the fake-X server routes, but nothing in the app loads it.
8. **Partition is chosen from the origin.** `isXColumn` uses the host, as the spec says. A custom column with an X host on a different origin therefore gets the X layout (+68) but `persist:custom`. This is deliberate: cookies stay with the X origin.
9. **Profile placeholder keeps its width.** Swift gave a `profile` column with no username zero width. The spec asks for a placeholder, so it occupies its width and can be the leftmost X column.
10. **`webview-security.e2e.ts` (a)**: the column 0 URL is now `/home` (forYou, under `XDECK_X_ORIGIN`), not `/explore`. Only the expected list changed.
11. **`columns.e2e.ts` helpers moved** verbatim to `e2e/helpers/columns.ts` so the layout specs can share them. The assertions are unchanged.

## Open questions
- **Width grid at other scales.** The grid is `widthGridStep`, computed from the device pixel ratio. Only 150 % was measured. A check at 125 % and 200 % would show whether the rule holds (`e2e` would need a DPI setting, which we have not got).
- **Guest clip mechanism.** The integer-guest-width hypothesis (Deviations 2) is not confirmed. Reading a guest's `innerWidth` in state (b) would confirm or reject it.
- **Placeholder text.** `profile: not configured yet` and `only http and https URLs can be shown: <url>` are my wording. Confirm if the copy matters.
- **`/explore` route.** Unused by the app now. Delete it, or keep it for manual checks?

## Needs human verification
- The AC5 screenshot shows x.com's logged-out flow. A human check of the columns with a real login is for TASK-007.
- Nothing else needs a human check.

## Process hygiene
- Every wdio run was run directly, with `timeout` and a per-run timeout. Port 4780 was not used (the fake-X server uses an ephemeral port).
- The dev run for AC5 was stopped by PID (the electron-vite tree from this worktree). `Get-CimInstance` showed zero processes from this worktree afterwards.
- The AC3 and AC5 temporary edits were reverted, and each revert is proven by an empty `git diff` on that file.
- `e2e/artifacts/` is gitignored. Its failure captures from the (b) and (f) debugging runs are still there.
- Commits are made with `Co-Authored-By: Claude Haiku 5.5`. No push or merge.
