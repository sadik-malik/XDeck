import type { ColumnConfig } from './app-config'

/**
 * The user's own column arrangement (TASK-013/014): order and widths changed by dragging. Kept in
 * the main process (electron-store), not in settings.json, which still says which columns exist.
 * Columns are identified by a key derived from settings.json, so the layout survives restarts and
 * adapts when columns are added or removed there.
 */
export type ColumnLayout = {
  /** Column keys, left to right. Keys no longer in settings.json are ignored. */
  order: string[]
  /** Width in CSS px per column key, for columns the user resized. */
  widths: Record<string, number>
}

export const EMPTY_LAYOUT: ColumnLayout = { order: [], widths: {} }

/** Narrowest and widest a column can be dragged to, CSS px. */
export const MIN_COLUMN_WIDTH = 240
export const MAX_COLUMN_WIDTH = 1600

const MAX_KEYS = 100
const MAX_KEY_LENGTH = 2100

/**
 * A stable key per column: its type (and URL for custom columns), plus #n for repeats, so two
 * identical columns stay distinct.
 */
export function columnKeys(columns: ColumnConfig[]): string[] {
  const seen = new Map<string, number>()

  return columns.map((column) => {
    const page = column.type === 'custom' ? `custom:${column.url}` : column.type
    // A column of another account is a different column (TASK-023); the main account adds nothing,
    // so keys saved before accounts existed still match.
    const base = column.account ? `${page}@${column.account.toLocaleLowerCase()}` : page
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)

    return `${base}#${count}`
  })
}

/**
 * Column indexes (settings.json order) in the order they are shown. The saved order comes first;
 * columns it doesn't mention keep their settings.json order at the end.
 */
export function visualOrder(keys: string[], layout: ColumnLayout): number[] {
  const placed = layout.order
    .map((key) => keys.indexOf(key))
    .filter((index, position, all) => index >= 0 && all.indexOf(index) === position)
  const rest = keys.map((_, index) => index).filter((index) => !placed.includes(index))

  return [...placed, ...rest]
}

/** A layout that arrived over IPC or from disk, checked. Anything malformed is null. */
export function parseColumnLayout(value: unknown): ColumnLayout | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const { order, widths } = value as Record<string, unknown>
  if (!Array.isArray(order) || order.length > MAX_KEYS) {
    return null
  }

  if (!order.every((key) => typeof key === 'string' && key.length <= MAX_KEY_LENGTH)) {
    return null
  }

  if (typeof widths !== 'object' || widths === null || Array.isArray(widths)) {
    return null
  }

  const entries = Object.entries(widths)
  if (entries.length > MAX_KEYS) {
    return null
  }

  const cleanWidths: Record<string, number> = {}
  for (const [key, width] of entries) {
    if (
      key.length > MAX_KEY_LENGTH ||
      typeof width !== 'number' ||
      !Number.isFinite(width) ||
      width < MIN_COLUMN_WIDTH ||
      width > MAX_COLUMN_WIDTH
    ) {
      return null
    }

    cleanWidths[key] = width
  }

  return { order: order as string[], widths: cleanWidths }
}

/**
 * The layout after the column at `index` (settings.json order) is removed. Keys count repeats
 * (#0, #1), so removing one of two identical columns renames the other one; its place and width move
 * with it.
 */
export function layoutAfterRemove(
  columns: ColumnConfig[],
  index: number,
  layout: ColumnLayout,
): ColumnLayout {
  const oldKeys = columnKeys(columns)
  const newKeys = columnKeys(columns.filter((_, i) => i !== index))
  const renamed = new Map<string, string>()
  oldKeys.forEach((key, i) => {
    if (i !== index) {
      renamed.set(key, newKeys[i < index ? i : i - 1])
    }
  })

  const order = visualOrder(oldKeys, layout)
    .filter((i) => i !== index)
    .map((i) => renamed.get(oldKeys[i]) as string)
  const widths: Record<string, number> = {}
  for (const [key, width] of Object.entries(layout.widths)) {
    const next = renamed.get(key)
    if (next !== undefined) {
      widths[next] = width
    }
  }

  return { order, widths }
}

/**
 * The layout after a column is appended to settings.json. It is shown right after `afterKey` when
 * given, or at the end.
 */
export function layoutAfterAdd(
  columns: ColumnConfig[],
  added: ColumnConfig,
  layout: ColumnLayout,
  afterKey?: string,
): { layout: ColumnLayout; key: string } {
  const oldKeys = columnKeys(columns)
  const key = columnKeys([...columns, added]).at(-1) as string
  const shown = visualOrder(oldKeys, layout).map((i) => oldKeys[i])
  const at = afterKey === undefined ? -1 : shown.indexOf(afterKey)
  const order = at < 0 ? [...shown, key] : [...shown.slice(0, at + 1), key, ...shown.slice(at + 1)]

  return { layout: { ...layout, order }, key }
}
