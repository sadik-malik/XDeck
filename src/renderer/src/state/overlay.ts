import { createStore } from '@tanstack/store'
import type { ColumnChoiceId } from '../../../shared/column-kinds'
import type { Network } from '../../../shared/networks'
import type { DeckDialogState } from '../rail/DeckDialogs'
import type { PostNetwork } from '../rail/NetworkPostPopup'
import type { PopupPage } from '../rail/PagePopup'

/** The networks XDeck has accounts on (src/shared/networks.ts). */
export type { Network }

/**
 * A login window (TASK-043): every account comes in the same way. `first` is the network's first
 * account (persist:x, persist:ig), `new` an added account's new session (its id from main), `again`
 * an added account whose session was logged out (TASK-049 for Instagram's).
 */
export type LoginTarget =
  | { network: Network; account: 'first' }
  | { network: Network; account: 'new'; id: string }
  | { network: Network; account: 'again'; id: string }

/** An account in the accounts menu: an added account has its session id; the first has none. */
export type AccountRef = { network: Network; username: string; label: string; id?: string }

/**
 * What is over the columns (TASK-040 step 2): one dialog or popup at a time, or nothing. XDeck's
 * shortcuts act only when nothing is.
 */
export type Overlay =
  /** The add-column picker, after a column (header menu) and on a choice (Search), if any. */
  | { kind: 'add-column'; after?: string; choice?: ColumnChoiceId }
  /** A column's filters (TASK-021), by key. */
  | { kind: 'filters'; columnKey: string }
  /** An X page over the columns: X's settings or Log out (TASK-018). */
  | { kind: 'popup'; page: PopupPage }
  /** Post (TASK-025), as the first X account (null) or an added one. */
  | { kind: 'compose'; account: string | null }
  /**
   * Post as an Instagram (TASK-044) or Facebook account: the network's create dialog in a window, in
   * the account's session.
   */
  | { kind: 'network-post'; network: PostNetwork; partition: string }
  /** The keyboard shortcuts (?, Help → Keyboard Shortcuts). */
  | { kind: 'help' }
  /** New deck, rename or delete (the rail's deck menu). */
  | { kind: 'deck'; dialog: NonNullable<DeckDialogState> }
  /** A login window: adding an account, or logging one in again (TASK-043). */
  | { kind: 'login'; target: LoginTarget }
  /** An account to remove, after confirming. */
  | { kind: 'remove-account'; account: AccountRef }
  /** Why an account login added nothing (TASK-029). */
  | { kind: 'notice'; text: string }
  /** Settings → User Agent… (TASK-039). */
  | { kind: 'user-agent' }

export type OverlayKind = Overlay['kind']

export const overlayStore = createStore(null as Overlay | null, ({ setState }) => ({
  /** Shows an overlay in place of any other. */
  open: (overlay: Overlay) => setState(() => overlay),
  /**
   * Closes the overlay if it is still of this kind. A dialog closing late (its animation, a login
   * that finished) must not close the overlay that replaced it, such as the account notice.
   */
  close: (kind: OverlayKind) => setState((current) => (current?.kind === kind ? null : current)),
}))

/** The overlay if it is of this kind, typed as that kind, else null. */
export function overlayOf<K extends OverlayKind>(
  overlay: Overlay | null,
  kind: K,
): Extract<Overlay, { kind: K }> | null {
  return overlay?.kind === kind ? (overlay as Extract<Overlay, { kind: K }>) : null
}
