---
title: Keep Callback Refs Stable
impact: HIGH
impactDescription: prevents effects from reading a detached (null) ref
tags: refs, useCallback, effects
---

## Keep Callback Refs Stable

**Impact: HIGH (prevents effects from reading a detached ref)**

When anything reads a ref in an effect, the callback ref must be stable (`useCallback`), never an inline arrow function. React detaches an inline callback ref (calls it with `null`) and re-attaches it on every commit, and a child's layout effect runs in between.

**Incorrect (new function every render: ref goes null → node each commit):**

```tsx
<div ref={(node) => setContainer(node)} />
```

**Correct (stable callback, attached once):**

```tsx
const containerRef = useCallback((node: HTMLDivElement | null) => {
  setContainer(node);
}, []);

<div ref={containerRef} />
```

Reference: [Ref callback function](https://react.dev/reference/react-dom/components/common#ref-callback)
