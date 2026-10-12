import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, type BrowserWindowConstructorOptions, type Rectangle, screen } from 'electron'
import { TITLE_BAR_HEIGHT, TITLE_BAR_OVERLAY_HEIGHT } from '../shared/window'

export const DEFAULT_WIDTH = 1280
export const DEFAULT_HEIGHT = 900

/** Centred window, clamped to the work area of the display it lands on (never under the taskbar or Dock). */
export function computeInitialBounds(): Rectangle {
  const primary = screen.getPrimaryDisplay().workArea
  const display = screen.getDisplayMatching({
    x: primary.x,
    y: primary.y,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  })

  const area = display.workArea
  const width = Math.min(DEFAULT_WIDTH, area.width)
  const height = Math.min(DEFAULT_HEIGHT, area.height)

  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  }
}

/** Options for the shell window. Columns are <webview> tags, so webviewTag is the only addition. */
export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  const bounds = computeInitialBounds()
  const isMac = process.platform === 'darwin'

  return {
    ...bounds,
    title: 'XDeck',
    backgroundColor: '#FFFFFF',
    // XDeck draws its own title bar (TASK-024). macOS keeps its traffic lights, inset into it; Windows
    // and Linux draw their window buttons over its right end, in colours the renderer keeps in step
    // with X's theme (window:title-bar-colors). No menu bar shows on Windows or Linux, not even on
    // Alt: everything in it is in the rail's menus, and its shortcuts still work.
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 12, y: Math.round((TITLE_BAR_HEIGHT - 16) / 2) },
        }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#FFFFFF',
            symbolColor: '#536471',
            height: TITLE_BAR_OVERLAY_HEIGHT,
          },
        }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  }
}

/**
 * electron-vite's dev server URL, honoured only in development builds (security audit, TASK-036): a
 * release build that took it from the environment would load any page into the shell window, with
 * the shell's bridge and IPC trust.
 */
export function devServerUrl(): string | undefined {
  return app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL || undefined
}

/** The renderer entry: the dev server URL in development, otherwise the built index.html. */
export function rendererEntryUrl(): string {
  const devUrl = devServerUrl()
  if (devUrl) {
    return devUrl
  }

  return pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

/** True when a navigation target is the app itself (dev server origin, or the built index.html). */
export function isAllowedAppUrl(target: string): boolean {
  const devUrl = devServerUrl()
  try {
    const url = new URL(target)
    if (devUrl) {
      return url.origin === new URL(devUrl).origin
    }

    return url.href.split('#')[0] === rendererEntryUrl()
  } catch {
    return false
  }
}
