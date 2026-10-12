# TASK-002c review, round 1

**Verdict: APPROVED** ✅ (merged)

- Fix: `height: round(down, 100%, 1px)` on the `<webview>` (Chromium 152 supports CSS `round()`). It's one line, with no measuring or re-render, and the leftover sub-pixel gap sits below the guest. **Accepted.**
- AC3 sabotage: reverting the fix makes fractional (e) fail on col-1's bottom edge, and the fix is restored afterwards (diff empty).
- PM rerun on `f17df4e`: lint ✅, typecheck ✅, E2E columns 10/10, smoke 6/6, security 7/7; `setContentSize` is gone from `e2e/`.
- Accepted findings: `setContentSize` snaps to an even DIP at 150% (so the fraction is set via `setBounds`); the fractional (a) state is masked by the strip scrollbar, so (e) is the real regression check.
- **Width rounding:** deferred to TASK-005, the column layout task, where fractional widths first appear (`(W − 68) / n` and zoom). TASK-005 must include a fractional-width pixel check (left and right edges) and apply the same rounding if it fails.
