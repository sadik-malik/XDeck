---
title: Group by Logical Step
impact: HIGH
impactDescription: stages of a function read as stages
tags: blank-lines, grouping
---

## Group by Logical Step

**Impact: HIGH (stages of a function read as stages)**

Blank lines separate stages (validate → transform → write). Related setup feeding one call stays tight.

**Incorrect (unrelated stages crammed together):**

```js
function createUser(raw) {
  if (!raw.email) throw new Error("email required");
  const email = raw.email.trim().toLowerCase();
  const hash = await hashPassword(raw.password);
  const user = await db.users.insert({ email, hash });
  return user;
}
```

**Correct (stages separated):**

```js
function createUser(raw) {
  if (!raw.email) throw new Error("email required");

  const email = raw.email.trim().toLowerCase();
  const hash = await hashPassword(raw.password);

  const user = await db.users.insert({ email, hash });
  return user;
}
```
