import { app, BrowserWindow, dialog, net, screen, shell, webContents } from 'electron'
import { clampZoom, ZOOM_STEP } from '../shared/settings'
import { broadcastSettings, readSettings, writePageZoom } from './settings'

// View and Help menu actions (TASK-009). They replace the Swift hidden-button shortcuts and the
// removed bottom toolbar: zoom, reload, fit window, GitHub and the update check.

/** Main → shell renderer: send back the columns' total width so the window can fit it. */
export const FIT_REQUEST = 'window:fit-request'

export const REPO_URL = 'https://github.com/sadik-malik/XDeck'
const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`

function shellWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows()
}

/** Swift ⌘+ / ⌘- / ⌘. : pageZoom ± 0.2, or back to 1. The renderer applies it to widths and pages. */
export function changeZoom(direction: 1 | -1 | 0): void {
  const current = readSettings().pageZoom
  writePageZoom(direction === 0 ? 1 : clampZoom(current + direction * ZOOM_STEP))
  broadcastSettings()
}

/** Swift ⌘R: reloads every column. The shell itself is not reloaded. */
export function reloadColumns(): void {
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview') {
      contents.reload()
    }
  }
}

/** Reloads every column page of one session (after its account was removed). */
export function reloadPagesIn(target: Electron.Session): void {
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview' && contents.session === target) {
      contents.reload()
    }
  }
}

/** Swift ⌘F: asks the renderer for the columns' width; it answers through window:fit. */
export function requestFitWindow(): void {
  for (const win of shellWindows()) {
    win.webContents.send(FIT_REQUEST)
  }
}

/**
 * Swift WindowWidthFitter: the window's content width becomes the columns' width, clamped to the
 * work area of the display it is on. The height is kept.
 */
export function fitWindowTo(win: BrowserWindow, contentWidth: number): void {
  const workArea = screen.getDisplayMatching(win.getBounds()).workArea
  const [, contentHeight] = win.getContentSize()
  const frameWidth = win.getBounds().width - win.getContentSize()[0]
  const width = Math.max(1, Math.min(Math.round(contentWidth), workArea.width - frameWidth))
  win.setContentSize(width, contentHeight)
  // Keep the window on the work area after it grew.
  const bounds = win.getBounds()
  const x = Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - bounds.width)
  if (x !== bounds.x) {
    win.setBounds({ ...bounds, x })
  }
}

/** The X.Y part of a version, as numbers (3.3.0 → [3, 3]). */
function majorMinor(version: string): [number, number] | null {
  const match = /^(\d+)\.(\d+)/.exec(version)

  return match ? [Number(match[1]), Number(match[2])] : null
}

/**
 * Swift UpdateButton.checkForUpdate: the latest release tag is read from where releases/latest
 * redirects to (/tag/X.Y), and compared with this app's X.Y. Returns null when it can't be read.
 * Electron's net.fetch leaves response.url empty after a redirect, so the redirect itself is read
 * with net.request.
 */
/** The latest release tag (X.Y), 'none' when the repo has no release yet, or null if unreachable. */
export type LatestRelease = string | 'none' | null

export function latestReleaseVersion(timeoutMs = 15_000): Promise<LatestRelease> {
  return new Promise((resolve) => {
    const request = net.request({ method: 'HEAD', url: LATEST_RELEASE_URL, redirect: 'manual' })
    const done = (version: LatestRelease) => {
      clearTimeout(timer)
      request.abort()
      resolve(version)
    }

    const timer = setTimeout(() => done(null), timeoutMs)
    request.on('redirect', (_status, _method, redirectUrl) => {
      // With no release, GitHub sends releases/latest to the releases list instead of a tag.
      done(
        /\/tag\/([0-9]+\.[0-9]+)/.exec(redirectUrl)?.[1] ??
          (/\/releases\/?$/.test(redirectUrl) ? 'none' : null),
      )
    })

    request.on('response', () => done(null))
    request.on('error', () => done(null))
    request.end()
  })
}

export function isNewer(latest: string, current: string): boolean {
  const a = majorMinor(latest)
  const b = majorMinor(current)
  if (!a || !b) {
    return false
  }

  return a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1]
}

/** Help → Check for Updates: tells the user, and offers the release page when one is newer. */
export async function checkForUpdates(): Promise<void> {
  const current = app.getVersion()
  const latest = await latestReleaseVersion()
  const win = BrowserWindow.getFocusedWindow() ?? shellWindows()[0]
  const show = (options: Electron.MessageBoxOptions) =>
    win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)
  if (!latest) {
    await show({ type: 'warning', message: 'Could not check for updates.', buttons: ['OK'] })

    return
  }

  if (latest === 'none') {
    await show({
      type: 'info',
      message: 'No XDeck release has been published yet.',
      buttons: ['OK'],
    })

    return
  }

  if (!isNewer(latest, current)) {
    await show({ type: 'info', message: `XDeck ${current} is up to date.`, buttons: ['OK'] })

    return
  }

  const { response } = await show({
    type: 'info',
    message: `XDeck ${latest} is available.`,
    detail: `You have ${current}.`,
    buttons: ['Open Release Page', 'Later'],
    defaultId: 0,
    cancelId: 1,
  })

  if (response === 0) {
    await shell.openExternal(LATEST_RELEASE_URL)
  }
}
