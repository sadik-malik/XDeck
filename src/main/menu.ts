import { BrowserWindow, Menu, type MenuItemConstructorOptions, shell } from 'electron'
import { broadcastSettings, readSettings, writeNotifications } from './settings'
import { DARK_MODE_ID, setDarkMode } from './theme'
import { changeZoom, checkForUpdates, REPO_URL, reloadColumns, requestFitWindow } from './view'

/** Main → shell renderer: open the add-column picker (View → Add Column…). */
export const ADD_COLUMN_REQUEST = 'columns:add-request'

/** Main → shell renderer: show the keyboard shortcuts (Help → Keyboard Shortcuts). */
export const SHOW_SHORTCUTS = 'shortcuts:show'

/** Main → shell renderer: the column layout was reset (View → Reset Layout). */
export const LAYOUT_CHANGED = 'layout:changed'

const NOTIFICATIONS_ID = 'notifications'

/**
 * The app menu. It replaces the Swift bottom toolbar, which the user removed (2026-10-10). Controls
 * live here: View → Dark Mode and Reset Layout; zoom and updates join as they are built.
 * The Edit menu is needed on macOS for copy and paste inside the X pages. On Windows and Linux the
 * menu bar stays hidden until Alt (autoHideMenuBar), and the accelerators still work.
 */
export type MenuOptions = {
  /** Swift showed ⌘F Fit Window only when settings.json sets columnWidth. */
  canFitWindow: boolean
}

export function installAppMenu({ canFitWindow }: MenuOptions): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } satisfies MenuItemConstructorOptions] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        // Swift's ⌘ shortcuts (hidden buttons in ContentView), now menu accelerators. They work while
        // an X column has the keyboard focus, because the menu handles them first.
        { id: 'zoom-in', label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => changeZoom(1) },
        {
          id: 'zoom-out',
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => changeZoom(-1),
        },
        {
          id: 'reset-zoom',
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+.',
          click: () => changeZoom(0),
        },
        { type: 'separator' },
        {
          id: 'add-column',
          label: 'Add Column…',
          accelerator: 'CmdOrCtrl+T',
          click: () => requestAddColumn(),
        },
        {
          id: 'reload-columns',
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => reloadColumns(),
        },
        ...(canFitWindow
          ? [
              {
                id: 'fit-window',
                label: 'Fit Window',
                accelerator: 'CmdOrCtrl+F',
                click: () => requestFitWindow(),
              } satisfies MenuItemConstructorOptions,
            ]
          : []),
        { type: 'separator' },
        {
          id: DARK_MODE_ID,
          label: 'Dark Mode',
          type: 'checkbox',
          checked: readSettings().darkMode,
          click: (item) => void setDarkMode(item.checked),
        },
        {
          id: NOTIFICATIONS_ID,
          label: 'Desktop Notifications',
          type: 'checkbox',
          checked: readSettings().notifications,
          click: (item) => setNotifications(item.checked),
        },
        { type: 'separator' },
        {
          id: 'reset-layout',
          label: 'Reset Layout',
          click: () => resetLayout(),
        },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          id: 'keyboard-shortcuts',
          label: 'Keyboard Shortcuts',
          click: () => {
            for (const win of BrowserWindow.getAllWindows()) {
              win.webContents.send(SHOW_SHORTCUTS)
            }
          },
        },
        { type: 'separator' },
        {
          id: 'check-updates',
          label: 'Check for Updates…',
          click: () => void checkForUpdates(),
        },
        { type: 'separator' },
        { id: 'github', label: 'XDeck on GitHub', click: () => void shell.openExternal(REPO_URL) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Stores Desktop Notifications, keeps the menu checkbox in step, and tells the shell renderer. */
export function setNotifications(notifications: boolean): void {
  writeNotifications(notifications)
  const item = Menu.getApplicationMenu()?.getMenuItemById(NOTIFICATIONS_ID)
  if (item) {
    item.checked = notifications
  }

  broadcastSettings()
}

/** Opens the add-column picker in the shell window. */
export function requestAddColumn(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(ADD_COLUMN_REQUEST)
  }
}

/**
 * Forgets the open deck's dragged order and widths: its columns go back to settings.json order and
 * widths. The renderer knows which deck is open, so it resets and saves that deck's layout.
 */
export function resetLayout(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(LAYOUT_CHANGED)
  }
}
