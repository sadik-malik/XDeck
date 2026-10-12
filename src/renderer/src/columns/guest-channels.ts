// Channels between the renderer and a <webview> guest's preload (src/column-preload).

/** Guest to renderer: the preload has run. The renderer answers with a setup. */
export const PRELOAD_READY = 'xdeck:preload-ready'
/** Renderer to guest: the scripts for this page load (sent on every preload-ready). */
export const COLUMN_SETUP = 'xdeck:column-setup'
/** Renderer to guest: scroll the page back to the top (a click on the column header). */
export const SCROLL_TOP = 'xdeck:scroll-top'
/** Guest to renderer: an XDeck keyboard shortcut was pressed in the page (TASK-020). Not validated. */
export const SHORTCUT = 'xdeck:shortcut'
/** Guest to renderer: Escape was pressed in the page (passed on to the page too). */
export const ESCAPE = 'xdeck:escape'
/** Guest to renderer: the pointer came into the page, so the shell's hover state (tooltips) ends. */
export const POINTER_ENTER = 'xdeck:pointer-enter'
/**
 * Window event the renderer dispatches on POINTER_ENTER: the pointer is in a column page, away from
 * the shell. The shell gets no pointerleave when the pointer moves into a <webview>.
 */
export const POINTER_IN_PAGE = 'xdeck:pointer-in-page'
/** Guest to renderer: the user name found on the login page (TASK-007). Not validated here. */
export const USER_NAME = 'xdeck:user-name'
/** Guest to renderer: the logged-in Instagram user name (roadmap §9). Not validated here. */
export const INSTAGRAM_USER_NAME = 'xdeck:instagram-user-name'
/** Guest to renderer: an Instagram page's background colour, #rrggbb (TASK-047). Not validated. */
export const THEME_COLOR = 'xdeck:theme-color'
/** Guest to renderer: Instagram's create dialog opened and closed again (TASK-044). */
export const POST_CLOSED = 'xdeck:post-closed'
/** Guest to renderer: the page shows a login form (Instagram, TASK-043). */
export const LOGGED_OUT = 'xdeck:logged-out'
/** Guest → embedder: the logged-in Facebook account's id and its name, from the page's data. */
export const ACCOUNT_LABEL = 'xdeck:account-label'

/**
 * For X pages shown on their own (login, Compose, X settings): X sets `scrollbar-gutter: stable` on
 * <html> and locks the body's scrolling under its modals, which leaves an empty 15 px gutter down the
 * right edge. None of those pages needs it. Inserted on every dom-ready (it lasts one document).
 */
export const NO_SCROLLBAR_GUTTER_CSS = 'html { scrollbar-gutter: auto !important; }'

/** The ipc-message event of a <webview>. Electron adds `channel` and `args` to the DOM event. */
export type WebviewIpcEvent = Event & { channel?: string; args?: unknown[] }

/** The did-change-theme-color event of a <webview>: X's <meta name="theme-color">. */
export type WebviewThemeColorEvent = Event & { themeColor?: string | null }

/** The part of Electron's <webview> element the renderer uses. */
export type WebviewElement = HTMLElement & {
  send(channel: string, ...args: unknown[]): void
  setZoomFactor(factor: number): void
  insertCSS(css: string): Promise<string>
  reload(): void
  getTitle(): string
  executeJavaScript(code: string): Promise<unknown>
  loadURL(url: string): Promise<void>
}

/** The page-title-updated event of a <webview>. */
export type WebviewTitleEvent = Event & { title?: string }

/** did-navigate and did-navigate-in-page events of a <webview>. */
export type WebviewNavigateEvent = Event & { url?: string }

/**
 * For X's login in the Add X Account dialog (TASK-027): X shows it as a card of its own on a dimmed,
 * blurred backdrop, which inside XDeck's dialog is a card in a card. The backdrop goes and the card
 * fills the page. Both the current login (xds-modal) and the older one (mask) are covered.
 */
export const LOGIN_FILL_CSS = `
.bg-overlay-normal[role="presentation"], [data-testid="mask"] {
  background: transparent !important;
  backdrop-filter: none !important;
}
[role="dialog"][class*="xds-modal"] {
  inset: 0 !important;
  margin: 0 !important;
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  overflow-y: auto !important;
}`
