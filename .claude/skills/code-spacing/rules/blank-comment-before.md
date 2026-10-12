---
title: Blank Before Section Comments, Not After
impact: HIGH
impactDescription: comments stay attached to the code they explain
tags: blank-lines, comments
---

## Blank Before Section Comments, Not After

**Impact: HIGH (comments stay attached to the code they explain)**

Section comments get a blank before, not after. Attach to the code they explain.

**Correct:**

```js
doStuffA();
doStuffB();

// Handle empty queue.
if (queue.isEmpty()) { ... }
```
