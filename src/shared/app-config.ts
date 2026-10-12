import type { ColumnFilters } from './column-filters'

/** One column of settings.json. Mirrors resources/config/schema.json. */
export type ColumnConfig = (
  | { type: 'forYou' | 'following' | 'notifications' | 'profile' }
  | { type: 'custom'; url: string }
) & {
  /** Column filters (TASK-021). Left out when none is on. */
  filters?: ColumnFilters
  /** The X or Instagram account the column shows, by user name (TASK-023, TASK-049). Left out: the first. */
  account?: string
}

/**
 * settings.json after validation. Only plain data, so it crosses IPC as is. It has `columns` (one
 * deck) or `decks` (TASK-022), never both: read it through configDecks (shared/decks.ts).
 */
export type AppConfig = {
  $schema?: string
  columnWidth?: number
  columns?: ColumnConfig[]
  decks?: { name: string; columns: ColumnConfig[] }[]
}
