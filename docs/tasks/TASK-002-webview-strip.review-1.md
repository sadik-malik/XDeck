# TASK-002 review, round 1

**Verdict: CHANGES_REQUESTED** (small). The architecture and hardening look right. The user's human checklist runs in parallel on the current branch.

## PM verification on `8e1853f`
- lint ✅, typecheck ✅, smoke 6/6 ✅.
- `webview-security`: **5/6. (a) failed twice in a row on the PM's runs:** `Expected: 1, Received: 0` x.com guests. The failure capture shows col-0 **blank**; x.com hadn't loaded at assertion time. The test depends on the live network, which roadmap §5.1 forbids ("CI never needs real X credentials" / fake X).
- AC5 screenshot reviewed: col-1 has the red border on all 4 edges, the carousel renders, the toolbar is visible.
- Code read in full: `src/main/webview.ts`, `index.ts`, `security.ts`, `XColumn.tsx`, `ColumnStrip.tsx`. The hardening matches §2. `disablePopups: false` + a deny-all `setWindowOpenHandler` is **accepted**. The `will-redirect` guard is **accepted**. Width 0 for Hide is **accepted**.
- Synthetic horizontal wheel chains guest → strip, and the carousel consumes its own scroll first. That's promising; the human check decides.

## Required changes
### R1 — Hermetic E2E (fix (a))
Add the `XDECK_X_ORIGIN` test hook from roadmap §5.1:
- unpackaged builds only;
- loopback `http` only, validated like `fixtureOrigin()`;
- when set, it **replaces** the X origin for col-0 *and* in the guest allow-list.

The fake-X server serves an `/explore` page with the same red-border frame. In `wdio.conf.ts` `onPrepare`, set both `XDECK_FIXTURE_ORIGIN` and `XDECK_X_ORIGIN` to the fixture server, and (a) asserts col-0's URL is on that origin. **Run the full `pnpm test:e2e` 3 times in a row and paste all three summaries.** All must be green.

### R2 — X host list
The exact origins `x.com`/`twitter.com` are too narrow. X links and redirects use `www.` and `mobile.`. Allow exactly:
- `https://x.com`, `https://www.x.com`, `https://mobile.x.com`;
- `https://twitter.com`, `https://www.twitter.com`, `https://mobile.twitter.com`.

No wildcards. Add E2E checks that a `<webview>` with `src="https://www.x.com/home"` is **allowed to attach** (assert the attach decision; no need to wait for load) and that `https://x.com.evil.example/` and `https://evilx.com/` are **blocked**.

### R3 — Prove preload and partition on the 4 real columns
(b) currently checks a fifth probe guest. Instead, for **each of the 4 columns**:
- **partition:** assert `guest.session === session.fromPartition('persist:x')` (in `browser.electron.execute`);
- **preload:** the column preload sends `ipcRenderer.sendToHost('xdeck:preload-ready')` once; `<XColumn>` listens for `ipc-message` and sets `data-preload-ready="true"` on its container. Assert it's set on all 4. The preload must still expose nothing to the page.

### R4 — The inline-style CSP report
Find where the "Applying inline style violates … style-src 'self'" report comes from (stack/source in the console entry). If it's Electron's internal `<webview>` shadow DOM, document that, check that nothing visibly breaks (the columns fill their containers, as the screenshot shows), and **don't** loosen the CSP. If it's our code, fix it without `'unsafe-inline'`.

## Constraints for this round
- **The user may be running `pnpm fake-x` (port 4780) and `pnpm dev` for the human check at the same time.** Never stop a process you didn't start, and don't use port 4780 for tests (use a free port, as `onPrepare` already does).
- Commit after each R-item; append `## Round 1 response` to the report.
