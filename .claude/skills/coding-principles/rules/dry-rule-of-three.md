---
title: Rule of Three
impact: MEDIUM
impactDescription: extract only once the pattern is stable
tags: dry, abstraction, refactoring
---

## Rule of Three

**Impact: MEDIUM (extract only once the pattern is stable)**

- **Rule of three:** tolerate 1–2 duplications; extract on the 3rd when the pattern is stable.
- Extracting too early creates a leaky abstraction harder to change than the duplication.
