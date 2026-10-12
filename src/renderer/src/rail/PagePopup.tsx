import { useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { INSTAGRAM_ORIGIN, partitionForOrigin, X_ORIGIN } from '../../../shared/columns'
import { NETWORK_INFO, type Network } from '../../../shared/networks'
import {
  NO_SCROLLBAR_GUTTER_CSS,
  type WebviewElement,
  type WebviewNavigateEvent,
} from '../columns/guest-channels'

/** A page shown over the columns: Compose, X's settings, Log out (TASK-018), Instagram's settings. */
export type PopupPage = {
  /** The page's origin: X's when left out. */
  origin?: string
  /** Path on the origin, e.g. /compose/post. */
  path: string
  /** Read by screen readers (the dialog title is visually hidden: X's page has its own). */
  title: string
  /** The popup closes once the page leaves this path, e.g. when X has sent the post. */
  closeWhenLeaving?: string
  /** The X account's session (TASK-023); the origin's own session when left out. */
  partition?: string
}

/** X's settings and privacy, over the columns (the rail's More menu). */
export const X_SETTINGS: PopupPage = { path: '/settings', title: 'X Settings and Privacy' }

/** Instagram's account settings (roadmap §9), in Instagram's session. */
export const INSTAGRAM_SETTINGS: PopupPage = {
  origin: INSTAGRAM_ORIGIN,
  path: '/accounts/edit/',
  title: 'Instagram Settings',
}

/** Each network's settings page, for its accounts' rows in the More menu. */
export const SETTINGS_PAGES: Record<Network, PopupPage> = {
  x: X_SETTINGS,
  instagram: INSTAGRAM_SETTINGS,
  facebook: {
    origin: NETWORK_INFO.facebook.origin,
    path: '/settings/',
    title: 'Facebook Settings',
  },
}

type PagePopupProps = {
  page: PopupPage | null
  onClose: () => void
  /** Called with the page it went to, when the page left `closeWhenLeaving`. */
  onLeft?: (page: PopupPage) => void
}

export function PagePopup({ page, onClose, onLeft }: PagePopupProps) {
  // ─── Callbacks ───────────────────────────────────────────────────────
  // A callback ref, so the listener is on before the guest can navigate.
  const attachWebview = useCallback(
    (element: HTMLElement | null) => {
      if (!element || !page) {
        return
      }

      const leaving = page.closeWhenLeaving
      const onDomReady = () => {
        void (element as WebviewElement).insertCSS(NO_SCROLLBAR_GUTTER_CSS).catch(() => undefined)
      }

      const onNavigation = (event: Event) => {
        const url = (event as WebviewNavigateEvent).url
        let path = ''
        try {
          path = url ? new URL(url).pathname : ''
        } catch {
          return
        }

        if (leaving && path && !path.startsWith(leaving)) {
          onLeft?.(page)
          onClose()
        }
      }

      element.addEventListener('dom-ready', onDomReady)
      element.addEventListener('did-navigate', onNavigation)
      element.addEventListener('did-navigate-in-page', onNavigation)

      return () => {
        element.removeEventListener('dom-ready', onDomReady)
        element.removeEventListener('did-navigate', onNavigation)
        element.removeEventListener('did-navigate-in-page', onNavigation)
      }
    },
    [page, onClose, onLeft],
  )

  return (
    <Dialog open={page !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="page-popup"
        data-path={page?.path}
        // Narrower than 700 px, X shows Compose as a page of its own instead of over the timeline.
        // Compose has its own close button (and Drafts in the top right corner).
        showCloseButton={!page?.closeWhenLeaving}
        className="flex h-[min(720px,85vh)] w-[min(600px,92vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{page?.title}</DialogTitle>
        {page && (
          <webview
            ref={attachWebview}
            data-testid="page-popup-webview"
            src={`${page.origin ?? X_ORIGIN}${page.path}`}
            partition={page.partition ?? partitionForOrigin(page.origin ?? X_ORIGIN)}
            style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
