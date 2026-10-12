import { Menu, nativeTheme, session, webContents } from 'electron'
import { X_ORIGIN } from '../shared/columns'
import { NETWORKS } from '../shared/networks'
import { LIGHT_BG, nightModeCookie } from '../shared/theme'
import { networkPartitions } from './accounts'
import { broadcastSettings, readSettings, writeDarkBg, writeDarkMode } from './settings'

// Dark mode (TASK-008, Swift ContentView). The menu checkbox sets X's `night_mode` cookie and reloads
// the X columns, the same thing the Swift toggle did, and stays disabled until X confirms the new
// theme (the renderer reports X's theme colour) or a 5 s timeout passes.

export const DARK_MODE_ID = 'dark-mode'
/** Main → shell renderer, same channel as the other settings. */
/** Swift darkModeUpdateTimeout. */
const CONFIRM_TIMEOUT_MS = 5_000

let confirmTimer: ReturnType<typeof setTimeout> | undefined

function darkModeItem(): Electron.MenuItem | null {
  return Menu.getApplicationMenu()?.getMenuItemById(DARK_MODE_ID) ?? null
}

function enableToggle(): void {
  clearTimeout(confirmTimer)
  confirmTimer = undefined
  const item = darkModeItem()
  if (item) {
    item.enabled = true
  }
}

/**
 * The light or dark preference every page sees (prefers-color-scheme). Instagram follows it when a
 * page loads (TASK-047); X follows its own night_mode cookie. XDeck's window follows X's theme
 * colour (data-theme), so it is not affected.
 */
export function applyNativeTheme(darkMode = readSettings().darkMode): void {
  nativeTheme.themeSource = darkMode ? 'dark' : 'light'
}

/**
 * View → Dark Mode: store it, set X's night_mode cookie and the pages' color scheme, and reload the
 * X and Instagram columns.
 */
export async function setDarkMode(darkMode: boolean): Promise<void> {
  writeDarkMode(darkMode)
  const item = darkModeItem()
  if (item) {
    item.checked = darkMode
    item.enabled = false
  }

  clearTimeout(confirmTimer)
  confirmTimer = setTimeout(enableToggle, CONFIRM_TIMEOUT_MS)
  broadcastSettings()
  applyNativeTheme(darkMode)

  // Every X account's session (TASK-023): each keeps its own night_mode cookie. Dark asks for the
  // dark theme X showed last (TASK-028).
  const value = nightModeCookie(darkMode, readSettings().darkBg)
  const xSessions = networkPartitions('x').map((partition) => session.fromPartition(partition))
  await Promise.all(
    xSessions.map((xSession) =>
      xSession.cookies.set({
        url: X_ORIGIN,
        name: 'night_mode',
        value,
        domain: '.x.com',
        path: '/',
        secure: true,
        expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      }),
    ),
  )
  // Every network's pages reload: X's for the cookie, the others for the color scheme they read on
  // load (TASK-047).
  const sessions = NETWORKS.flatMap(networkPartitions).map((partition) =>
    session.fromPartition(partition),
  )
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview' && sessions.includes(contents.session)) {
      contents.reload()
    }
  }
}

/**
 * The renderer reports the theme colour X shows (already normalized to #rrggbb). Swift set
 * isDarkMode from it (`color != Color.white`) and ended the toggle's disabled state.
 */
export function reportThemeColor(color: string): void {
  const darkMode = color !== LIGHT_BG
  const settings = readSettings()
  let changed = false
  if (settings.darkMode !== darkMode) {
    writeDarkMode(darkMode)
    applyNativeTheme(darkMode)
    const item = darkModeItem()
    if (item) {
      item.checked = darkMode
    }

    changed = true
  }
  // Remember which dark theme X shows (Dim or Lights out) for the next switch to dark (TASK-028).
  if (darkMode && settings.darkBg !== color) {
    writeDarkBg(color)
    changed = true
  }

  if (changed) {
    broadcastSettings()
  }

  enableToggle()
}
