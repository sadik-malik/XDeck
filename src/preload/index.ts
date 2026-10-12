import { contextBridge, ipcRenderer } from 'electron'

// The shell preload exposes the smallest possible surface.

const xdeck = {
  platform: process.platform,
  // The bundled Chromium version, for the user agent the settings dialog shows (TASK-039).
  chromeVersion: process.versions.chrome,
  // Config channels. The main process rejects every sender except the shell main frame.
  getConfig: () => ipcRenderer.invoke('config:get'),
  openConfigFolder: () => ipcRenderer.invoke('config:open-folder'),
  // Saves the decks and their columns to settings.json and resolves with the new config. Main
  // validates them.
  setDecks: (decks: unknown) => ipcRenderer.invoke('config:set-decks', decks),
  // The deck open last, and the one open now (TASK-022).
  getActiveDeck: () => ipcRenderer.invoke('deck:get-active'),
  setActiveDeck: (deck: string) => ipcRenderer.invoke('deck:set-active', deck),
  // View → Add Column… (main → renderer). Returns an unsubscribe function.
  onAddColumnRequest: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on('columns:add-request', handler)

    return () => {
      ipcRenderer.removeListener('columns:add-request', handler)
    }
  },
  // Settings channels (electron-store in the main process). The main process rejects other senders.
  getSettings: () => ipcRenderer.invoke('settings:get'),
  // The user agent the columns send (TASK-039). The main process validates it and reloads them.
  setUserAgent: (choice: unknown) => ipcRenderer.invoke('settings:set-user-agent', choice),
  // The theme colour X shows (TASK-008). The main process validates it.
  reportThemeColor: (color: string) => ipcRenderer.invoke('theme:report', color),
  // Fit Window (TASK-009): main asks, the renderer answers with the columns' width.
  onFitWindowRequest: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on('window:fit-request', handler)

    return () => {
      ipcRenderer.removeListener('window:fit-request', handler)
    }
  },
  fitWindow: (contentWidth: number) => ipcRenderer.invoke('window:fit', contentWidth),
  // The window buttons' colours on Windows and Linux (TASK-024). Main validates them.
  setTitleBarColors: (background: string, symbols: string) =>
    ipcRenderer.invoke('window:title-bar-colors', background, symbols),
  // The rail's settings menu runs an app-menu item. The main process accepts only its own list.
  runMenuItem: (id: string) => ipcRenderer.invoke('menu:run', id),
  // Help → Keyboard Shortcuts (main → renderer). Returns an unsubscribe function.
  onShowShortcuts: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on('shortcuts:show', handler)

    return () => {
      ipcRenderer.removeListener('shortcuts:show', handler)
    }
  },
  // X's unread notification count (TASK-019). The main process validates it.
  reportUnread: (count: number, account: string | null) =>
    ipcRenderer.invoke('notifications:unread', count, account),
  // Every network's accounts (TASK-023, TASK-049). The main process makes and checks every
  // account id and name.
  getAccounts: () => ipcRenderer.invoke('accounts:get'),
  setFirstAccount: (network: string, name: string) =>
    ipcRenderer.invoke('accounts:set-first', network, name),
  beginLogin: (network: string) => ipcRenderer.invoke('accounts:begin-login', network),
  finishLogin: (network: string, id: string, name: string) =>
    ipcRenderer.invoke('accounts:finish-login', network, id, name),
  cancelLogin: (network: string, id: string) =>
    ipcRenderer.invoke('accounts:cancel-login', network, id),
  removeAccount: (network: string, id: string | null) =>
    ipcRenderer.invoke('accounts:remove', network, id),
  setAccountLabel: (network: string, name: string, label: string) =>
    ipcRenderer.invoke('accounts:set-label', network, name, label),
  // The Facebook user logged in to a session (its c_user cookie), or null. Main checks the session.
  facebookSessionUser: (partition: string) =>
    ipcRenderer.invoke('facebook:session-user', partition),
  // An X login kept from before XDeck kept the user name (TASK-043), looked for once.
  hasUnnamedXSession: () => ipcRenderer.invoke('x-account:has-unnamed-session'),
  markXSessionChecked: () => ipcRenderer.invoke('x-account:session-checked'),
  // A desktop notification was clicked (main → renderer). Returns an unsubscribe function.
  onRevealNotifications: (listener: (network: unknown) => void) => {
    const handler = (_event: unknown, network: unknown) => listener(network)
    ipcRenderer.on('notifications:reveal', handler)

    return () => {
      ipcRenderer.removeListener('notifications:reveal', handler)
    }
  },
  // Column order and widths (TASK-013/014). The main process validates what is saved.
  getColumnLayout: () => ipcRenderer.invoke('layout:get'),
  setColumnLayout: (deck: string, layout: unknown) =>
    ipcRenderer.invoke('layout:set', deck, layout),
  onColumnLayoutReset: (listener: () => void) => {
    const handler = () => listener()
    ipcRenderer.on('layout:changed', handler)

    return () => {
      ipcRenderer.removeListener('layout:changed', handler)
    }
  },
  // Settings changed from the app menu (main → renderer). Returns an unsubscribe function.
  onSettingsChanged: (listener: (settings: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: unknown) => listener(settings)
    ipcRenderer.on('settings:changed', handler)

    return () => {
      ipcRenderer.removeListener('settings:changed', handler)
    }
  },
  // Session channel: writes the persist:x cookies to disk. The main process rejects other senders.
  flushXCookies: () => ipcRenderer.invoke('session:flush-x-cookies'),
}

contextBridge.exposeInMainWorld('xdeck', xdeck)
