import { join } from 'node:path'
import { session, shell, type WebContents, webContents } from 'electron'
import { CUSTOM_PARTITION, partitionForOrigin } from '../shared/columns'
import { unwrapLinkShim } from '../shared/facebook-user'
import { accountIdOfPartition, NETWORK_INFO, NETWORKS, networkOfOrigin } from '../shared/networks'
import { userAgentFor } from '../shared/user-agents'
import { isKnownAccountId, networkPartitions } from './accounts'
import { readSettings } from './settings'

/**
 * Origins of the custom columns in the settings.json this process loaded (http and https only).
 * Set once at startup by setCustomGuestOrigins. The renderer cannot add to it.
 */
let customGuestOrigins: string[] = []

export function setCustomGuestOrigins(origins: string[]): void {
  customGuestOrigins = [...origins]
}

/** Every network's https origins (X's, Instagram's: roadmap §9). */
const NETWORK_ORIGINS = NETWORKS.flatMap((network) =>
  NETWORK_INFO[network].hosts.map((host) => `https://${host}`),
)

/**
 * Origins a column webview may load: every network's, and the origins of the loaded config's custom
 * columns.
 */
export function allowedGuestOrigins(): string[] {
  return [...new Set([...NETWORK_ORIGINS, ...customGuestOrigins])]
}

/** True when a URL's origin is one a column may load or navigate to. */
export function isAllowedGuestUrl(target: string): boolean {
  try {
    return allowedGuestOrigins().includes(new URL(target).origin)
  } catch {
    return false
  }
}

/** Hands an https URL to the system browser. Other schemes are dropped (roadmap §2). */
export function openExternalIfHttps(target: string): void {
  try {
    const url = new URL(target)
    if (url.protocol === 'https:') {
      void shell.openExternal(url.href)
    }
  } catch {
    // Not a URL: nothing to open.
  }
}

/** Absolute path of the built column preload that every guest is forced to use. */
export function columnPreloadPath(): string {
  return join(__dirname, '../preload/column-preload.js')
}

/**
 * The user agent every column sends: the user's choice (TASK-039), Chrome on this computer by
 * default. Electron's own contains "Electron/", which X can block.
 */
export function columnUserAgent(): string {
  return userAgentFor(readSettings().userAgent, process.versions.chrome, process.platform)
}

const configured = new Set<string>()

/**
 * Gives a column session XDeck's user agent and no permissions, except full screen in X's and
 * Instagram's sessions. Once per session.
 */
function configureSession(partition: string): void {
  if (configured.has(partition)) {
    return
  }

  configured.add(partition)
  const columnSession = session.fromPartition(partition)
  columnSession.setUserAgent(columnUserAgent())
  // Columns get no permissions (no notifications, camera, etc.) until a task asks for one. Full
  // screen is the exception, for X's video full-screen button (TASK-033) and Instagram's videos,
  // and only in their sessions: a custom-column site going full screen could pass itself off as the
  // system (TASK-036).
  const allowFullScreen = partition !== CUSTOM_PARTITION
  const allowed = (permission: string) => allowFullScreen && permission === 'fullscreen'
  columnSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowed(permission))
  })

  columnSession.setPermissionCheckHandler((_webContents, permission) => allowed(permission))
}

/**
 * Gives every configured column session, and every open column page, the current user agent. A page
 * keeps the user agent it was made with, even across reloads, so each one is set too; the pages
 * then need a reload to send it.
 */
export function applyColumnUserAgent(): void {
  const userAgent = columnUserAgent()
  for (const partition of configured) {
    session.fromPartition(partition).setUserAgent(userAgent)
  }

  for (const contents of webContents.getAllWebContents()) {
    if (contents.getType() === 'webview') {
      contents.setUserAgent(userAgent)
    }
  }
}

/** Configures every network's sessions, first and added, and persist:custom. Call after 'ready'. */
export function configureColumnSessions(): void {
  for (const partition of [...NETWORKS.flatMap(networkPartitions), CUSTOM_PARTITION]) {
    configureSession(partition)
  }
}

/**
 * The session a guest gets. Not a network's page: persist:custom. A network's page: the added
 * account's session the renderer asked for, when main made that account (TASK-023, TASK-049);
 * otherwise the network's first session.
 */
function guestPartition(origin: string, requested: string | undefined): string {
  const partition = partitionForOrigin(origin)
  const network = networkOfOrigin(origin)
  if (!requested || !network) {
    return partition
  }

  const id = accountIdOfPartition(network, requested)

  return id && isKnownAccountId(network, id) ? requested : partition
}

/**
 * `will-attach-webview` on the shell window. Rejects any source outside the allowed origins, and
 * forces the security-relevant web preferences so the page or its attributes cannot upgrade them.
 * The partition comes from the source's origin; the renderer's attribute only picks among the X
 * account sessions main has made.
 */
export function guardWebviewAttach(
  event: Electron.Event,
  webPreferences: Electron.WebPreferences,
  params: Record<string, string>,
): void {
  const src = params.src
  if (!src || !isAllowedGuestUrl(src)) {
    event.preventDefault()

    return
  }

  webPreferences.preload = columnPreloadPath()
  const partition = guestPartition(new URL(src).origin, params.partition)
  configureSession(partition)
  webPreferences.partition = partition
  webPreferences.contextIsolation = true
  webPreferences.sandbox = true
  webPreferences.nodeIntegration = false
  webPreferences.nodeIntegrationInSubFrames = false
  webPreferences.nodeIntegrationInWorker = false
  webPreferences.webviewTag = false
  // Popups must reach setWindowOpenHandler, which denies every window and sends https links to the
  // browser. With popups disabled, Chromium blocks window.open before the handler runs.
  // disablePopups is a runtime preference that is missing from Electron 44's typings.
  Object.assign(webPreferences, { disablePopups: false })
  webPreferences.webSecurity = true
  webPreferences.allowRunningInsecureContent = false
  delete params.preloadURL
  delete params.preload
}

/** How long after a click or key press a page may still send a link to the browser, ms. */
const USER_ACTION_MS = 5_000

/** Input that counts as the user acting on a page (not pointer moves, scrolling or hovering). */
const USER_ACTIONS = new Set([
  'mouseDown',
  'mouseUp',
  'keyDown',
  'rawKeyDown',
  'char',
  'gestureTap',
])

/**
 * Guest-side policy, applied to each webview's own webContents. Guests can't open windows. Any
 * navigation or redirect off the allowed origins is cancelled, and its https URL goes to the
 * browser only right after the user clicked or typed in that page (security audit, TASK-036): a
 * page must not open browser tabs by itself.
 */
export function hardenGuestContents(contents: WebContents): void {
  let lastUserAction = 0
  contents.on('input-event', (_event, input) => {
    if (USER_ACTIONS.has(input.type)) {
      lastUserAction = Date.now()
    }
  })

  // A link through Facebook's link shim goes to the browser as the page it leads to (roadmap §11).
  const toBrowser = (url: string): void => {
    if (Date.now() - lastUserAction <= USER_ACTION_MS) {
      openExternalIfHttps(unwrapLinkShim(url))
    }
  }

  contents.setWindowOpenHandler(({ url }) => {
    // Off-origin https goes to the browser. Everything else is denied silently.
    if (!isAllowedGuestUrl(url)) {
      toBrowser(url)
    }

    return { action: 'deny' }
  })

  const guard = (details: Electron.Event, url: string): void => {
    if (!isAllowedGuestUrl(url)) {
      details.preventDefault()
      toBrowser(url)
    }
  }

  contents.on('will-navigate', guard)
  contents.on('will-redirect', guard)
}

/**
 * Writes every X session's cookie store to disk now. Chromium otherwise writes it on a timer (about
 * 30 s), so the login cookies are flushed on login success and on quit (TASK-007).
 */
export async function flushXCookies(): Promise<void> {
  await Promise.all(
    networkPartitions('x').map((partition) =>
      session.fromPartition(partition).cookies.flushStore(),
    ),
  )
}
