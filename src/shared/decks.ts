import type { AppConfig, ColumnConfig } from './app-config'
import { type ColumnLayout, EMPTY_LAYOUT, parseColumnLayout } from './column-layout'

/**
 * Decks (TASK-022), like TweetDeck's: named sets of columns, one shown at a time. settings.json has
 * either `columns` (one deck, the format before decks) or `decks`. The app writes `decks` once there
 * is more than one.
 */
export type DeckConfig = { name: string; columns: ColumnConfig[] }

/** The name of the one deck a `columns` settings.json has. */
export const DEFAULT_DECK_NAME = 'Main'
export const MAX_DECKS = 20
export const MAX_DECK_NAME_LENGTH = 40

/** Every deck of a config: its `decks`, or its `columns` as one deck. */
export function configDecks(config: AppConfig): DeckConfig[] {
  return config.decks ?? [{ name: DEFAULT_DECK_NAME, columns: config.columns ?? [] }]
}

/** Every column of every deck (for the guest allow-list). */
export function allColumns(config: AppConfig): ColumnConfig[] {
  return configDecks(config).flatMap((deck) => deck.columns)
}

/**
 * A stable key per deck: its name, plus #n for repeats (a hand-written settings.json may repeat a
 * name). Saved layouts and the open deck are stored by key.
 */
export function deckKeys(decks: { name: string }[]): string[] {
  const seen = new Map<string, number>()

  return decks.map((deck) => {
    const count = seen.get(deck.name) ?? 0
    seen.set(deck.name, count + 1)

    return `${deck.name}#${count}`
  })
}

/** A deck name the user typed, checked against the other decks' names. Null when it is fine. */
export function deckNameProblem(name: string, otherNames: string[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) {
    return 'Enter a name.'
  }

  if (trimmed.length > MAX_DECK_NAME_LENGTH) {
    return `Use at most ${MAX_DECK_NAME_LENGTH} characters.`
  }

  if (otherNames.some((other) => other.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
    return 'Another deck has this name.'
  }

  return null
}

/**
 * The saved layouts: one per deck key. `legacy` is the layout saved before decks existed; it
 * belongs to the first deck until that deck has a layout of its own.
 */
export type DeckLayouts = { decks: Record<string, ColumnLayout>; legacy: ColumnLayout }

export const EMPTY_DECK_LAYOUTS: DeckLayouts = { decks: {}, legacy: EMPTY_LAYOUT }

const MAX_DECK_KEY_LENGTH = 200

/** A deck key that arrived over IPC, checked. */
export function isDeckKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_DECK_KEY_LENGTH
}

/** Saved layouts from IPC or disk, checked. Malformed entries are dropped. */
export function parseDeckLayouts(value: unknown): DeckLayouts {
  if (typeof value !== 'object' || value === null) {
    return EMPTY_DECK_LAYOUTS
  }

  const { decks, legacy } = value as { decks?: unknown; legacy?: unknown }
  const parsed: Record<string, ColumnLayout> = {}
  if (typeof decks === 'object' && decks !== null && !Array.isArray(decks)) {
    for (const [key, layout] of Object.entries(decks).slice(0, MAX_DECKS * 2)) {
      const checked = parseColumnLayout(layout)
      if (isDeckKey(key) && checked) {
        parsed[key] = checked
      }
    }
  }

  return { decks: parsed, legacy: parseColumnLayout(legacy) ?? EMPTY_LAYOUT }
}

/** The layout of the deck at `index`, whose key is `key`. */
export function deckLayout(layouts: DeckLayouts, key: string, index: number): ColumnLayout {
  return layouts.decks[key] ?? (index === 0 ? layouts.legacy : EMPTY_LAYOUT)
}
