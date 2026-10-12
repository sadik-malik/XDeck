/**
 * Per-column filters (TASK-021), like TweetDeck's column filters. Stored on the column in
 * settings.json (`"filters": {...}`) and applied by the column preload to X's timeline.
 */
export type ColumnFilters = {
  /** Hide posts someone else reposted into the timeline. */
  hideReposts?: boolean
  /** Show only posts with a photo, video or media card. */
  mediaOnly?: boolean
  /** Instagram columns (TASK-046): hide Reels. */
  hideReels?: boolean
  /** Hide posts whose text contains any of these words (not case sensitive). */
  mutedWords?: string[]
}

export const MAX_MUTED_WORDS = 50
export const MAX_MUTED_WORD_LENGTH = 100

/** Whether a column has any filter turned on. */
export function hasFilters(filters: ColumnFilters | undefined): boolean {
  return (
    filters !== undefined &&
    (filters.hideReposts === true ||
      filters.mediaOnly === true ||
      filters.hideReels === true ||
      (filters.mutedWords?.length ?? 0) > 0)
  )
}

/** Muted words from what the user typed: split on commas and new lines, trimmed, no repeats. */
export function parseMutedWords(text: string): string[] {
  const words = text
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .map((word) => word.slice(0, MAX_MUTED_WORD_LENGTH))
  return [...new Set(words)].slice(0, MAX_MUTED_WORDS)
}

/**
 * The filters to store: only the ones turned on, or undefined when none is, so a column without
 * filters stays `{ "type": ... }` in settings.json.
 */
export function compactFilters(filters: ColumnFilters): ColumnFilters | undefined {
  const result: ColumnFilters = {}
  if (filters.hideReposts) {
    result.hideReposts = true
  }

  if (filters.mediaOnly) {
    result.mediaOnly = true
  }

  if (filters.hideReels) {
    result.hideReels = true
  }

  if (filters.mutedWords && filters.mutedWords.length > 0) {
    result.mutedWords = filters.mutedWords
  }

  return hasFilters(result) ? result : undefined
}

/** Filters that arrived over IPC, checked. Anything malformed is null. */
export function parseColumnFilters(value: unknown): ColumnFilters | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const { hideReposts, mediaOnly, hideReels, mutedWords } = value as Record<string, unknown>
  if (hideReposts !== undefined && typeof hideReposts !== 'boolean') {
    return null
  }

  if (mediaOnly !== undefined && typeof mediaOnly !== 'boolean') {
    return null
  }

  if (hideReels !== undefined && typeof hideReels !== 'boolean') {
    return null
  }

  if (
    mutedWords !== undefined &&
    !(
      Array.isArray(mutedWords) &&
      mutedWords.length <= MAX_MUTED_WORDS &&
      mutedWords.every((word) => typeof word === 'string' && word.length <= MAX_MUTED_WORD_LENGTH)
    )
  ) {
    return null
  }

  return {
    hideReposts: hideReposts === true,
    mediaOnly: mediaOnly === true,
    hideReels: hideReels === true,
    mutedWords: (mutedWords as string[] | undefined) ?? [],
  }
}
