import { useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { ColumnSetup } from '../../../shared/column-scripts'
import { NETWORK_INFO } from '../../../shared/networks'
import {
  COLUMN_SETUP,
  POST_CLOSED,
  PRELOAD_READY,
  type WebviewElement,
  type WebviewIpcEvent,
} from '../columns/guest-channels'

/** The networks whose own create dialog XDeck opens for Post (X has its own editor popup). */
export type PostNetwork = 'instagram' | 'facebook'

/** The window's page: the network's feed, hidden, with its create-post button clicked. */
const POST_SETUP: Record<PostNetwork, ColumnSetup> = {
  instagram: { scripts: ['hideInstagramBars', 'openInstagramNewPost'] },
  facebook: { scripts: ['hideFacebookBars', 'openFacebookNewPost'] },
}

/**
 * Post as Instagram (TASK-044) or Facebook (roadmap §11): the network's own create dialog, in the
 * account's session. Neither has a URL for it, so the page opens the feed and clicks its create-post
 * button; the window closes with the dialog (posted, or closed).
 */
export function NetworkPostPopup({
  post,
  onClose,
}: {
  /** The posting account's network and session, or null when closed. */
  post: { network: PostNetwork; partition: string } | null
  onClose: () => void
}) {
  // ─── Compute ─────────────────────────────────────────────────────────
  const open = post !== null
  const network = post?.network

  // ─── Callbacks ───────────────────────────────────────────────────────
  const attachWebview = useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        return
      }

      const webview = element as WebviewElement
      const onMessage = (event: Event) => {
        const message = event as WebviewIpcEvent
        if (message.channel === PRELOAD_READY && network) {
          webview.send(COLUMN_SETUP, POST_SETUP[network])
        } else if (message.channel === POST_CLOSED) {
          onClose()
        }
      }

      element.addEventListener('ipc-message', onMessage)

      return () => element.removeEventListener('ipc-message', onMessage)
    },
    [network, onClose],
  )

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid={`${network}-post`}
        // The network's dialog has its own close button, which closes the window too.
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).querySelector<HTMLElement>('webview')?.focus()
        }}
        className="flex h-[min(760px,88vh)] w-[min(560px,92vw)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">
          New {network ? NETWORK_INFO[network].name : ''} post
        </DialogTitle>
        {post && (
          <webview
            key={post.partition}
            ref={attachWebview}
            data-testid={`${post.network}-post-webview`}
            src={`${NETWORK_INFO[post.network].origin}/`}
            partition={post.partition}
            style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
