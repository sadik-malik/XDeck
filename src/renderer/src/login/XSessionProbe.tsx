import { Loader2 } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import type { ColumnSetup } from '../../../shared/column-scripts'
import { X_ORIGIN, X_PARTITION } from '../../../shared/columns'
import {
  COLUMN_SETUP,
  PRELOAD_READY,
  USER_NAME,
  type WebviewElement,
  type WebviewIpcEvent,
} from '../columns/guest-channels'
import { unnamedXSessionFound, unnamedXSessionGaveUp } from '../state/data'

/** What the probe's preload runs: only the user name search (as the login window does). */
const PROBE_SETUP: ColumnSetup = { scripts: ['findUserName'] }

/** How long the probe waits for X before it gives up, ms. */
const PROBE_TIMEOUT = 15_000

/**
 * A profile from the login-screen days has an X login in persist:x but no user name kept (TASK-043).
 * This finds it once: X's home page loads out of sight and the preload reports who is logged in.
 * The columns show as soon as it answers, or after PROBE_TIMEOUT without the account.
 */
export function XSessionProbe() {
  // ─── Callbacks ───────────────────────────────────────────────────────
  const attachWebview = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return
    }

    const webview = element as WebviewElement
    const onMessage = (event: Event) => {
      const message = event as WebviewIpcEvent
      if (message.channel === PRELOAD_READY) {
        webview.send(COLUMN_SETUP, PROBE_SETUP)
      } else if (message.channel === USER_NAME) {
        unnamedXSessionFound(message.args?.[0])
      }
    }

    element.addEventListener('ipc-message', onMessage)

    return () => element.removeEventListener('ipc-message', onMessage)
  }, [])

  // ─── Effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(unnamedXSessionGaveUp, PROBE_TIMEOUT)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      data-testid="x-session-probe"
      className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-app-text"
    >
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <p>Finding your X account…</p>
      {/* Laid out but out of sight: a page with no size may never render X's navigation. */}
      <webview
        ref={attachWebview}
        src={`${X_ORIGIN}/home`}
        partition={X_PARTITION}
        aria-hidden
        style={{ position: 'fixed', left: -10_000, top: 0, width: 1_000, height: 800 }}
      />
    </div>
  )
}
