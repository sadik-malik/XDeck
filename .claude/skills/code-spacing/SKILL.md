---
name: code-spacing
description: Enforces vertical whitespace (blank lines) for readable code — grouping, block padding, and declaration spacing. Use when writing, refactoring, reviewing, or formatting code, or when the user says "cramped", "messy", "readability", "blank lines", "spacing rules", or asks for Prettier, ESLint, Black, PEP 8, or .editorconfig.
when_to_use: |
  - Writing, generating, refactoring, or reviewing code in any language
  - User asks about blank lines, spacing, "cramped" or "messy" code, or readability
  - User requests linter/formatter config (Prettier, ESLint padding-line-between-statements, Black, PEP 8, .editorconfig)
  - Do NOT use for: non-code prose formatting, or when a project formatter already governs spacing and the user hasn't asked to override it
license: MIT
metadata:
  author: piplupjs
  version: "1.1.0"
---

# Code Spacing

**One blank line = one conceptual boundary.** Ask: "does the code above finish a thought different from what follows?" If yes, blank line. If steps in the same thought, keep tight. Every rule below is this principle applied.

## Workflow

1. **Generate code** — apply automatically; don't wait to be asked. Cramped/over-padded code is a readability defect.
2. **After drafting** — one blank-line pass: every blank is a real boundary? No runs of 2+? No block-edge padding?
3. **When reviewing** — explain with reasoning ("these three lines are one setup step — the blank implies a break that isn't there"), not just rule numbers.

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Context | CRITICAL | `context-` |
| 2 | Blank Lines | HIGH | `blank-` |
| 3 | Declarations | MEDIUM | `decl-` |
| 4 | Horizontal Spacing | LOW | `horizontal-` |

## Quick Reference

### 1. Context (CRITICAL)

- `context-match-file`: When editing, mirror existing conventions; impose defaults only for new files or explicit cleanup
- `context-defer-formatter`: If a formatter or `.editorconfig` exists, defer to it

### 2. Blank Lines (HIGH)

- `blank-group-by-step`: Blank lines separate stages; related setup feeding one call stays tight
- `blank-no-block-padding`: No blank after `{`/`(`/`[`/`:` or before `}`/`]`/dedent
- `blank-max-one`: Collapse consecutive blanks to one (Python top-level defs excepted)
- `blank-no-leading-trailing`: No blank as first/last line of a file or block; file ends with one newline
- `blank-imports`: One blank between imports and code; import groups tight
- `blank-comment-before`: Section comments get a blank before, not after
- `blank-before-return`: Blank before return/throw/break when not the only statement
- `blank-parallel-tight`: Runs of simple, repetitive lines get no blanks

### 3. Declarations (MEDIUM)

- `decl-between-declarations`: 1 blank between top-level defs and methods (2 in Python); per-language notes

### 4. Horizontal Spacing (LOW)

- `horizontal-spacing`: One space after commas and around operators; no trailing whitespace; never mix indents

## How to Use

Read individual rule files for the full rule and examples:

```
rules/blank-group-by-step.md
rules/decl-between-declarations.md
```

Section metadata lives in `rules/_sections.md`; new rules start from `rules/_template.md`.
