---
title: Command-Query Separation
impact: LOW-MEDIUM
impactDescription: clearer boundaries and failure modes
tags: design, cqs, side-effects
---

## Command-Query Separation

**Impact: LOW-MEDIUM (clearer boundaries and failure modes)**

A function does an action *or* answers a question, not both (`getUser()` shouldn't mutate).
