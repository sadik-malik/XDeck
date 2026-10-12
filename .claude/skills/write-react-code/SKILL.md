---
name: write-react-code
description: Writes React components and hooks with a fixed body order under padded section headers, stable callback refs, and repeated markup rendered from data with map. Use when writing, refactoring, or reviewing React components or hooks, or when the user says "clean up this component", "this hook is messy", "copy-pasted JSX", "duplicated markup", or "ref is null in my effect".
when_to_use: |
  - Writing or editing any React component or hook (.tsx/.jsx), even if the user never mentions structure
  - User asks to review or refactor React code: "clean up this component", "this hook is messy", "hard to find things in this file"
  - JSX repeats the same structure several times with only text, icons, or links changing
  - A callback ref flickers to null, or an effect that reads a ref sees it detached
  - Do NOT use for: Vue/Svelte/Angular, React Native, plain .ts utilities with no components or hooks, test specs, or generated code
license: MIT
metadata:
  author: piplupjs
  version: "1.1.0"
---

# Write React Code

Structure rules for React components and hooks, prioritized by impact. Not for Vue/Svelte/Angular, React Native, component-free `.ts` utilities, test specs, or generated code.

## Workflow

1. **Write**: order the body by `structure-body-order`; apply the other rules as you go.
2. **Review**: one pass over the quick reference below; open a rule file when a check fails.

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Refs | HIGH | `refs-` |
| 2 | Component Structure | MEDIUM | `structure-` |
| 3 | Rendering | MEDIUM | `rendering-` |

## Quick Reference

### 1. Refs (HIGH)

- `refs-stable-callback`: Use `useCallback` for a callback ref whenever an effect reads the ref; never an inline arrow

### 2. Component Structure (MEDIUM)

- `structure-body-order`: Order the body as hooks → State → Compute → Services → Compute → Form → Callbacks → Table → Effects, under `// ─── Name ───` headers padded to 74 characters

### 3. Rendering (MEDIUM)

- `rendering-markup-as-data`: Represent repeated same-shape markup as data and render it with `map`

## How to Use

Read individual rule files for the full rule and incorrect/correct examples:

```
rules/refs-stable-callback.md
rules/structure-body-order.md
rules/rendering-markup-as-data.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example
- Correct code example

Section metadata lives in `rules/_sections.md`; new rules start from `rules/_template.md`.
