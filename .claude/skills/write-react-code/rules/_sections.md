# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Refs (refs)

**Impact:** HIGH  
**Description:** Unstable refs cause real bugs: effects see `null` for nodes that are on screen.

## 2. Component Structure (structure)

**Impact:** MEDIUM  
**Description:** A fixed body order means every hook, handler, and effect is found in the same place in every file.

## 3. Rendering (rendering)

**Impact:** MEDIUM  
**Description:** Repeated markup expressed once keeps UI changes to a single edit point.
