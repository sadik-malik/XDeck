---
title: Defer to the Configured Formatter
impact: CRITICAL
impactDescription: the formatter is the source of truth
tags: context, formatter, editorconfig
---

## Defer to the Configured Formatter

**Impact: CRITICAL (the formatter is the source of truth)**

If a formatter (Prettier, Black, gofmt, rustfmt, clang-format) or `.editorconfig` exists, defer to it.
