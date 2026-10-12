---
title: D — Dependency Inversion
impact: LOW-MEDIUM
impactDescription: responsibilities split along real seams
tags: solid, dip, dependency-injection
---

## D — Dependency Inversion

**Impact: LOW-MEDIUM (responsibilities split along real seams)**

High-level logic depends on abstractions (injected DB/HTTP/FS clients), not concretions — for things that are slow, external, or swappable.

**Don't over-apply:** One impl, not mocked in tests → interface is YAGNI.
