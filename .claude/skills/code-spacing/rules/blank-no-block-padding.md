---
title: Never Pad Inside a Block
impact: HIGH
impactDescription: block edges carry no fake boundaries
tags: blank-lines, blocks, padded-blocks
---

## Never Pad Inside a Block

**Impact: HIGH (block edges carry no fake boundaries)**

No blank line after `{`/`(`/`[`/`:` or before `}`/`]`/dedent.

**Incorrect (padded block):**

```js
function bar() {

  console.log(foo);

}
```

**Correct:**

```js
function bar() {
  console.log(foo);
}
```
