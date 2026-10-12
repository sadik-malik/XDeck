import { createStore } from '@tanstack/store'

/** The key of the account XDeck logged in with first, which has no account id. */
const FIRST_ACCOUNT = 'main'

/**
 * The unread count per account (TASK-019, TASK-040): X's by account id, Instagram's under
 * INSTAGRAM_UNREAD (TASK-045). The columns report it from the page titles; the main process gets it
 * too, for desktop notifications.
 */
const NONE: Record<string, number> = {}

export const unreadStore = createStore(NONE, ({ setState }) => ({
  /** An account's count; null is the account XDeck logged in with first. Unchanged counts are ignored. */
  report: (count: number, accountId: string | null) => {
    const key = accountId ?? FIRST_ACCOUNT
    setState((counts) => (counts[key] === count ? counts : { ...counts, [key]: count }))
  },
}))

/** An account's count from the store's value; null is the account XDeck logged in with first. */
export function unreadOf(counts: Record<string, number>, accountId: string | null): number {
  return counts[accountId ?? FIRST_ACCOUNT] ?? 0
}
