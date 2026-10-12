# TASK-005: Column strip driven by settings.json (widths, +68 rule, custom columns)

**Status:** IN_PROGRESS  **Branch:** `task/005-config-columns`  **Roadmap:** §1 (Columns row), §5.2 (`layout` spec)

## Goal

Replace the hard-coded spike columns with columns built from the loaded `settings.json`, using **exactly** the Swift geometry (`XDeck/View/ContentView.swift` `makeColumn` and `body`; read them first). Zoom, shortcuts, the media overlay and X scripts are **not** in this task.

## Behaviour to port
- **Column URL by type:**
  - `forYou` / `following` → `<X>/home` (the tab clicking comes in TASK-006);
  - `notifications` → `<X>/notifications`;
  - `profile` → `<X>/<username>`, but the username comes with the login flow (TASK-007), so for now render the "not configured" placeholder for `profile` columns (same as Swift's `if let profileUrl`);
  - `custom` → its `url`.

  `<X>` is `https://x.com`, or `XDECK_X_ORIGIN` in unpackaged test builds.
- **`isXColumn`:**
  - the four X types are always X columns;
  - `custom` is an X column if its host is one of the allowed X hosts (TASK-002's exact list: x.com, www.x.com, mobile.x.com and the twitter.com equivalents), or, in test builds, the `XDECK_X_ORIGIN` host.
- **Widths** (CSS px):
  - `base = columnWidth` if set;
  - otherwise `(stripWidth − 68)` when there's 1 column, or `(stripWidth − 68) / n`;
  - the **leftmost X column** (the first column whose `isXColumn` is true) gets `base + 68`; every other column gets `base`;
  - when `columnWidth` is unset, `stripWidth` is the window content width, so the columns fill it exactly.
- **Hide/Expand dev controls:** keep the dev-only controls, but address columns by **index** from config (e.g. "Hide #2", "Expand #1") so the `columns` spec keeps working against a fixture config. They stay dev-only.

## Security: custom non-X columns
Swift allowed any custom URL. Keep that, safely:
- the guest allow-list (`will-attach-webview`, `will-navigate`) = X hosts + **the origins of `custom` columns in the loaded config** (http/https only; other schemes → placeholder with an error message);
- non-X custom columns use partition **`persist:custom`**, not `persist:x`, so X cookies are never exposed to them;
- the main process derives the allow-list from the config it loaded itself. The renderer can't add origins.

## Fractional widths (carried over from TASK-002c)
When `columnWidth` is unset, `(W − 68) / n` is usually fractional. Add a pixel check for that case (left **and** right edges of every visible column within ±2 device px, with no clipped right edge). If it fails, apply the same `round(down, …, 1px)` approach to widths, keeping the leftover sliver at the end of the strip.

## E2E
- **Fake X:** add `/home` and `/notifications` pages (red frame, like `explore.html`).
- **Migrate `columns.e2e.ts` to a fixture config** (`e2e/configs/layout-*.json`), using `XDECK_CONFIG_DIR` with `forYou` + custom fixture columns. Every existing assertion stays: edges, hide/expand, chaining, reachability. Nothing gets weakened.
- **New `e2e/specs/layout.e2e.ts`:** measure each column container's width, which must be **exact**:
  - (a) `columnWidth: 380` with `forYou, following, notifications, custom(fixture)` → `[448, 380, 380, 380]`;
  - (b) no `columnWidth`, 4 X-type columns, window content width W → `(W−68)/4 + 68` for the first column and `(W−68)/4` for the others (rounded the same way the app rounds), with the total equal to the strip width;
  - (c) 1 column, no `columnWidth` → `W`;
  - (d) a non-X `custom` column first, then X columns → the **first X column** (index 1) gets +68 and index 0 doesn't;
  - (e) a `profile` column → placeholder rendered, no webview;
  - (f) the fractional-width pixel check above;
  - (g) a non-X custom column's guest is in `persist:custom` and an X column's is in `persist:x`, and a config with an `ftp://` custom URL shows the placeholder error.
- `webview-security.e2e.ts` keeps passing; adjust it only where column setup moved to config, and explain each change.

## Acceptance criteria
- **AC1:** lint, typecheck, build pass.
- **AC2:** full `pnpm test:e2e` green 3 runs in a row (paste the summaries).
- **AC3 (the test can fail):** temporarily give the +68 to *every* X column. Show that layout (a) fails, then revert.
- **AC4:** the spike's hard-coded `COLUMNS` and `col-0..3` URLs are gone from `src/` (`grep` proof).
- **AC5:** a screenshot from `pnpm dev` with the **bundled default config** (forYou, following, notifications, profile) against real x.com, path in the report. Logged-out x.com pages are fine.
