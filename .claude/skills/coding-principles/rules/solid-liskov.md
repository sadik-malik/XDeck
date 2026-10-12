---
title: L — Liskov Substitution
impact: LOW-MEDIUM
impactDescription: responsibilities split along real seams
tags: solid, lsp, inheritance
---

## L — Liskov Substitution

**Impact: LOW-MEDIUM (responsibilities split along real seams)**

Subtype usable anywhere its base is expected; no narrowed inputs, widened exceptions, or broken invariants.

**Don't over-apply:** `NotImplementedError` on inherited method → hierarchy is wrong.
