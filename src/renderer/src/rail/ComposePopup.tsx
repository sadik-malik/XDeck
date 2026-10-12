import { useCallback, useEffect, useRef, useState } from 'react'
import { X_ORIGIN } from '../../../shared/columns'
import {
  ESCAPE,
  NO_SCROLLBAR_GUTTER_CSS,
  type WebviewElement,
  type WebviewIpcEvent,
  type WebviewNavigateEvent,
} from '../columns/guest-channels'

const COMPOSE_URL = `${X_ORIGIN}/compose/post`
const WIDTH = 600
const MIN_HEIGHT = 240
/** Room under X's toolbar, CSS px. */
const BOTTOM_PADDING = 12
/** How often the editor's height is read while the popup is open, ms. */
const MEASURE_MS = 250

/**
 * The bottom of X's editor toolbar: everything the editor shows (text, media, poll, reply setting)
 * is above it. 0 until the editor has rendered.
 */
const MEASURE = `(() => {
  const bar = document.querySelector('[data-testid="toolBar"]')
  return bar ? Math.ceil(bar.getBoundingClientRect().bottom + window.scrollY) : 0
})()`

/** No scrollbar down the editor's right edge: the popup is as tall as the editor already. */
const NO_SCROLLBAR_CSS = 'html { scrollbar-width: none !important; }'

const FOCUS_EDITOR = `document.querySelector('[data-testid="tweetTextarea_0"]')?.focus(); true`

type ComposePopupProps = {
  /** The posting account's session (persist:x, or an added account's). */
  partition: string
  open: boolean
  /** Load X's editor before the popup opens, so Post opens at once (the main account). */
  keepLoaded: boolean
  onClose: () => void
}

/**
 * Post (TASK-025): X's own editor over the columns, as tall as what it shows. The editor stays
 * loaded between posts, so it opens at once and a closed draft is still there next time. Once X has
 * sent a post it leaves /compose; the popup closes and loads a fresh editor for the next one.
 */
export function ComposePopup({ partition, open, keepLoaded, onClose }: ComposePopupProps) {
  // ─── State ───────────────────────────────────────────────────────────
  const [height, setHeight] = useState(320)
  const webviewRef = useRef<WebviewElement | null>(null)
  const readyRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // ─── Compute ─────────────────────────────────────────────────────────
  const mounted = open || keepLoaded

  // ─── Callbacks ───────────────────────────────────────────────────────
  const attachWebview = useCallback((element: HTMLElement | null) => {
    if (!element) {
      webviewRef.current = null
      readyRef.current = false

      return
    }

    const webview = element as WebviewElement
    webviewRef.current = webview
    const onDomReady = () => {
      readyRef.current = true
      void webview.insertCSS(NO_SCROLLBAR_GUTTER_CSS).catch(() => undefined)
      void webview.insertCSS(NO_SCROLLBAR_CSS).catch(() => undefined)
    }
    // Sent (or abandoned with X's own back button): X leaves /compose. Ready the next editor.
    const onNavigation = (event: Event) => {
      const url = (event as WebviewNavigateEvent).url ?? ''
      let path = ''
      try {
        path = new URL(url).pathname
      } catch {
        return
      }

      if (!path.startsWith('/compose')) {
        onCloseRef.current()
        void webview.loadURL(COMPOSE_URL).catch(() => undefined)
      }
    }

    const onMessage = (event: Event) => {
      if ((event as WebviewIpcEvent).channel === ESCAPE) {
        onCloseRef.current()
      }
    }

    element.addEventListener('ipc-message', onMessage)
    element.addEventListener('dom-ready', onDomReady)
    element.addEventListener('did-navigate', onNavigation)
    element.addEventListener('did-navigate-in-page', onNavigation)

    return () => {
      element.removeEventListener('ipc-message', onMessage)
      element.removeEventListener('dom-ready', onDomReady)
      element.removeEventListener('did-navigate', onNavigation)
      element.removeEventListener('did-navigate-in-page', onNavigation)
    }
  }, [])

  // ─── Effects ─────────────────────────────────────────────────────────
  // While open: the popup follows the editor's height, and the editor has the keyboard.
  useEffect(() => {
    if (!open) {
      return
    }

    let active = true
    const measure = () => {
      const webview = webviewRef.current
      if (!webview || !readyRef.current) {
        return
      }

      webview
        .executeJavaScript(MEASURE)
        .then((value) => {
          if (active && typeof value === 'number' && value > 0) {
            setHeight(Math.max(MIN_HEIGHT, value + BOTTOM_PADDING))
          }
        })
        .catch(() => undefined)
    }

    measure()
    const timer = setInterval(measure, MEASURE_MS)
    // Escape with the focus outside X's page (the page itself reports its own Escape).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    const focus = setTimeout(() => {
      webviewRef.current?.focus()
      void webviewRef.current?.executeJavaScript(FOCUS_EDITOR).catch(() => undefined)
    }, 50)

    return () => {
      active = false
      window.removeEventListener('keydown', onKeyDown)
      clearInterval(timer)
      clearTimeout(focus)
    }
  }, [open])

  if (!mounted) {
    return null
  }

  return (
    // Hidden, not removed, while closed: the loaded editor is kept for the next post.
    <div
      data-testid="compose-popup"
      data-open={open ? 'true' : undefined}
      aria-hidden={!open}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 transition-opacity duration-150"
      style={{ visibility: open ? 'visible' : 'hidden', opacity: open ? 1 : 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Post"
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-app-bg shadow-2xl transition-[height] duration-150"
        style={{ maxWidth: WIDTH, height }}
      >
        <webview
          ref={attachWebview}
          data-testid="compose-webview"
          src={COMPOSE_URL}
          partition={partition}
          style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}
        />
      </div>
    </div>
  )
}
