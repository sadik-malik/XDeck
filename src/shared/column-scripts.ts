import type { ColumnConfig } from './app-config'
import { type ColumnFilters, parseColumnFilters } from './column-filters'
import { columnNetwork } from './columns'

/**
 * The scripts a column preload can run, by name. Names cross IPC, never code: the preload maps
 * each name to its own function and ignores anything else.
 */
export const COLUMN_SCRIPTS = [
  'hideSideHeader',
  'hidePostArea',
  'clickForYouTab',
  'clickFollowingTab',
  // Login screen only (TASK-007). Never part of a column's scripts.
  'findUserName',
  // Instagram columns (roadmap §9).
  'hideInstagramBars',
  'findInstagramUserName',
  // Every network's column but X's (TASK-047).
  'reportPageTheme',
  // Facebook columns (roadmap §11).
  'hideFacebookBars',
  'reportFacebookLogin',
  'findFacebookName',
  // Post as Instagram's or Facebook's window only. Never part of a column's scripts.
  'openInstagramNewPost',
  'openFacebookNewPost',
] as const

export type ColumnScript = (typeof COLUMN_SCRIPTS)[number]

/** What the renderer sends each column once its preload has reported in (`xdeck:column-setup`). */
export type ColumnSetup = {
  scripts: ColumnScript[]
  /** The column's filters (TASK-021); none when left out. */
  filters?: ColumnFilters
}

/**
 * The scripts one column runs (Swift ContentView.makeColumn). `isX` is column.isXColumn. Every X
 * column hides X's side navigation and post box: XDeck's rail has Compose and the navigation
 * (TASK-018; Swift kept them in the leftmost X column). An Instagram column hides Instagram's bars
 * and reports its user name, for the accounts menu; a Facebook column hides Facebook's bars and
 * reports its login form. Other custom columns get nothing.
 */
export function columnScripts(column: ColumnConfig, isX: boolean): ColumnScript[] {
  const network = columnNetwork(column)
  if (network === 'instagram') {
    return ['hideInstagramBars', 'findInstagramUserName', 'reportPageTheme']
  }

  if (network === 'facebook') {
    return ['hideFacebookBars', 'reportFacebookLogin', 'findFacebookName', 'reportPageTheme']
  }

  if (!isX) {
    return []
  }

  const scripts: ColumnScript[] = ['hideSideHeader', 'hidePostArea']
  if (column.type === 'forYou') {
    scripts.push('clickForYouTab')
  } else if (column.type === 'following') {
    scripts.push('clickFollowingTab')
  }

  return scripts
}

/** Checks a value that arrived over IPC. Returns null when it is not a valid setup. */
export function parseColumnSetup(value: unknown): ColumnSetup | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const { scripts, filters } = value as Record<string, unknown>
  if (!Array.isArray(scripts)) {
    return null
  }

  const known = scripts.filter((name): name is ColumnScript =>
    (COLUMN_SCRIPTS as readonly unknown[]).includes(name),
  )
  if (filters === undefined) {
    return { scripts: known }
  }

  const checked = parseColumnFilters(filters)

  return checked ? { scripts: known, filters: checked } : null
}
