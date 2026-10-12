---
title: Spacing Between Declarations
impact: MEDIUM
impactDescription: declarations separate the same way in every file
tags: declarations, functions, classes, languages
---

## Spacing Between Declarations

**Impact: MEDIUM (declarations separate the same way in every file)**

| Context | Spacing |
|---|---|
| Top-level functions/classes | 1 blank line (C-family, JS/TS); **2** in Python (PEP 8) |
| Methods inside a class | 1 blank line (all languages) |
| Fields → first method | 1 blank line |
| Logical groups of functions | Extra blank line for rare, real section breaks |

### Language notes

| Language | Between top-level defs | Notes |
|---|---|---|
| Python | 2 blank lines (PEP 8) | 1 between methods; sparse blanks inside functions |
| JavaScript/TypeScript | 1 | ESLint `padded-blocks: off`, max 1 empty line |
| Java | 1 | Google Style: 1 between members; grouping inside methods OK |
| Go | 1 | Defer to `gofmt` |
| C / C++ | 1 | Blank line before/after function defs |
| Rust | 1 | Defer to `rustfmt` |
| SQL | 1 | Separate CTEs; major clauses (SELECT/FROM/WHERE) as blocks |
