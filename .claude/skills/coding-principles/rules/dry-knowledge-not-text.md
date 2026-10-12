---
title: DRY — Knowledge, Not Text
impact: MEDIUM
impactDescription: one source of truth per business rule
tags: dry, duplication, constants
---

## DRY — Knowledge, Not Text

**Impact: MEDIUM (one source of truth per business rule)**

One authoritative representation per piece of knowledge — not per text match.

- **Knowledge, not text.** Two validations with the same regex today but independent reasons ≠ DRY violation.
- Applies to logic *and* data (constants, schemas) — e.g. one validation rule, checked in client/API/DB.

**Incorrect (same business rule in three places):**

```ts
function validateEmail(a: string) { return /^[^\s@]+@[^\s@]+$/.test(a); }
function validateInvite(b: string) { return /^[^\s@]+@[^\s@]+$/.test(b); }
```

**Correct (single source of truth):**

```ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
function isEmail(v: string) { return EMAIL_RE.test(v); }
```
