---
title: Law of Demeter
impact: LOW-MEDIUM
impactDescription: clearer boundaries and failure modes
tags: design, coupling
---

## Law of Demeter

**Impact: LOW-MEDIUM (clearer boundaries and failure modes)**

Talk to immediate collaborators only — avoid `a.getB().getC().doThing()` chains.
