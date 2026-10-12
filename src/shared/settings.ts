import { DARK_DEFAULT_BG, parseDarkBg } from './theme'
import { DEFAULT_USER_AGENT, parseUserAgentChoice, type UserAgentChoice } from './user-agents'

/** App settings kept in the main process (electron-store), not in settings.json. */
export type AppSettings = {
  /** Dark mode (Swift @AppStorage "isDarkMode"). Off by default; follows X's theme colour. */
  darkMode: boolean
  /** The dark background X showed last (Dim or Lights out), for the next switch to dark (TASK-028). */
  darkBg: string
  /** Page zoom (Swift @AppStorage "pageZoom"): scales column widths and the pages. 1 by default. */
  pageZoom: number
  /** Desktop notifications when X's unread count goes up (TASK-019). On by default. */
  notifications: boolean
  /** The user agent the columns send (TASK-039): a preset or the user's own string. */
  userAgent: UserAgentChoice
}

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: false,
  darkBg: DARK_DEFAULT_BG,
  pageZoom: 1,
  notifications: true,
  userAgent: DEFAULT_USER_AGENT,
}

/** Zoom limits and step (Swift ⌘+ / ⌘- changed pageZoom by 0.2). */
export const MIN_ZOOM = 0.4
export const MAX_ZOOM = 3
export const ZOOM_STEP = 0.2

/** A zoom value rounded to one decimal and kept within the limits. */
export function clampZoom(zoom: number): number {
  const rounded = Math.round(zoom * 10) / 10

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rounded))
}

/** A settings value from IPC, checked. Anything malformed is null. */
export function parseSettings(value: unknown): AppSettings | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const { darkMode, darkBg, pageZoom, notifications, userAgent } = value as {
    darkMode?: unknown
    darkBg?: unknown
    pageZoom?: unknown
    notifications?: unknown
    userAgent?: unknown
  }

  if (typeof darkMode !== 'boolean' || typeof notifications !== 'boolean') {
    return null
  }

  if (typeof pageZoom !== 'number' || !Number.isFinite(pageZoom)) {
    return null
  }

  return {
    darkMode,
    darkBg: parseDarkBg(darkBg),
    pageZoom: clampZoom(pageZoom),
    notifications,
    userAgent: parseUserAgentChoice(userAgent) ?? DEFAULT_USER_AGENT,
  }
}
