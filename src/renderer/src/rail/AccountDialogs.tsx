import { UserPlus } from 'lucide-react'
import { useCallback, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ColumnSetup } from '../../../shared/column-scripts'
import { INSTAGRAM_ORIGIN, X_ORIGIN } from '../../../shared/columns'
import { accountSession, NETWORK_INFO, type Network } from '../../../shared/networks'
import { ACCOUNT_AVATAR, AVATAR_PREFIX, PROFILE_LINK } from '../../../shared/x-user'
import {
  ACCOUNT_LABEL,
  COLUMN_SETUP,
  INSTAGRAM_USER_NAME,
  LOGIN_FILL_CSS,
  NO_SCROLLBAR_GUTTER_CSS,
  PRELOAD_READY,
  USER_NAME,
  type WebviewElement,
  type WebviewIpcEvent,
} from '../columns/guest-channels'
import { NETWORK_ICONS } from '../network-icons'
import { accountLabelFound } from '../state/data'
import type { AccountRef, LoginTarget } from '../state/overlay'

/**
 * The logged-in user's profile path, as the preload's findUserName finds it: the profile link's
 * href, or "/name" from the avatar in X's account button (X shows no profile link at the window's
 * width, TASK-029).
 */
const PROFILE_HREF = `(() => {
  const link = document.querySelector(${JSON.stringify(PROFILE_LINK)})
  if (link) return link.getAttribute('href')
  const avatar = document.querySelector(${JSON.stringify(ACCOUNT_AVATAR)})
  const testId = avatar?.getAttribute('data-testid') ?? ''
  return testId ? '/' + testId.slice(${AVATAR_PREFIX.length}) : null
})()`

type LoginConfig = {
  url: string
  setup: ColumnSetup
  /** The preload's message with the user name, or null when main reads it (Facebook). */
  channel: string | null
  title: string
  hint: string
  width: string
}

/** How each network's login window works: its page, what the preload runs, what it reports. */
const LOGIN = {
  x: {
    url: `${X_ORIGIN}/login`,
    setup: { scripts: ['findUserName'] } as ColumnSetup,
    channel: USER_NAME,
    title: 'Log in to X',
    // Google and Apple sign-in open their own window, which XDeck sends to the browser, so the
    // login would finish there and never reach this session.
    hint: 'Use the user name, email or phone and password. Google and Apple sign-in don’t work here.',
    width: 'w-[min(600px,92vw)]',
  },
  instagram: {
    url: `${INSTAGRAM_ORIGIN}/accounts/login/`,
    setup: { scripts: ['findInstagramUserName'] } as ColumnSetup,
    channel: INSTAGRAM_USER_NAME,
    title: 'Log in to Instagram',
    // Facebook login opens its own window, which XDeck sends to the browser.
    hint: 'Use the user name, email or phone and password. Log in with Facebook doesn’t work here.',
    width: 'w-[min(440px,92vw)]',
  },
  // Facebook's page is not read: main reads who logged in from the session's cookie (roadmap §11).
  facebook: {
    url: `${NETWORK_INFO.facebook.origin}/login/`,
    setup: { scripts: ['findFacebookName'] } as ColumnSetup,
    channel: null,
    title: 'Log in to Facebook',
    // Facebook's security checks (a code, "was this you?") happen in this window too.
    hint: 'Use the email or phone and password. Facebook may ask you to confirm it’s you.',
    width: 'w-[min(600px,92vw)]',
  },
} as const satisfies Record<Network, LoginConfig>

/** The session a login window logs in to: the network's first account's, or an added one's. */
function loginPartition(target: LoginTarget): string {
  return accountSession(target.network, target.account === 'first' ? null : target.id)
}

/**
 * The login window (TASK-043): every account, on X or Instagram, first or added, comes in here, and
 * so does an account whose session was logged out. Once the network shows who is logged in, the
 * preload reports the user name and the window closes. Already logged in, the network goes straight
 * on and the account is found at once.
 */
export function LoginWindow({
  target,
  onUserName,
  onCancel,
}: {
  target: LoginTarget | null
  onUserName: (target: LoginTarget, username: unknown) => void
  onCancel: (target: LoginTarget) => void
}) {
  // ─── Compute ─────────────────────────────────────────────────────────
  const network = target ? LOGIN[target.network] : null
  const Icon = target ? NETWORK_ICONS[target.network] : UserPlus

  // ─── Callbacks ───────────────────────────────────────────────────────
  const attachWebview = useCallback(
    (element: HTMLElement | null) => {
      if (!element || !target) {
        return
      }

      const config = LOGIN[target.network]
      const webview = element as WebviewElement
      let done = false
      const found = (name: unknown) => {
        if (!done) {
          done = true
          onUserName(target, name)
        }
      }

      const onMessage = (event: Event) => {
        const message = event as WebviewIpcEvent
        if (message.channel === PRELOAD_READY) {
          webview.send(COLUMN_SETUP, config.setup)
        } else if (config.channel !== null && message.channel === config.channel) {
          found(message.args?.[0])
        } else if (message.channel === ACCOUNT_LABEL && target.network === 'facebook') {
          labelSeen = true
          accountLabelFound('facebook', message.args?.[0], message.args?.[1])
          if (loggedInAs) {
            found(loggedInAs)
          }
        }
      }

      const onDomReady = () => {
        void webview.insertCSS(NO_SCROLLBAR_GUTTER_CSS).catch(() => undefined)
        if (target.network === 'x') {
          void webview.insertCSS(LOGIN_FILL_CSS).catch(() => undefined)
        }
      }
      // X only, a second way to find the name: after each navigation, read the profile link straight
      // from the page, a few times while X renders. It covers any hand-over from X's login app that
      // the preload's observer misses.
      const timers: ReturnType<typeof setTimeout>[] = []
      const readProfileLink = () => {
        if (done) {
          return
        }

        void webview
          .executeJavaScript(PROFILE_HREF)
          .then((href: unknown) => {
            const name =
              typeof href === 'string' ? /^\/([A-Za-z0-9_]{1,15})$/.exec(href)?.[1] : undefined
            if (name) {
              found(name)
            }
          })
          .catch(() => undefined)
      }

      const onNavigation = () => {
        if (target.network !== 'x') {
          return
        }

        for (const delay of [500, 2_000, 5_000]) {
          timers.push(setTimeout(readProfileLink, delay))
        }
      }

      // Facebook: ask main who is logged in to the window's session, until someone is. The window
      // then waits a few seconds for Facebook's page to show the account's name, its label.
      const partition = loginPartition(target)
      let labelSeen = false
      let loggedInAs: string | null = null
      const poll =
        target.network === 'facebook'
          ? setInterval(() => {
              if (!done && !loggedInAs) {
                window.xdeck
                  .facebookSessionUser(partition)
                  .then((id) => {
                    if (!id || loggedInAs) {
                      return
                    }

                    loggedInAs = id
                    if (labelSeen) {
                      found(id)
                    } else {
                      timers.push(setTimeout(() => found(id), 5_000))
                    }
                  })
                  .catch(() => undefined)
              }
            }, 1_000)
          : undefined

      element.addEventListener('ipc-message', onMessage)
      element.addEventListener('dom-ready', onDomReady)
      element.addEventListener('did-navigate', onNavigation)
      element.addEventListener('did-navigate-in-page', onNavigation)

      return () => {
        element.removeEventListener('ipc-message', onMessage)
        element.removeEventListener('dom-ready', onDomReady)
        element.removeEventListener('did-navigate', onNavigation)
        element.removeEventListener('did-navigate-in-page', onNavigation)
        for (const timer of timers) {
          clearTimeout(timer)
        }

        clearInterval(poll)
      }
    },
    [target, onUserName],
  )

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && target && onCancel(target)}>
      <DialogContent
        data-testid="login-window"
        data-network={target?.network}
        // The page gets the keyboard, not the close button (its focus ring would show at once).
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).querySelector<HTMLElement>('webview')?.focus()
        }}
        className={cn(
          'flex h-[min(680px,85vh)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-none',
          network?.width ?? 'w-[min(600px,92vw)]',
        )}
      >
        <div className="flex items-center gap-3 border-b px-5 py-3 pr-12">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <DialogTitle className="text-sm leading-5">{network?.title}</DialogTitle>
            <DialogDescription data-testid="login-window-hint" className="text-xs leading-4">
              {network?.hint}
            </DialogDescription>
          </div>
        </div>
        {target && network && (
          <webview
            // A new target is a new page in its own session.
            key={loginPartition(target)}
            ref={attachWebview}
            data-testid="login-window-webview"
            src={network.url}
            partition={loginPartition(target)}
            style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Remove @name: confirms, then the main process drops the account and its session's data. */
export function RemoveAccount({
  account,
  onClose,
  onRemove,
}: {
  account: AccountRef | null
  onClose: () => void
  onRemove: () => Promise<void>
}) {
  // ─── State ───────────────────────────────────────────────────────────
  const [removing, setRemoving] = useState(false)

  return (
    <AlertDialog open={account !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-testid="account-remove-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {account?.label} from XDeck?</AlertDialogTitle>
          <AlertDialogDescription>
            XDeck logs this account out and forgets it. Its columns stay in your decks and offer to
            log in until you add the account again. Your{' '}
            {account ? NETWORK_INFO[account.network].name : ''} account itself is not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="account-remove-confirm"
            disabled={removing}
            onClick={(event) => {
              event.preventDefault()
              if (!account) {
                return
              }
              setRemoving(true)
              void onRemove().finally(() => {
                setRemoving(false)
                onClose()
              })
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Why an X account login added nothing: the account is already in XDeck (TASK-029). */
export function AccountNotice({
  message,
  onClose,
}: {
  message: string | null
  onClose: () => void
}) {
  return (
    <AlertDialog open={message !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-testid="account-notice">
        <AlertDialogHeader>
          <AlertDialogTitle>No account added</AlertDialogTitle>
          <AlertDialogDescription>
            {message} To add another account, log in to that account in the login window.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
