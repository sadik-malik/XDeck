---
title: Render Repeated Markup from Data
impact: MEDIUM
impactDescription: one edit point for repeated UI
tags: rendering, map, duplication
---

## Render Repeated Markup from Data

**Impact: MEDIUM (one edit point for repeated UI)**

When repeated UI markup shares the same structure, represent the items as data and render them with `map`.

**Incorrect (same structure copy-pasted):**

```tsx
<nav>
  <a href="/profile"><UserIcon /> Profile</a>
  <a href="/security"><LockIcon /> Security</a>
  <a href="/sessions"><MonitorIcon /> Sessions</a>
</nav>
```

**Correct (items as data, rendered once):**

```tsx
const links = [
  { href: '/profile', icon: UserIcon, label: 'Profile' },
  { href: '/security', icon: LockIcon, label: 'Security' },
  { href: '/sessions', icon: MonitorIcon, label: 'Sessions' },
];

<nav>
  {links.map(({ href, icon: Icon, label }) => (
    <a key={href} href={href}><Icon /> {label}</a>
  ))}
</nav>
```
