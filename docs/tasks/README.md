# Task Workflow (PM ↔ implementer)

Claude (main session) is the **project manager**: it writes specs, reviews and verifies, and writes **no product code**. Each task is implemented by a **Haiku 5.5 subagent**.

Source of truth for scope and architecture: [`../electron-migration-roadmap.md`](../electron-migration-roadmap.md).

## Files per task

| File | Written by | Purpose |
|---|---|---|
| `TASK-NNN-<slug>.md` | PM | Spec: goal, scope, out-of-scope, acceptance criteria |
| `TASK-NNN-<slug>.report.md` | Implementer | What was done, real command output per AC, deviations, open questions |
| `TASK-NNN-<slug>.review-K.md` | PM | Review round K: verdict + required changes |

## Loop

1. PM writes the spec and marks it `IN_PROGRESS` in [`BACKLOG.md`](BACKLOG.md).
2. The implementer:
   - branches from `main` as `task/NNN-<slug>`;
   - implements **only** the spec;
   - runs every acceptance command and pastes the real (trimmed) output into the report;
   - commits on the branch after each logical step (no push, no merge).
3. PM reviews the diff, **reruns the checks itself**, and writes `review-K.md`:
   - `APPROVED`: merged into `main` (after the user's sign-off where a human check is required);
   - `CHANGES_REQUESTED`: the implementer fixes the issues on the same branch and appends `## Round K response` to the report.
4. Human checks (touchpad, perceived smoothness, real X login) are always done by the user. No task that needs one is approved without it.

## Rules for the implementer

- Don't touch `XDeck/`, `XDeck.xcodeproj/`, `public/` (the landing page), or `.github/workflows/release.yml` unless a spec says to.
- Don't expand scope. Put anything extra under *Open questions*.
- Never weaken a test, threshold, lint rule or security setting to make something pass. Report the failure instead.
- Never claim a visual result you didn't actually capture. UI claims need **real window pixels**, not element-rect readback (lesson from the abandoned Tauri attempt).
- Stop every dev/test process tree you start, and only those (other projects run on this machine).
- Stage files explicitly (never `git add -A` / `git add .` at the root). Don't edit PM files in `docs/` except your own report.
- Commit messages end with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- Use latest stable versions and record the exact resolved versions in the report.

## Report template

```markdown
# TASK-NNN report

**Branch:** task/NNN-slug   **Commits:** <short shas>

## Summary
<3–8 bullets>

## Acceptance criteria
- [x] AC1 — <evidence: command + trimmed output, or file:line>
- [ ] AC2 — <why not met>

## Resolved versions
## Deviations from spec
## Open questions
## Needs human verification
```
