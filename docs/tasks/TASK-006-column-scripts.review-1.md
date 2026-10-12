# TASK-006 review, round 1

**Verdict: APPROVED** ✅ (merged)

- PM rerun: lint ✅, typecheck ✅, `pnpm test:e2e` → 11 spec files, 51 tests, green (4 min 41 s).
- Code read: `src/column-preload/index.ts` (name → fixed-function map, setup validated by `parseColumnSetup`, nothing exposed to the main world), `hide-ads.ts` (the `-impression-pixel` rule, so the #46 fix is preserved).
- AC3: the pre-#46 `placementTracking` rule makes hide-ads (b) fail with the video cells hidden; reverted, diff empty.
- Deviations 1–12 accepted. #4 (`showAds` cancels the pending debounce) is an intentional bug fix over Swift. #8 (non-X fixture on `localhost`) is a test-environment consequence of the `XDECK_X_ORIGIN` host counting as X.
- **Decision on the open question:** `waitForElement` must also check **immediately** before observing. Our setup arrives after a preload-ready round trip, later than Swift's document-start injection, so an already-rendered, static tab would never be clicked. Assigned to **TASK-007** (which adds `findUserName` on the same helper), with a test where the target exists before setup arrives and the DOM never mutates afterwards.
- Real-x.com verification of the scripts and ad rule needs a logged-in session. It goes into the human check after TASK-007.
