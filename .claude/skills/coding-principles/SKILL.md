---
name: coding-principles
description: Guides code structure with DRY, SOLID, YAGNI, KISS and related heuristics. Use when writing, reviewing, refactoring, or designing code, or when the user says "clean code", "best practices", "tech debt", "over-engineering", "refactor", or mentions DRY, SOLID, YAGNI, KISS.
when_to_use: |
  - Writing, reviewing, refactoring, or designing code in any language
  - User mentions DRY, SOLID, YAGNI, KISS, "clean code", "best practices", "tech debt", or "over-engineering"
  - User asks to refactor, review architecture, improve structure, or handle duplication/abstraction tradeoffs
  - User says code feels "messy", "coupled", "hard to extend", or asks "is this the right abstraction?"
  - Do NOT use for: trivial one-off scripts where current simplicity is sufficient, or purely behavioral questions with no structural concern
license: MIT
metadata:
  author: piplupjs
  version: "1.1.0"
---

# Coding Principles

Simple, well-factored, and no more complex than the problem requires.

Principles conflict — DRY/SOLID push toward abstraction, YAGNI/KISS push back. Good engineering picks the right amount of structure for the actual problem. Treat each as a heuristic, not a rule. When two conflict, name the tradeoff.

**Priority:** correctness > clarity/simplicity (KISS, YAGNI) > non-repetition (DRY) > extensibility (SOLID). A working, readable, slightly repetitive solution beats broken or unreadable "elegance."

## Workflow

**Writing new code:**
1. Solve the current requirement first (YAGNI).
2. Small units, one job, clear names, minimal nesting (KISS, SRP).
3. Don't extract shared abstractions preemptively — wait for real *knowledge* duplication (rule of three).
4. Depend on abstractions only with a reason (multiple impls, need to mock) — not by default (DIP).

**Reviewing / refactoring** — name the principle, show the smell, propose a fix (see review checklist below).

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Simplicity | HIGH | `simplicity-` |
| 2 | Duplication | MEDIUM | `dry-` |
| 3 | SOLID | LOW-MEDIUM | `solid-` |
| 4 | Design Heuristics | LOW-MEDIUM | `design-` |

## Quick Reference

### 1. Simplicity (HIGH)

- `simplicity-yagni`: Don't build for hypothetical requirements
- `simplicity-kiss`: Straightforward > clever; optimize for the next reader

### 2. Duplication (MEDIUM)

- `dry-knowledge-not-text`: One authoritative representation per piece of knowledge, not per text match
- `dry-rule-of-three`: Tolerate 1–2 duplications; extract on the 3rd when the pattern is stable

### 3. SOLID (LOW-MEDIUM)

- `solid-single-responsibility`: One reason to change
- `solid-open-closed`: Extend without editing tested code
- `solid-liskov`: Subtype usable anywhere its base is expected
- `solid-interface-segregation`: Small, focused interfaces over one fat one
- `solid-dependency-inversion`: Depend on abstractions for slow, external, or swappable things

### 4. Design Heuristics (LOW-MEDIUM)

- `design-separation-of-concerns`: Business logic, data access, presentation, I/O in distinct layers
- `design-composition-over-inheritance`: Combine small pieces; inherit only for stable "is-a"
- `design-law-of-demeter`: Talk to immediate collaborators only
- `design-fail-fast`: Validate early, raise clearly
- `design-command-query-separation`: An action *or* a question, not both
- `design-explicit-over-implicit`: Explicit params/types/errors over hidden globals and silent fallbacks

## Review checklist

| Smell | Fix | Rule |
|---|---|---|
| Same business rule copy-pasted 3+ places | DRY → extract shared function | `dry-rule-of-three` |
| Class/function doing unrelated things | SRP → split along seams | `solid-single-responsibility` |
| Growing `switch`/`if-elif` per new type | OCP → polymorphism or lookup table | `solid-open-closed` |
| `a.getB().getC().doThing()` chains | Demeter → expose behavior, not internals | `design-law-of-demeter` |
| Unused flags, generic params with one caller, abstract class with one subclass | YAGNI → simplify/inline | `simplicity-yagni` |
| Clever one-liner slower to parse than a loop | KISS → plain loop | `simplicity-kiss` |

**When principles conflict**, state it: *"This adds an interface for DIP, but there's one impl and no test mocking it — lean YAGNI, keep concrete until a second use appears."*

Don't be dogmatic — a junior over-applies SOLID/DRY into indirection; a senior knows when three duplicated lines is the right call.

## How to Use

Read individual rule files for the full rule and examples:

```
rules/simplicity-yagni.md
rules/solid-open-closed.md
```

Section metadata lives in `rules/_sections.md`; new rules start from `rules/_template.md`.
