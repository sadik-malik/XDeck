---
title: YAGNI — You Aren't Gonna Need It
impact: HIGH
impactDescription: no code for requirements that do not exist
tags: yagni, abstraction, speculative-generality
---

## YAGNI — You Aren't Gonna Need It

**Impact: HIGH (no code for requirements that do not exist)**

Don't build for hypothetical requirements. Solve what's needed now in an extendable way — not the extension itself.

- No config options, plugin systems, abstract bases, or generic params for one use case.
- No DB/cache/queue "in case we scale" without concrete need.
- "We'll probably add X later" → note the assumption, don't pre-build X.
- Smell: `strategy`/`mode` param with one caller and one value.

**Incorrect (speculative abstraction for one case):**

```ts
class Notifier { send(msg: string, strategy: "email" | "sms" = "email") { ... } }
```

**Correct (concrete until a second strategy appears):**

```ts
class EmailNotifier { send(msg: string) { ... } }
```
