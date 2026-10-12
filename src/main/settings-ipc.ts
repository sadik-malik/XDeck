import { BrowserWindow, type IpcMainInvokeEvent, ipcMain, Menu } from 'electron'
import type { KnownAccounts } from '../shared/accounts'
import { parseColumnLayout } from '../shared/column-layout'
import { type DeckLayouts, isDeckKey } from '../shared/decks'
import { isNetwork, NETWORKS, type Network, parseUnreadKey } from '../shared/networks'
import { RAIL_MENU_ITEMS } from '../shared/rail'
import type { AppSettings } from '../shared/settings'
import { normalizeThemeColor } from '../shared/theme'
import { parseUserAgentChoice } from '../shared/user-agents'
import { TITLE_BAR_OVERLAY_HEIGHT } from '../shared/window'
import {
  beginLogin,
  cancelLogin,
  facebookSessionUser,
  finishLogin,
  hasUnnamedXSession,
  markXSessionChecked,
  readNetworkAccounts,
  removeAccount,
  setAccountLabel,
  setFirstAccount,
} from './accounts'
import { isShellMainFrame } from './config-ipc'
import { MAX_UNREAD, reportUnread } from './notifications'
import {
  broadcastSettings,
  readActiveDeck,
  readDeckLayouts,
  readSettings,
  writeActiveDeck,
  writeDeckLayout,
  writeUserAgent,
} from './settings'
import { reportThemeColor } from './theme'
import { fitWindowTo, reloadColumns } from './view'
import { applyColumnUserAgent } from './webview'

function requireNetwork(value: unknown): Network {
  if (!isNetwork(value)) {
    throw new Error('accounts IPC takes a network')
  }

  return value
}

function requireShellMainFrame(event: IpcMainInvokeEvent): void {
  if (!isShellMainFrame(event)) {
    throw new Error('settings IPC is only available to the XDeck shell window')
  }
}

/**
 * Registers the settings channel (read only: changes come from the app menu, src/main/menu.ts). Every call from a sender other than the shell main frame
 * rejects, the same rule as the config channels (roadmap §2 "security baseline").
 */
export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', (event): AppSettings => {
    requireShellMainFrame(event)

    return readSettings()
  })
  // The user agent the columns send (TASK-039): a preset or a checked custom string (printable
  // ASCII only, so nothing can be added to the request headers). Every column reloads with it.
  ipcMain.handle('settings:set-user-agent', (event, value: unknown): void => {
    requireShellMainFrame(event)
    const choice = parseUserAgentChoice(value)
    if (!choice) {
      throw new Error('settings:set-user-agent takes a preset or a valid custom user agent')
    }

    writeUserAgent(choice)
    applyColumnUserAgent()
    reloadColumns()
    broadcastSettings()
  })
  // The theme colour X reports for its pages (TASK-008). It comes from a web page, so only a plain
  // hex colour is accepted.
  ipcMain.handle('theme:report', (event, value: unknown): void => {
    requireShellMainFrame(event)
    const color = normalizeThemeColor(value)
    if (!color) {
      throw new Error('theme:report takes a #rrggbb colour')
    }

    reportThemeColor(color)
  })
  // The window buttons on Windows and Linux are drawn over XDeck's title bar in the app's colours,
  // which follow X's theme (TASK-024). Plain hex colours only.
  ipcMain.handle('window:title-bar-colors', (event, background: unknown, symbols: unknown) => {
    requireShellMainFrame(event)
    const color = normalizeThemeColor(background)
    const symbolColor = normalizeThemeColor(symbols)
    if (!color || !symbolColor) {
      throw new Error('window:title-bar-colors takes two #rrggbb colours')
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && process.platform !== 'darwin') {
      win.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_OVERLAY_HEIGHT })
    }
  })
  // The renderer answers a Fit Window request with the columns' total width (TASK-009).
  ipcMain.handle('window:fit', (event, value: unknown): void => {
    requireShellMainFrame(event)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 100_000) {
      throw new Error('window:fit takes a width in CSS px')
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      fitWindowTo(win, value)
    }
  })
  // The rail's settings menu runs the same app-menu items (TASK-018): on Windows and Linux the menu
  // bar is hidden until Alt. Only the items listed here can be run.
  ipcMain.handle('menu:run', (event, value: unknown): void => {
    requireShellMainFrame(event)
    if (typeof value !== 'string' || !(RAIL_MENU_ITEMS as readonly string[]).includes(value)) {
      throw new Error('menu:run takes one of the rail menu items')
    }

    Menu.getApplicationMenu()?.getMenuItemById(value)?.click()
  })
  // X's unread count from its page titles (TASK-019). It comes from a web page, so only a whole
  // number in range is accepted.
  ipcMain.handle('notifications:unread', (event, value: unknown, account: unknown): void => {
    requireShellMainFrame(event)
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_UNREAD) {
      throw new Error('notifications:unread takes a count')
    }

    if (account !== undefined && parseUnreadKey(account) === null) {
      throw new Error('notifications:unread takes an account key or null')
    }

    reportUnread(
      value,
      (account ?? null) as string | null,
      BrowserWindow.fromWebContents(event.sender),
    )
  })
  // Every network's accounts (TASK-023, TASK-049): each first account's name and the added
  // accounts. Main makes every added account's session id; the renderer only names ids main gave it.
  ipcMain.handle('accounts:get', (event): KnownAccounts => {
    requireShellMainFrame(event)

    return Object.fromEntries(
      NETWORKS.map((network) => [network, readNetworkAccounts(network)]),
    ) as KnownAccounts
  })
  // A network's first account logged in, or a page of its session showed who is logged in.
  ipcMain.handle('accounts:set-first', (event, network: unknown, name: unknown): string => {
    requireShellMainFrame(event)

    return setFirstAccount(requireNetwork(network), name)
  })

  ipcMain.handle('accounts:begin-login', (event, network: unknown): string => {
    requireShellMainFrame(event)

    return beginLogin(requireNetwork(network))
  })

  ipcMain.handle('accounts:finish-login', (event, network: unknown, id: unknown, name: unknown) => {
    requireShellMainFrame(event)

    return finishLogin(requireNetwork(network), id, name)
  })

  ipcMain.handle('accounts:cancel-login', (event, network: unknown, id: unknown) => {
    requireShellMainFrame(event)

    return cancelLogin(requireNetwork(network), id)
  })
  // The first account (no id) or an added one. Resolves with the network's accounts.
  ipcMain.handle('accounts:remove', (event, network: unknown, id: unknown) => {
    requireShellMainFrame(event)

    return removeAccount(requireNetwork(network), id)
  })

  // The label a network's page showed for one of its accounts (a Facebook account's name).
  ipcMain.handle('accounts:set-label', (event, network: unknown, name: unknown, label: unknown) => {
    requireShellMainFrame(event)

    return setAccountLabel(requireNetwork(network), name, label)
  })
  // Who is logged in to a Facebook session, from its cookie: the login window asks until it knows.
  ipcMain.handle('facebook:session-user', (event, partition: unknown) => {
    requireShellMainFrame(event)

    return facebookSessionUser(partition)
  })

  ipcMain.handle('x-account:has-unnamed-session', (event) => {
    requireShellMainFrame(event)

    return hasUnnamedXSession()
  })

  ipcMain.handle('x-account:session-checked', (event): void => {
    requireShellMainFrame(event)
    markXSessionChecked()
  })
  // Every deck's saved order and widths (TASK-022), and the layout saved before decks existed.
  ipcMain.handle('layout:get', (event): DeckLayouts => {
    requireShellMainFrame(event)

    return readDeckLayouts()
  })
  // The renderer saves a deck's layout after a resize or reorder drag. It is checked here, because
  // the renderer is not trusted to send well-formed data.
  ipcMain.handle('layout:set', (event, deck: unknown, value: unknown): void => {
    requireShellMainFrame(event)
    const layout = parseColumnLayout(value)
    if (!isDeckKey(deck) || !layout) {
      throw new Error('layout:set takes a deck key and a valid column layout')
    }

    writeDeckLayout(deck, layout)
  })
  // The open deck, by key, so the app opens on it next time.
  ipcMain.handle('deck:get-active', (event): string | null => {
    requireShellMainFrame(event)

    return readActiveDeck()
  })

  ipcMain.handle('deck:set-active', (event, deck: unknown): void => {
    requireShellMainFrame(event)
    if (!isDeckKey(deck)) {
      throw new Error('deck:set-active takes a deck key')
    }

    writeActiveDeck(deck)
  })
}
