import type { AppConfig } from '../shared/app-config'
import type { ColumnLayout } from '../shared/column-layout'
import type { ConfigResult } from '../shared/config-result'
import type { DeckConfig } from '../shared/decks'
import type { Network } from '../shared/networks'
import type { RailMenuItem } from '../shared/rail'
import type { AppSettings } from '../shared/settings'
import type { UserAgentChoice } from '../shared/user-agents'

export type XDeckBridge = {
  platform: NodeJS.Platform
  /** The bundled Chromium version (process.versions.chrome). */
  chromeVersion: string
  /** The settings.json result loaded at startup. */
  getConfig: () => Promise<ConfigResult<AppConfig>>
  /** Opens the config folder in the system file manager. */
  openConfigFolder: () => Promise<void>
  /** Saves the decks to settings.json. Resolves with the new config; rejects when invalid. */
  setDecks: (decks: DeckConfig[]) => Promise<AppConfig>
  /** The deck open last, by key, or null. */
  getActiveDeck: () => Promise<unknown>
  /** Remembers the open deck. */
  setActiveDeck: (deck: string) => Promise<void>
  /** View → Add Column… was chosen. Returns an unsubscribe function. */
  onAddColumnRequest: (listener: () => void) => () => void
  /** The persisted app settings (electron-store). */
  getSettings: () => Promise<AppSettings>
  /** Sets the user agent the columns send, and reloads them. Rejects an invalid choice. */
  setUserAgent: (choice: UserAgentChoice) => Promise<void>
  /** Reports X's theme colour (#rrggbb). The main process updates dark mode from it. */
  reportThemeColor: (color: string) => Promise<void>
  /** View → Fit Window was chosen. Returns an unsubscribe function. */
  onFitWindowRequest: (listener: () => void) => () => void
  /** Fits the window's content width to `contentWidth` CSS px (clamped to the screen). */
  fitWindow: (contentWidth: number) => Promise<void>
  /** Colours of the window buttons drawn over the title bar (Windows and Linux). */
  setTitleBarColors: (background: string, symbols: string) => Promise<void>
  /** Runs an app-menu item from the rail (Dark Mode, Notifications, zoom, Reset Layout...). */
  runMenuItem: (id: RailMenuItem) => Promise<void>
  /** Help → Keyboard Shortcuts was chosen. Returns an unsubscribe function. */
  onShowShortcuts: (listener: () => void) => () => void
  /** Reports an account's unread count (from its page titles), by unread key (unreadKey). */
  reportUnread: (count: number, account: string | null) => Promise<void>
  /** Every network's accounts: its first account's name and its added accounts (parseKnownAccounts). */
  getAccounts: () => Promise<unknown>
  /** Keeps a network's first account's name. Rejects one that is not the network's account name. */
  setFirstAccount: (network: Network, name: string) => Promise<unknown>
  /** Starts adding an account: the id of its new session (`<prefix><id>`). */
  beginLogin: (network: Network) => Promise<string>
  /** The new account's login window found who logged in. Resolves with the added accounts. */
  finishLogin: (network: Network, id: string, name: string) => Promise<unknown>
  /** The login was abandoned: its session is thrown away. */
  cancelLogin: (network: Network, id: string) => Promise<void>
  /** Removes an account (null: the first) and its session's data. Resolves with the network's accounts. */
  removeAccount: (network: Network, id: string | null) => Promise<unknown>
  /** The Facebook user id logged in to one of XDeck's Facebook sessions, or null. */
  facebookSessionUser: (partition: string) => Promise<string | null>
  /** Keeps the label a page showed for an account. Resolves with the network's accounts. */
  setAccountLabel: (network: Network, name: string, label: string) => Promise<unknown>
  /** persist:x holds an X login but no user name is kept (a profile from before, TASK-043). */
  hasUnnamedXSession: () => Promise<boolean>
  /** That search has run: it never runs again for this profile. */
  markXSessionChecked: () => Promise<void>
  /** A desktop notification was clicked. Returns an unsubscribe function. */
  onRevealNotifications: (listener: (network: unknown) => void) => () => void
  /** Every deck's saved column order and widths (unvalidated: parseDeckLayouts). */
  getColumnLayout: () => Promise<unknown>
  /** Saves a deck's column order and widths. Rejects when the layout is malformed. */
  setColumnLayout: (deck: string, layout: ColumnLayout) => Promise<void>
  /** View → Reset Layout was chosen. Returns an unsubscribe function. */
  onColumnLayoutReset: (listener: () => void) => () => void
  /** Settings changed from the app menu. The value is unvalidated; returns an unsubscribe function. */
  onSettingsChanged: (listener: (settings: unknown) => void) => () => void
  /** Writes the persist:x login cookies to disk. Resolves once they are stored. */
  flushXCookies: () => Promise<void>
}

declare global {
  interface Window {
    xdeck: XDeckBridge
  }
}
