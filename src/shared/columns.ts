import type { ColumnConfig } from './app-config'
import {
  NETWORK_INFO,
  type Network,
  networkOfHost,
  networkOfOrigin,
  networkOfPartition,
} from './networks'

/**
 * Width of XDeck's navigation rail, CSS px. It replaces X's own side navigation, which the Swift app
 * kept in the leftmost X column with 68 px extra (sideHeaderWidth), so it is the same width.
 */
export const RAIL_WIDTH = 68

/** Hosts that count as X. Exact names only: a lookalike host must not match. */
export const X_HOSTS = NETWORK_INFO.x.hosts

/** The https origins X uses for its own pages. */
export const X_ORIGINS: readonly string[] = X_HOSTS.map((host) => `https://${host}`)

/** The origin every X column loads from, and the login page's origin. */
export const X_ORIGIN = NETWORK_INFO.x.origin

/** Partition of the first X account's columns. Login cookies live here (roadmap §2). */
export const X_PARTITION = NETWORK_INFO.x.partition

/** The origin every Instagram column loads from (roadmap §9). */
export const INSTAGRAM_ORIGIN = NETWORK_INFO.instagram.origin

/**
 * The first Instagram account's session: its own cookies, shared with neither X nor other sites.
 * Each added Instagram account has persist:ig-<id> (TASK-049).
 */
export const INSTAGRAM_PARTITION = NETWORK_INFO.instagram.partition

/** Partition of every other custom column, so no network's cookies are ever sent to it. */
export const CUSTOM_PARTITION = 'persist:custom'

/**
 * The guest partition for a URL: the network's first session (persist:x, persist:ig) for a network's
 * page, persist:custom for everything else.
 */
export function partitionForOrigin(origin: string): string {
  const network = networkOfOrigin(origin)

  return network ? NETWORK_INFO[network].partition : CUSTOM_PARTITION
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/**
 * The network a column shows, or null for any other web page. The four X types always show X. A
 * custom column shows the network its host belongs to.
 */
export function columnNetwork(column: ColumnConfig): Network | null {
  if (column.type !== 'custom') {
    return 'x'
  }

  const url = parseUrl(column.url)

  return url ? networkOfHost(url.hostname) : null
}

/** Whether a column is an X column (the X-only scripts and the theme colour). */
export function isXColumn(column: ColumnConfig): boolean {
  return columnNetwork(column) === 'x'
}

/** Whether a column shows Instagram (roadmap §9): a custom column on an Instagram host. */
export function isInstagramColumn(column: ColumnConfig): boolean {
  return columnNetwork(column) === 'instagram'
}

/** What a column shows: a page to load, or a placeholder with the reason. */
export type ColumnTarget =
  | { kind: 'page'; url: string; partition: string }
  | { kind: 'placeholder'; message: string }

/**
 * The page a column loads. `forYou` and `following` load the home timeline. `profile` loads the
 * logged-in user's profile. `username` is a validated user name (TASK-007), so the URL is safe.
 * `accountPartition` is the session of the column's account (TASK-023, TASK-049).
 */
export function columnTarget(
  column: ColumnConfig,
  username: string,
  accountPartition: string = X_PARTITION,
): ColumnTarget {
  const pageTarget = (url: string) => target(url, accountPartition)
  switch (column.type) {
    case 'forYou':
    case 'following':
      return pageTarget(`${X_ORIGIN}/home`)
    case 'notifications':
      return pageTarget(`${X_ORIGIN}/notifications`)
    case 'profile':
      return pageTarget(`${X_ORIGIN}/${username}`)
    case 'custom': {
      const url = parseUrl(column.url)
      if (!url) {
        return { kind: 'placeholder', message: `not a valid URL: ${column.url}` }
      }

      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return {
          kind: 'placeholder',
          message: `only http and https URLs can be shown: ${column.url}`,
        }
      }

      return pageTarget(url.href)
    }
  }
}

/**
 * A network's page loads in the column's account session (TASK-023, TASK-049), or the network's
 * first session when the account's is another network's; any other page in persist:custom.
 */
function target(url: string, accountPartition: string): ColumnTarget {
  const network = networkOfOrigin(new URL(url).origin)
  if (!network) {
    return { kind: 'page', url, partition: CUSTOM_PARTITION }
  }

  const partition =
    networkOfPartition(accountPartition) === network
      ? accountPartition
      : NETWORK_INFO[network].partition

  return { kind: 'page', url, partition }
}

/** Origins a custom column may load, http and https only. Used for the main-process allow-list. */
export function customColumnOrigins(columns: ColumnConfig[]): string[] {
  const origins = new Set<string>()
  for (const column of columns) {
    if (column.type !== 'custom') {
      continue
    }

    const url = parseUrl(column.url)
    if (url && (url.protocol === 'https:' || url.protocol === 'http:')) {
      origins.add(url.origin)
    }
  }

  return [...origins]
}

/**
 * Pixel width of every column, CSS px. `stripWidth` is the space right of the navigation rail.
 * Every column is columnWidth wide when it is set, or the strip divided by the number of columns.
 * The Swift app gave the leftmost X column +68 for X's side navigation; the rail now takes those
 * 68 px for every column (TASK-018), so the totals are the same as before. Widths are rounded down
 * onto widthGridStep, so every column edge lands on a whole device pixel. The sliver left over stays
 * at the end of the strip.
 */
export function columnWidths(
  count: number,
  stripWidth: number,
  columnWidth: number | undefined,
  pixelRatio: number,
  zoom = 1,
): number[] {
  if (count === 0) {
    return []
  }
  // Swift: dynamicColumnWidth = baseWidth * pageZoom.
  const base = (columnWidth ?? stripWidth / count) * zoom

  return Array.from({ length: count }, () => floorToWidthGrid(base, pixelRatio))
}

/**
 * The grid column widths are rounded down to, in CSS px. A width must be a whole number of CSS px,
 * because a guest's layout width is an integer: 370.67 can round up to 371 and push the guest's
 * right frame past its box, where the column clips it. It must also be a whole number of device px,
 * so the column edges land on device pixels. At 150 % that needs multiples of 2 CSS px (3 device
 * px); at 100 % and 200 % it is 1 CSS px. (TASK-005, layout (b) and (f).)
 */
export function widthGridStep(pixelRatio: number): number {
  for (let step = 1; step <= 8; step++) {
    if (Number.isInteger(Number((step * pixelRatio).toFixed(6)))) {
      return step
    }
  }

  return 1
}

/** Rounds a CSS px width down onto widthGridStep. */
export function floorToWidthGrid(cssPx: number, pixelRatio: number): number {
  const step = widthGridStep(pixelRatio)

  return Math.floor(cssPx / step + 1e-9) * step
}
