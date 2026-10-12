# TASK-002 review, round 2 (on `9af717a`, branch `task/002-webview-strip-r1`)

**Verdict: APPROVED, pending (1) the user's 7-item human checklist and (2) a PM rerun of `pnpm test:e2e` after the user finishes.** That rerun is deferred so test windows don't steal focus during the manual check.

## Verified
- Diff read: `webview.ts` (exact host list, `devOrigin()` shared validation, `xOriginOverride()`), `security.ts`, both preloads, `XColumn.tsx`. lint ✅, typecheck ✅.
- R1: E2E is hermetic. Col-0 → fake-X `/explore` through `XDECK_X_ORIGIN` (unpackaged + loopback only). The implementer reports 3 consecutive green full runs.
- R2: an exact six-origin list with no wildcards; spec (g) covers lookalikes.
- R3: per-column proof via `session === fromPartition('persist:x')` and the preload's single `sendToHost('xdeck:preload-ready')`. The preload still exposes nothing to the page.
- R4: root cause is Electron's internal `<webview>` shadow DOM `<style>`, blocked by our strict CSP. It has no visible effect (the iframe rect equals the webview rect in all 4 columns). The CSP is unchanged. **Accepted.**

## Deviations accepted
- **Additive allow-list in test builds:** the override origin is added beside the real X hosts. That's harmless because both hooks are ignored in packaged builds.
- **Spec (g) makes one network attempt to `www.x.com`:** it asserts the attach decision only, not load success, so offline runs still pass.

## Final (2026-10-10)
- **Human checklist, Windows 11 at 150%: all 7 items pass.** (The first attempt had the fake-X server not running, so only col-0 was visible; it was redone with all four columns.) **The native two-finger horizontal swipe chains from the column to the strip, so no wheel forwarder is needed.**
- PM rerun on `9af717a`: `pnpm test:e2e` → smoke 6/6, webview-security 7/7.
- **Merged** as `a5d09c2`. The macOS and Linux human checks are still outstanding.
