import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, session } from 'electron'
import { customColumnOrigins } from '../shared/columns'
import { allColumns } from '../shared/decks'
import { bundledConfigDirectory, configDirectory, loadConfig } from './config'
import { registerConfigIpc } from './config-ipc'
import { installAppMenu } from './menu'
import { createWindowOptions, devServerUrl, isAllowedAppUrl, rendererEntryUrl } from './security'
import { registerSessionIpc } from './session-ipc'
import { registerSettingsIpc } from './settings-ipc'
import { applyNativeTheme } from './theme'
import {
  configureColumnSessions,
  flushXCookies,
  guardWebviewAttach,
  hardenGuestContents,
  setCustomGuestOrigins,
} from './webview'

// Windows shows a toast only for an app with an AppUserModelID. The installer registers this one
// (electron-builder appId); the same id is set here so unpackaged builds work too.
if (process.platform === 'win32') {
  app.setAppUserModelId('io.github.sadik-malik.xdeck')
}

// Test hook (roadmap §5.1). Only honoured for unpackaged builds, so a release
// build ignores XDECK_USER_DATA entirely. Must run before 'ready'.
if (!app.isPackaged && process.env.XDECK_USER_DATA) {
  app.setPath('userData', process.env.XDECK_USER_DATA)
}

/**
 * Dev-only capture hook. When XDECK_CAPTURE_PATH is set, write one real window pixel capture
 * (BrowserWindow.capturePage) to that PNG after the first load. Ignored in release builds.
 */
function captureFirstLoad(win: BrowserWindow): void {
  const target = process.env.XDECK_CAPTURE_PATH
  if (app.isPackaged || !target) {
    return
  }

  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      void win.capturePage().then((image) => {
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, image.toPNG())
      })
    }, 1000)
  })
}

/**
 * With the system title bar hidden, Windows makes the window a few px bigger than asked (1286 for
 * 1280), which on a screen that size pushes the right edge, and the close button, off screen. The
 * difference is measured and taken off once (TASK-024).
 */
function keepInWorkArea(win: BrowserWindow, requested: Electron.Rectangle): void {
  const actual = win.getBounds()
  const extraWidth = actual.width - requested.width
  const extraHeight = actual.height - requested.height
  if (extraWidth > 0 || extraHeight > 0) {
    win.setBounds({
      ...requested,
      width: requested.width - Math.max(0, extraWidth),
      height: requested.height - Math.max(0, extraHeight),
    })
  }
}

/** XDeck's icon (resources/icon.png, rendered by `pnpm icon`): beside the app in a package, in the repo otherwise. */
function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../resources/icon.png')
}

function createMainWindow(): BrowserWindow {
  const options = createWindowOptions(join(__dirname, '../preload/index.js'))
  const requested = {
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 0,
    height: options.height ?? 0,
  }
  // The window's own icon, so the taskbar shows XDeck's and not Electron's when the app is run
  // from the repo (Windows and Linux; a package also has it in its executable and desktop entry).
  const win = new BrowserWindow({ ...options, icon: appIconPath(), show: false })
  if (process.platform === 'darwin' && !app.isPackaged) {
    // macOS takes the Dock icon from the app bundle, which is Electron's when run from the repo.
    app.dock?.setIcon(appIconPath())
  }

  win.on('ready-to-show', () => win.show())
  // The app menu stays set for its shortcuts, but no menu bar shows on Windows and Linux (TASK-024).
  if (process.platform !== 'darwin') {
    win.setMenuBarVisibility(false)
    keepInWorkArea(win, requested)
  }

  captureFirstLoad(win)

  // No window.open and no navigation away from the app (roadmap §2 "Links").
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const guardNavigation = (event: Electron.Event, url: string): void => {
    if (!isAllowedAppUrl(url)) {
      event.preventDefault()
    }
  }

  win.webContents.on('will-navigate', guardNavigation)
  win.webContents.on('will-redirect', guardNavigation)
  // Columns: every <webview> is checked and hardened before its guest is created (roadmap §2).
  win.webContents.on('will-attach-webview', guardWebviewAttach)

  const entry = rendererEntryUrl()
  if (devServerUrl()) {
    void win.loadURL(entry)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// Guest webContents (webview tags) get their own policy as soon as they are created.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    hardenGuestContents(contents)
  }
})

void app.whenReady().then(async () => {
  // Permissions: deny everything by default (roadmap §2), except full screen: a column's video
  // going full screen takes its <webview> in the shell full screen too (TASK-033).
  // Must run after ready: session.defaultSession is unavailable before it.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'fullscreen')
  })

  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => permission === 'fullscreen',
  )
  configureColumnSessions()
  // Pages load with XDeck's light or dark preference (Instagram follows it, TASK-047).
  applyNativeTheme()

  // settings.json is loaded once, before the window exists, so the renderer's first config:get
  // already has the result (TASK-004, roadmap §1 "Config"). The guest allow-list for custom columns
  // is derived here from that same result, never from the renderer (TASK-005).
  const configDir = configDirectory()
  const result = await loadConfig(configDir, bundledConfigDirectory())
  if (result.ok) {
    setCustomGuestOrigins(customColumnOrigins(allColumns(result.config)))
  }

  registerConfigIpc(result, configDir)
  registerSettingsIpc()
  installAppMenu({ canFitWindow: result.ok && result.config.columnWidth !== undefined })
  registerSessionIpc()

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

// Quit flushes the login cookie store, once. The flag lets the second before-quit (from app.quit())
// through, so the quit is not held up again.
let cookiesFlushedOnQuit = false
app.on('before-quit', (event) => {
  if (cookiesFlushedOnQuit) {
    return
  }

  event.preventDefault()
  void flushXCookies()
    .catch(() => undefined)
    .finally(() => {
      cookiesFlushedOnQuit = true
      app.quit()
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
