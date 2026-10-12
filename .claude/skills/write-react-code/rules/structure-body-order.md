---
title: Order Component and Hook Bodies by Section
impact: MEDIUM
impactDescription: every hook, handler, and effect is found in the same place
tags: structure, hooks, readability
---

## Order Component and Hook Bodies by Section

**Impact: MEDIUM (every hook, handler, and effect is found in the same place)**

Order every component/hook body as below. Each section except the first starts with `// ─── Name ───` padded with `─` to 74 characters (indent included). Omit empty sections.

| # | Section | Holds |
|---|---|---|
| 1 | *(no header)* | Unclassified hooks: `useCurrentUser()`, `useSidebar()` |
| 2 | State | `useState`, `useReducer`, `useParams`, search params, other state hooks |
| 3 | Compute | Optional: values derived from the state |
| 4 | Services | API calls: `useQuery`, `useMutation` |
| 5 | Compute | Optional: values derived from the services |
| 6 | Form | `useForm` and its options |
| 7 | Callbacks | Event handlers and other functions |
| 8 | Table | Table hook and column hooks, when the component renders a data table |
| 9 | Effects | `useEffect` and friends |

Form comes after Compute and before Callbacks because callbacks (such as a cancel handler) use the form.

**Incorrect (state, queries, handlers and effects interleaved):**

```tsx
export function InvoiceView({ id }: { id: string }) {
  const { data } = useQuery(invoiceQueryOptions(id));
  const handlePay = () => pay(id);
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => track('invoice'), []);
  const user = useCurrentUser();
  // ...
}
```

**Correct (sections in order under padded headers):**

```tsx
export function InvoiceView({ id }: { id: string }) {
  const user = useCurrentUser();

  // ─── State ───────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);

  // ─── Services ────────────────────────────────────────────────────────
  const { data } = useQuery(invoiceQueryOptions(id));

  // ─── Compute ─────────────────────────────────────────────────────────
  const isPaid = data?.status === 'PAID';

  // ─── Callbacks ───────────────────────────────────────────────────────
  const handlePay = useCallback(() => pay(id), [id]);

  // ─── Effects ─────────────────────────────────────────────────────────
  useEffect(() => track('invoice'), []);

  // ...
}
```
