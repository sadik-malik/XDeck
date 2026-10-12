import { useSortable } from '@dnd-kit/sortable'
import { useSelector } from '@tanstack/react-store'
import { ArrowUpToLine, Columns2, Ellipsis, ListFilter, RotateCw, Trash2 } from 'lucide-react'
import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type ColumnFilters, hasFilters } from '../../../shared/column-filters'
import { type ColumnKind, cleanPageTitle, unreadCount } from '../../../shared/column-kinds'
import type { ColumnScript, ColumnSetup } from '../../../shared/column-scripts'
import type { ColumnTarget } from '../../../shared/columns'
import { NETWORK_INFO, type Network, networkOfPartition } from '../../../shared/networks'
import { isXLoggedOutPath } from '../../../shared/x-user'
import { runShortcut } from '../shortcuts'
import { accountLabelFound, dataStore, firstAccountFound } from '../state/data'
import { ColumnIcon } from './ColumnIcon'
import {
  ACCOUNT_LABEL,
  COLUMN_SETUP,
  INSTAGRAM_USER_NAME,
  LOGGED_OUT,
  POINTER_ENTER,
  POINTER_IN_PAGE,
  PRELOAD_READY,
  SCROLL_TOP,
  SHORTCUT,
  THEME_COLOR,
  type WebviewElement,
  type WebviewIpcEvent,
  type WebviewNavigateEvent,
  type WebviewThemeColorEvent,
  type WebviewTitleEvent,
} from './guest-channels'

export type ColumnProps = {
  /** Container id, col-N for the Nth column of settings.json. */
  id: string
  /** Stable key for the saved layout and for drag and drop (shared/column-layout.ts). */
  columnKey: string
  /** Header title (shared/column-kinds.ts): For you, Search: …, @user, the custom URL's host... */
  title: string
  /** Header icon. */
  kind: ColumnKind
  /** Show the page's own title once it has one (lists and communities, whose names only X knows). */
  usePageTitle: boolean
  target: ColumnTarget
  /** Width in CSS px. */
  width: number
  /** Position on screen. The DOM order never changes, so a <webview> is never moved or reloaded. */
  order: number
  /** X scripts for this column (shared/column-scripts.ts). */
  scripts: ColumnScript[]
  /** Page zoom (Swift pageZoom), applied to the page as its zoom factor. */
  zoom: number
  /** The column is collapsed while another one shows a photo or video full width (TASK-009). */
  collapsed: boolean
  /** Every navigation of the page, in-page ones included (X is a single-page app). */
  onNavigate: (columnKey: string, url: string) => void
  /** Set on X columns: X's unread notification count from the page title (TASK-019). */
  onUnread?: (count: number) => void
  /** The column's X account, shown in the header once there is more than one (TASK-023). */
  accountLabel?: string
  /** Set on the leftmost X column only: X's theme colour, raw from the page (TASK-008). */
  onThemeColor?: (color: unknown) => void
  /** Starts a resize drag from this column's right-edge handle. */
  onResizeStart: (columnKey: string, width: number, event: PointerEvent<HTMLDivElement>) => void
  /** Header menu → Add Column to the Right. */
  onAddAfter: (columnKey: string) => void
  /** Header menu → Filters… Set on X and Instagram page columns (TASK-021, TASK-046). */
  onEditFilters?: (columnKey: string) => void
  /** The column's filters, sent to the page with its setup. */
  filters?: ColumnFilters
  /** Header menu → Remove Column. */
  onRemove: (columnKey: string) => void
  /**
   * X and Instagram columns: how to log in when the page (or the placeholder) shows its account is
   * not logged in (TASK-043). `label` is the placeholder's button.
   */
  login?: { network: Network; label: string; onLogIn: () => void }
}

/** The networks' names, for the logged-out note. */

/**
 * One column: a slim TweetDeck-style header over a <webview> page, or over a placeholder with the
 * reason it is not shown. The header shows the column's icon and title; a click on it scrolls the
 * page to the top, a drag reorders the column, and its menu reloads, adds or removes columns. This is the only component that owns a <webview>, so the column
 * implementation can be swapped later without touching the strip (roadmap §2, §7).
 */
export function Column({
  id,
  columnKey,
  title,
  kind,
  usePageTitle,
  target,
  width,
  order,
  scripts,
  zoom,
  collapsed,
  onNavigate,
  onThemeColor,
  onUnread,
  accountLabel,
  onResizeStart,
  onAddAfter,
  onEditFilters,
  filters,
  onRemove,
  login,
}: ColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnKey })

  // ─── State ───────────────────────────────────────────────────────────
  const [preloadReady, setPreloadReady] = useState(false)
  // The page shows its network's login form (TASK-043): the column offers XDeck's login window.
  const [loggedOut, setLoggedOut] = useState(false)
  // Bumped each time an account logs in to this page's session: the page loads again, logged in.
  const sessionLogins = useSelector(dataStore, (data) =>
    target.kind === 'page' ? (data.sessionLogins[target.partition] ?? 0) : 0,
  )
  const seenLogins = useRef(sessionLogins)
  // The page's own title, for columns whose name only X knows (a list's name).
  const [pageTitle, setPageTitle] = useState('')
  const webviewRef = useRef<WebviewElement | null>(null)
  // The latest setup, read by the ipc listener: a setup goes out with each page load.
  const setupRef = useRef<ColumnSetup>({ scripts, filters })
  const readyRef = useRef(false)
  // The latest theme callback, read by the listener the callback ref attached.
  const themeColorRef = useRef(onThemeColor)
  themeColorRef.current = onThemeColor
  const unreadRef = useRef(onUnread)
  unreadRef.current = onUnread
  const navigateRef = useRef(onNavigate)
  navigateRef.current = onNavigate
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  // The network whose session the page is in, and whether it is the network's first account's: only
  // that one's page reports its user name (roadmap §9); any account's page reports its colour
  // (TASK-047, TASK-049).
  const pageNetwork = target.kind === 'page' ? networkOfPartition(target.partition) : null
  const pageNetworkRef = useRef(pageNetwork)
  pageNetworkRef.current = pageNetwork
  const firstSessionRef = useRef(false)
  firstSessionRef.current =
    pageNetwork !== null &&
    target.kind === 'page' &&
    target.partition === NETWORK_INFO[pageNetwork].partition
  const loginNetworkRef = useRef(login?.network)
  loginNetworkRef.current = login?.network

  // ─── Compute ─────────────────────────────────────────────────────────
  const scriptsKey = scripts.join(',')
  // A column's scripts and filters, as keys: a setup goes out when either changes.
  const filtersKey = JSON.stringify(filters ?? null)
  const shownTitle = usePageTitle && pageTitle ? pageTitle : title
  const isPage = target.kind === 'page'

  // ─── Callbacks ───────────────────────────────────────────────────────
  // A callback ref attaches the listener as soon as the element mounts, before the guest can
  // send its first message.
  const attachWebview = useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        webviewRef.current = null

        return
      }

      const webview = element as WebviewElement
      webviewRef.current = webview
      const onMessage = (event: Event) => {
        const message = event as WebviewIpcEvent
        if (message.channel === POINTER_ENTER) {
          window.dispatchEvent(new Event(POINTER_IN_PAGE))

          return
        }

        if (message.channel === SHORTCUT && typeof message.args?.[0] === 'string') {
          runShortcut(message.args[0])

          return
        }

        if (
          message.channel === INSTAGRAM_USER_NAME &&
          pageNetworkRef.current === 'instagram' &&
          firstSessionRef.current
        ) {
          firstAccountFound('instagram', message.args?.[0])
          setLoggedOut(false)

          return
        }

        // A Facebook page showed its account's name (roadmap §11).
        if (message.channel === ACCOUNT_LABEL && pageNetworkRef.current === 'facebook') {
          accountLabelFound('facebook', message.args?.[0], message.args?.[1])

          return
        }

        // Networks other than X report their colour from the preload: Electron sends no theme colour
        // event for them.
        if (
          message.channel === THEME_COLOR &&
          pageNetworkRef.current !== null &&
          pageNetworkRef.current !== 'x'
        ) {
          themeColorRef.current?.(message.args?.[0])

          return
        }

        // X's logged-out pages are known by their paths; other networks' preloads report them.
        if (
          message.channel === LOGGED_OUT &&
          loginNetworkRef.current !== undefined &&
          loginNetworkRef.current !== 'x'
        ) {
          setLoggedOut(true)

          return
        }

        if (message.channel === PRELOAD_READY) {
          readyRef.current = true
          setPreloadReady(true)
          webview.setZoomFactor(zoomRef.current)
          webview.send(COLUMN_SETUP, setupRef.current)
        }
      }

      const onThemeColorChange = (event: Event) => {
        themeColorRef.current?.((event as WebviewThemeColorEvent).themeColor)
      }

      const onNavigation = (event: Event) => {
        const url = (event as WebviewNavigateEvent).url
        if (typeof url !== 'string') {
          return
        }

        navigateRef.current(columnKey, url)
        // X sends a logged-out session to its login pages (TASK-043).
        if (loginNetworkRef.current === 'x') {
          try {
            setLoggedOut(isXLoggedOutPath(new URL(url).pathname))
          } catch {
            // Not a URL: nothing to tell.
          }
        }
      }

      const onTitle = (event: Event) => {
        const raw = (event as WebviewTitleEvent).title ?? ''
        setPageTitle(cleanPageTitle(raw))
        unreadRef.current?.(unreadCount(raw))
      }

      element.addEventListener('ipc-message', onMessage)
      element.addEventListener('did-change-theme-color', onThemeColorChange)
      element.addEventListener('did-navigate', onNavigation)
      element.addEventListener('did-navigate-in-page', onNavigation)
      element.addEventListener('page-title-updated', onTitle)

      return () => {
        element.removeEventListener('ipc-message', onMessage)
        element.removeEventListener('did-change-theme-color', onThemeColorChange)
        element.removeEventListener('did-navigate', onNavigation)
        element.removeEventListener('did-navigate-in-page', onNavigation)
        element.removeEventListener('page-title-updated', onTitle)
        readyRef.current = false
        webviewRef.current = null
      }
    },
    [columnKey],
  )

  const scrollToTop = () => {
    if (readyRef.current) {
      webviewRef.current?.send(SCROLL_TOP)
    }
  }

  // The header menu's items above Remove Column (which stands apart, in red).
  const menuItems = [
    {
      id: 'scroll-top',
      icon: ArrowUpToLine,
      label: 'Scroll to Top',
      disabled: !isPage,
      onSelect: scrollToTop,
    },
    {
      id: 'reload',
      icon: RotateCw,
      label: 'Reload Column',
      disabled: !isPage,
      onSelect: () => webviewRef.current?.reload(),
    },
    {
      id: 'filters',
      icon: ListFilter,
      label: 'Filters…',
      disabled: !onEditFilters,
      onSelect: () => onEditFilters?.(columnKey),
    },
    {
      id: 'add-after',
      icon: Columns2,
      label: 'Add Column to the Right…',
      disabled: false,
      onSelect: () => onAddAfter(columnKey),
    },
  ]

  // ─── Effects ─────────────────────────────────────────────────────────
  // An account logged in to this page's session (TASK-043): the page loads again, logged in.
  useEffect(() => {
    if (sessionLogins === seenLogins.current) {
      return
    }

    seenLogins.current = sessionLogins
    setLoggedOut(false)
    // Only a page that was already showing (logged out) loads again. A column that was waiting for
    // its account gets a new page in the same render, which loads by itself: loadURL on a page that
    // has not reached dom-ready throws.
    const webview = webviewRef.current
    if (target.kind === 'page' && webview && readyRef.current) {
      try {
        void webview.loadURL(target.url).catch(() => undefined)
      } catch {
        // The page went away meanwhile: nothing to load.
      }
    }
  }, [sessionLogins, target])

  // Zoom reaches a guest that has reported in; any other guest gets it when it does.
  useEffect(() => {
    if (readyRef.current) {
      webviewRef.current?.setZoomFactor(zoom)
    }
  }, [zoom])

  // If a column's scripts or filters change, a guest that has reported in gets the new setup at
  // once; the preload adds or removes its styles and filters.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scriptsKey and filtersKey stand for scripts and filters.
  useEffect(() => {
    setupRef.current = { scripts, filters }
    if (readyRef.current) {
      webviewRef.current?.send(COLUMN_SETUP, setupRef.current)
    }
  }, [scriptsKey, filtersKey])

  return (
    <div
      ref={setNodeRef}
      data-column={id}
      data-column-key={columnKey}
      data-column-kind={target.kind}
      data-kind={kind}
      data-preload-ready={preloadReady ? 'true' : undefined}
      data-dragging={isDragging ? 'true' : undefined}
      data-collapsed={collapsed ? 'true' : undefined}
      className="relative flex shrink-0 flex-col overflow-hidden bg-app-bg"
      style={{
        width,
        order,
        // Horizontal only: columns move along the strip.
        transform: transform ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : undefined,
        transition,
        zIndex: isDragging ? 20 : undefined,
        // Swift kept collapsed columns loaded with opacity 0 and width 0.
        opacity: collapsed ? 0 : isDragging ? 0.85 : undefined,
      }}
    >
      <div className="flex h-8 w-full shrink-0 items-center border-b border-app-border transition-colors duration-500 in-data-[highlight=true]:bg-[rgb(29_155_240)]/15 in-data-[highlight=true]:duration-150">
        {/* A click scrolls to the top; a drag of 6 px or more reorders (ColumnStrip's sensor). */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          onClick={scrollToTop}
          data-testid="column-header"
          title={shownTitle}
          aria-label={`${shownTitle} column. Click to scroll to the top, drag to reorder.`}
          className="flex h-full min-w-0 flex-1 cursor-grab touch-none items-center gap-1.5 bg-transparent pl-2.5 text-left text-[13px] font-semibold text-foreground select-none active:cursor-grabbing"
        >
          <ColumnIcon kind={kind} className="size-4 shrink-0 text-app-text" />
          <span data-testid="column-title" className="truncate">
            {shownTitle}
          </span>
          {hasFilters(filters) && (
            <ListFilter
              data-testid="column-filtered"
              className="size-3.5 shrink-0 text-app-text"
              aria-label="Filtered"
            />
          )}
        </button>
        {accountLabel && (
          <span
            data-testid="column-account"
            className="max-w-[40%] shrink truncate px-1 text-xs text-app-text"
          >
            {accountLabel}
          </span>
        )}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="column-menu"
              aria-label={`${shownTitle} column options`}
              className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-app-text outline-none hover:bg-app-border focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-app-border"
            >
              <Ellipsis className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-testid="column-menu-content">
            {menuItems.map(({ id, icon: Icon, label, disabled, onSelect }) => (
              <DropdownMenuItem
                key={id}
                data-testid={`column-menu-${id}`}
                disabled={disabled}
                onSelect={onSelect}
              >
                <Icon /> {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="column-menu-remove"
              variant="destructive"
              onSelect={() => onRemove(columnKey)}
            >
              <Trash2 /> Remove Column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex min-h-0 flex-1">
        {target.kind === 'page' ? (
          <div className="relative flex min-h-0 flex-1">
            <webview
              ref={attachWebview}
              src={target.url}
              partition={target.partition}
              // Whole CSS px, rounded down: a fractional height leaves the guest one px taller than
              // the box, and the column's overflow-hidden clips its bottom edge (TASK-002c, S1).
              style={{ display: 'flex', width: '100%', height: 'round(down, 100%, 1px)' }}
            />
            {loggedOut && login && (
              // Over the network's own login form: every login goes through XDeck's login window.
              <div
                data-testid="column-logged-out"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-app-bg p-4 text-center text-sm text-app-text"
              >
                <p>You’re logged out of {NETWORK_INFO[login.network].name} in this column.</p>
                <Button data-testid="column-log-in" onClick={login.onLogIn}>
                  Log in to {NETWORK_INFO[login.network].name}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div
            data-testid="column-placeholder"
            className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-app-text"
          >
            <p>{target.message}</p>
            {login && (
              <Button data-testid="column-log-in" onClick={login.onLogIn}>
                {login.label}
              </Button>
            )}
          </div>
        )}
      </div>
      {/* shadcn ResizableHandle look: a thin line that thickens on hover and while dragging. */}
      {/* biome-ignore lint/a11y/useSemanticElements: a draggable divider is the separator widget role; <hr> cannot take pointer drags. */}
      <div
        data-testid="column-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${title}`}
        onPointerDown={(event) => onResizeStart(columnKey, width, event)}
        className="group absolute top-0 right-0 bottom-0 z-10 w-1.5 cursor-col-resize touch-none"
      >
        {/* The divider line between columns. It sits over the page edge, so the page keeps its width. */}
        <span className="absolute inset-y-0 right-0 w-px bg-app-border transition-all group-hover:w-1 group-active:w-1 group-active:bg-app-text/50" />
      </div>
    </div>
  )
}
