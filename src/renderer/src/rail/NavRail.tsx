import { useSelector } from '@tanstack/react-store'
import {
  Bell,
  Code,
  Columns3,
  Ellipsis,
  Globe,
  Info,
  Keyboard,
  type LucideIcon,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Settings,
  SlidersHorizontal,
  SquarePen,
  Trash2,
  Undo2,
  ZoomIn,
} from 'lucide-react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { accountLabel, columnAccount, unreadKeyOf } from '../../../shared/accounts'
import { describeColumn } from '../../../shared/column-kinds'
import { columnKeys, visualOrder } from '../../../shared/column-layout'
import { RAIL_WIDTH } from '../../../shared/columns'
import { accountSession, NETWORK_INFO, NETWORKS, type Network } from '../../../shared/networks'
import type { RailMenuItem } from '../../../shared/rail'
import { ColumnIcon } from '../columns/ColumnIcon'
import { POINTER_IN_PAGE } from '../columns/guest-channels'
import { revealColumn } from '../columns/reveal'
import { NETWORK_ICONS } from '../network-icons'
import { addAccount, post, postersOf, selectDeck } from '../state/data'
import { useLoaded } from '../state/loaded'
import { type Overlay, overlayStore } from '../state/overlay'
import { unreadOf, unreadStore } from '../state/unread'
import { SETTINGS_PAGES } from './PagePopup'

const isMac = window.xdeck.platform === 'darwin'
const mod = isMac ? '⌘' : 'Ctrl+'

function runMenuItem(id: RailMenuItem) {
  window.xdeck.runMenuItem(id).catch(() => undefined)
}

function open(overlay: Overlay) {
  overlayStore.actions.open(overlay)
}

/** X's settings and privacy for one account: the first one (null) or an added one (TASK-031). */
/** A network's settings page over the columns, in the account's session. */
function openSettings(network: Network, accountId: string | null) {
  open({
    kind: 'popup',
    page: { ...SETTINGS_PAGES[network], partition: accountSession(network, accountId) },
  })
}

/** The settings menu's switches: each runs its app-menu item and shows its setting. */
const SETTING_TOGGLES: {
  id: RailMenuItem
  setting: 'darkMode' | 'notifications'
  icon: LucideIcon
  label: string
}[] = [
  { id: 'dark-mode', setting: 'darkMode', icon: Moon, label: 'Dark Mode' },
  { id: 'notifications', setting: 'notifications', icon: Bell, label: 'Desktop Notifications' },
]

/** Zoom's submenu, with each item's shortcut key (after Ctrl+ or ⌘). */
const ZOOM_ITEMS: { id: RailMenuItem; label: string; key: string }[] = [
  { id: 'zoom-in', label: 'Zoom In', key: '=' },
  { id: 'zoom-out', label: 'Zoom Out', key: '-' },
  { id: 'reset-zoom', label: 'Actual Size', key: '.' },
]

/** The column layout's items. Fit Window shows only when settings.json sets columnWidth. */
const LAYOUT_ITEMS: { id: RailMenuItem; icon: LucideIcon; label: string; key?: string }[] = [
  { id: 'reload-columns', icon: RotateCw, label: 'Reload All Columns', key: 'R' },
  { id: 'fit-window', icon: Columns3, label: 'Fit Window to Columns', key: 'F' },
  { id: 'reset-layout', icon: Undo2, label: 'Reset Layout' },
]

/** About XDeck's submenu. */
const ABOUT_ITEMS: { id: RailMenuItem; icon: LucideIcon; label: string }[] = [
  { id: 'check-updates', icon: RefreshCw, label: 'Check for Updates…' },
  { id: 'github', icon: Code, label: 'XDeck on GitHub' },
]

/**
 * Each network's test ids in the More menu: X's are older than the others'. The first X account's
 * remove button is "Log out" (TASK-043).
 */
function accountTestIds(network: Network, first: boolean) {
  if (network === 'x') {
    return first
      ? { settings: 'rail-x-settings', remove: 'rail-log-out' }
      : { settings: 'rail-account-settings', remove: 'rail-remove-account' }
  }

  return { settings: `rail-${network}-settings`, remove: `rail-remove-${network}` }
}

/** More's add-account items, one per network: its first account, or one more (TASK-049). */
const ADD_ACCOUNT_ITEMS = NETWORKS.map((network) => ({
  id: network === 'x' ? 'rail-add-account' : `rail-add-${network}`,
  label: `Add ${NETWORK_INFO[network].name} account…`,
  onSelect: () => void addAccount(network),
}))

/** A deck's tile: up to two letters of its name. */
function deckInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? `${words[0][0]}${words[1][0]}` : name.trim().slice(0, 2)

  return letters.toLocaleUpperCase()
}

/** X's own blue: the Post button, the open deck. */
const X_BLUE = 'rgb(29 155 240)'

const composeButton =
  'mb-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-[rgb(29_155_240)] text-white shadow-sm outline-none transition-colors hover:bg-[rgb(26_140_216)] focus-visible:ring-2 focus-visible:ring-[rgb(29_155_240)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg'

const deckTile =
  'flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring'

const railButton =
  'flex size-10 shrink-0 items-center justify-center rounded-full text-app-text outline-none transition-colors hover:bg-app-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-app-border data-[state=open]:text-foreground'

function RailButton({
  label,
  children,
  className,
  ...props
}: { label: string; children: ReactNode } & ComponentProps<'button'>) {
  return (
    <button type="button" aria-label={label} className={cn(railButton, className)} {...props}>
      {children}
    </button>
  )
}

/**
 * The rail's tooltip: the button's name to its right, with its shortcut key when it has one. It
 * wraps the trigger (a button, or a menu's trigger around one).
 */
function RailTip({ label, keys, children }: { label: string; keys?: string; children: ReactNode }) {
  // ─── State ───────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)

  // ─── Effects ─────────────────────────────────────────────────────────
  // The pointer went from the rail straight into a column page: the button never hears it leave.
  useEffect(() => {
    if (!open) {
      return
    }

    const close = () => setOpen(false)
    window.addEventListener(POINTER_IN_PAGE, close)
    window.addEventListener('blur', close)

    return () => {
      window.removeEventListener(POINTER_IN_PAGE, close)
      window.removeEventListener('blur', close)
    }
  }, [open])

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        asChild
        // Focus shows the tooltip only from the keyboard. Focus that comes back to the button
        // after a menu or dialog closed would otherwise leave its tooltip up.
        onFocus={(event) => {
          if (!event.currentTarget.matches(':focus-visible')) {
            event.preventDefault()
          }
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={12} data-testid="rail-tooltip">
        <span className="flex items-center gap-2">
          {label}
          {keys && (
            <kbd className="rounded border border-background/25 px-1 font-sans text-[10px] font-medium opacity-80">
              {keys}
            </kbd>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

/** An on/off setting in a menu: icon, name and a small switch (the item keeps its checked state). */
function ToggleItem({
  icon,
  checked,
  children,
  onSelect,
  ...props
}: { icon: ReactNode } & ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      {...props}
      checked={checked}
      onSelect={(event) => {
        // The menu stays open, so the switch is seen to move.
        event.preventDefault()
        onSelect?.(event)
      }}
      className="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      {icon}
      {children}
      <span
        aria-hidden
        className={cn(
          'ml-auto flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-[rgb(29_155_240)]' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'size-3 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-3',
          )}
        />
      </span>
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

/** Avatar colours: X's blue and a few calm companions, picked by user name so each stays the same. */
const AVATAR_COLOURS = ['#1d9bf0', '#7856ff', '#00ba7c', '#f91880', '#ff7a00', '#0f9db3']

/**
 * An account's avatar: its initial on a colour of its own (XDeck has no photos of the accounts). An
 * account of a network other than X has a small badge with the network's icon (roadmap §9).
 */
function AccountAvatar({ username, network }: { username: string; network: Network }) {
  let hash = 0
  for (const char of username.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }

  const Badge = NETWORK_ICONS[network]

  return (
    <span
      aria-hidden
      style={{ background: AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length] }}
      className="relative flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white uppercase"
    >
      {username.charAt(0)}
      {network !== 'x' && (
        <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-popover text-popover-foreground ring-1 ring-border">
          <Badge className="size-2.5" />
        </span>
      )}
    </span>
  )
}

/** The small icon buttons at the end of an account's row. */
const rowButton = 'size-8 justify-center p-0 text-muted-foreground'

/**
 * One account in the More menu (TASK-031): its avatar and name, then its network's settings and its
 * remove button. The buttons are menu items, so the keyboard reaches them. A network's first account
 * has no id.
 */
function AccountRow({
  network,
  username,
  accountId,
  label,
}: {
  network: Network
  username: string
  accountId: string | null
  /** How the account is named: @name, or a Facebook account's name. */
  label: string
}) {
  const settings =
    network === 'x' ? 'X settings and privacy' : `${NETWORK_INFO[network].name} settings`
  const testIds = accountTestIds(network, accountId === null)

  return (
    <div
      data-testid="rail-account"
      data-network={network}
      className="flex items-center gap-1 py-0.5 pl-2"
    >
      <AccountAvatar username={label.replace(/^@/, '')} network={network} />
      <span className="ml-1.5 min-w-0 flex-1 truncate text-sm">{label}</span>
      <DropdownMenuItem
        data-testid={testIds.settings}
        data-account-id={accountId ?? undefined}
        aria-label={`${settings} for ${label}`}
        title={settings}
        onSelect={() => openSettings(network, accountId)}
        className={rowButton}
      >
        <SlidersHorizontal />
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid={testIds.remove}
        data-account-id={accountId ?? undefined}
        aria-label={`Remove ${label} from XDeck`}
        title="Remove from XDeck (logs out)"
        variant="destructive"
        onSelect={() =>
          open({
            kind: 'remove-account',
            account: { network, username, label, ...(accountId ? { id: accountId } : {}) },
          })
        }
        className={rowButton}
      >
        <Trash2 />
      </DropdownMenuItem>
    </div>
  )
}

/** Up to 99 unread notifications as a number on the column's button, then 99+. */
function unreadLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/**
 * XDeck's navigation rail (TASK-018), like TweetDeck's: Compose, Search, one button per column,
 * Add column, and at the bottom X's account pages and XDeck's settings. It replaces X's own side
 * navigation, which the Swift app kept in the leftmost X column.
 */
export function NavRail() {
  // ─── State ───────────────────────────────────────────────────────────
  const { deck: current, columnWidth, username: firstUsername, accounts, settings } = useLoaded()
  // X's unread notification count per account, for the columns' badges.
  const unread = useSelector(unreadStore)

  // ─── Compute ─────────────────────────────────────────────────────────
  const decks = current.decks.map((deck, i) => ({ key: current.keys[i], name: deck.name }))
  const activeDeck = current.key
  // The columns in on-screen order, with X's unread count on a notifications column.
  const keys = columnKeys(current.columns)
  const columns = visualOrder(keys, current.layout).map((index) => {
    const { title, kind } = describeColumn(current.columns[index], firstUsername)
    const account = columnAccount(current.columns[index], accounts)
    // X's and Instagram's Notifications columns show their account's unread count.
    const key = unreadKeyOf(account)
    const badge =
      (kind === 'notifications' || kind === 'igNotifications' || kind === 'fbNotifications') &&
      key !== undefined
        ? unreadOf(unread, key)
        : 0

    return { key: keys[index], title, kind, unread: badge }
  })
  // settings.json sets columnWidth, so Fit Window to Columns is offered.
  const canFitWindow = columnWidth !== undefined
  // Who can post: every account, network by network (TASK-044).
  const posters = postersOf(accounts)
  const hasAccounts = posters.length > 0

  return (
    // No hoverable content: a tooltip closes as the pointer leaves its button. Kept open on the way
    // to it, it could stay up for good, because a column page under the pointer takes the moves.
    <TooltipProvider delayDuration={250} skipDelayDuration={400} disableHoverableContent>
      <nav
        data-testid="nav-rail"
        data-username={firstUsername ?? undefined}
        aria-label="XDeck"
        style={{ width: RAIL_WIDTH }}
        className="flex h-full shrink-0 flex-col items-center gap-1 border-r border-app-border bg-app-bg py-2"
      >
        <ul data-testid="rail-decks" className="flex shrink-0 flex-col items-center gap-1">
          {decks.map((deck) =>
            deck.key === activeDeck ? (
              <li key={deck.key}>
                <DropdownMenu modal={false}>
                  <RailTip label={`${deck.name} · deck options`}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        data-testid="rail-deck"
                        data-deck-key={deck.key}
                        data-deck-name={deck.name}
                        data-active="true"
                        aria-label={`${deck.name} deck, open. Deck options`}
                        style={{ color: X_BLUE }}
                        className={cn(
                          deckTile,
                          'bg-[rgb(29_155_240)]/12 hover:bg-[rgb(29_155_240)]/20',
                        )}
                      >
                        {deckInitials(deck.name)}
                      </button>
                    </DropdownMenuTrigger>
                  </RailTip>
                  <DropdownMenuContent side="right" align="start" data-testid="rail-deck-menu">
                    <DropdownMenuLabel>{deck.name}</DropdownMenuLabel>
                    <DropdownMenuItem
                      data-testid="rail-deck-rename"
                      onSelect={() => open({ kind: 'deck', dialog: { kind: 'rename' } })}
                    >
                      <Pencil /> Rename Deck…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="rail-deck-delete"
                      variant="destructive"
                      disabled={decks.length < 2}
                      onSelect={() => open({ kind: 'deck', dialog: { kind: 'delete' } })}
                    >
                      <Trash2 /> Delete Deck…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ) : (
              <li key={deck.key}>
                <RailTip label={deck.name}>
                  <button
                    type="button"
                    data-testid="rail-deck"
                    data-deck-key={deck.key}
                    data-deck-name={deck.name}
                    aria-label={`${deck.name} deck`}
                    onClick={() => selectDeck(deck.key)}
                    className={cn(
                      deckTile,
                      'text-app-text hover:bg-app-border hover:text-foreground',
                    )}
                  >
                    {deckInitials(deck.name)}
                  </button>
                </RailTip>
              </li>
            ),
          )}
          <li>
            <RailTip label="New deck">
              {/* A deck tile still to be made: a dashed circle with a plus, beside the deck tiles. */}
              <RailButton
                label="New deck"
                data-testid="rail-new-deck"
                onClick={() => open({ kind: 'deck', dialog: { kind: 'new' } })}
                className="border border-dashed border-app-text/45 hover:border-app-text/70"
              >
                <Plus className="size-4" aria-hidden />
              </RailButton>
            </RailTip>
          </li>
        </ul>
        <div className="my-1 h-px w-8 shrink-0 bg-app-border" />
        {posters.length < 2 ? (
          // One account posts at once; with none, Post asks to log in to X first (TASK-043).
          <RailTip label="Post" keys="N">
            <button
              type="button"
              data-testid="rail-compose"
              aria-label="Post"
              onClick={() => (posters[0] ? post(posters[0]) : void addAccount('x'))}
              className={composeButton}
            >
              <SquarePen className="size-5" aria-hidden />
            </button>
          </RailTip>
        ) : (
          // With more than one account, Post asks which one posts (TASK-023).
          <DropdownMenu modal={false}>
            <RailTip label="Post" keys="N">
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="rail-compose"
                  aria-label="Post. Choose the account"
                  className={composeButton}
                >
                  <SquarePen className="size-5" aria-hidden />
                </button>
              </DropdownMenuTrigger>
            </RailTip>
            <DropdownMenuContent side="right" align="start" data-testid="rail-compose-menu">
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                Post as
              </DropdownMenuLabel>
              {posters.map((poster) => (
                <DropdownMenuItem
                  key={`${poster.network}:${poster.id ?? ''}`}
                  data-testid="rail-compose-as"
                  data-network={poster.network}
                  data-account-id={poster.id ?? undefined}
                  onSelect={() => post(poster)}
                >
                  <AccountAvatar username={poster.username} network={poster.network} />
                  <span className="min-w-0 flex-1 truncate">@{poster.username}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <RailTip label="Search" keys="/">
          <RailButton
            label="Search"
            data-testid="rail-search"
            onClick={() => open({ kind: 'add-column', choice: 'search' })}
          >
            <Search className="size-5" aria-hidden />
          </RailButton>
        </RailTip>
        <div className="my-1 h-px w-8 shrink-0 bg-app-border" />
        <ul
          data-testid="rail-columns"
          className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto"
        >
          {columns.map((column, index) => (
            <li key={column.key}>
              <RailTip
                label={column.unread > 0 ? `${column.title} · ${column.unread} new` : column.title}
                keys={index < 9 ? String(index + 1) : undefined}
              >
                <RailButton
                  label={column.title}
                  data-testid="rail-column"
                  data-column-key={column.key}
                  onClick={() => revealColumn(column.key)}
                  className="relative"
                >
                  <ColumnIcon kind={column.kind} className="size-5" />
                  {column.unread > 0 && (
                    <span
                      data-testid="rail-unread"
                      aria-hidden
                      className="absolute top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(29_155_240)] px-1 text-[10px] leading-none font-bold text-white ring-2 ring-app-bg"
                    >
                      {unreadLabel(column.unread)}
                    </span>
                  )}
                </RailButton>
              </RailTip>
            </li>
          ))}
          <li>
            <RailTip label="Add column">
              <RailButton
                label="Add column"
                data-testid="rail-add-column"
                onClick={() => open({ kind: 'add-column' })}
              >
                <Plus className="size-5" aria-hidden />
              </RailButton>
            </RailTip>
          </li>
        </ul>
        <div className="my-1 h-px w-8 shrink-0 bg-app-border" />
        <DropdownMenu modal={false}>
          <RailTip label="Accounts and X settings">
            <DropdownMenuTrigger asChild>
              <RailButton label="More" data-testid="rail-more">
                <Ellipsis className="size-5" aria-hidden />
              </RailButton>
            </DropdownMenuTrigger>
          </RailTip>
          <DropdownMenuContent
            side="right"
            align="end"
            className="w-64"
            data-testid="rail-more-menu"
          >
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Accounts
            </DropdownMenuLabel>
            {/* The accounts as a list (TASK-031), all alike: none is shown as main. Each has its own
                settings and its own remove button, which logs it out (TASK-043). */}
            {!hasAccounts && (
              <p
                data-testid="rail-no-accounts"
                className="px-2 py-1.5 text-sm text-muted-foreground"
              >
                No accounts yet.
              </p>
            )}
            {NETWORKS.flatMap((network) => {
              const { first, added, labels } = accounts[network]

              return [
                ...(first
                  ? [
                      <AccountRow
                        key={`${network}:first`}
                        network={network}
                        username={first}
                        accountId={null}
                        label={accountLabel(network, first, labels)}
                      />,
                    ]
                  : []),
                ...added.map((account) => (
                  <AccountRow
                    key={`${network}:${account.id}`}
                    network={network}
                    username={account.username}
                    accountId={account.id}
                    label={accountLabel(network, account.username, labels)}
                  />
                )),
              ]
            })}
            <DropdownMenuSeparator />
            {ADD_ACCOUNT_ITEMS.map(({ id, label, onSelect }) => (
              <DropdownMenuItem key={id} data-testid={id} onSelect={onSelect}>
                <span className="flex size-7 items-center justify-center rounded-full border border-dashed border-muted-foreground/50">
                  <Plus className="size-3.5" />
                </span>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu modal={false}>
          <RailTip label="XDeck settings">
            <DropdownMenuTrigger asChild>
              <RailButton label="XDeck settings" data-testid="rail-settings">
                <Settings className="size-5" aria-hidden />
              </RailButton>
            </DropdownMenuTrigger>
          </RailTip>
          <DropdownMenuContent
            side="right"
            align="end"
            className="w-64"
            data-testid="rail-settings-menu"
          >
            {SETTING_TOGGLES.map(({ id, setting, icon: Icon, label }) => (
              <ToggleItem
                key={id}
                data-testid={`rail-${id}`}
                icon={<Icon />}
                checked={settings[setting]}
                onSelect={() => runMenuItem(id)}
              >
                {label}
              </ToggleItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="rail-zoom" className="[&>svg:last-child]:ml-0">
                <ZoomIn /> Zoom
                <span className="ml-auto text-xs text-muted-foreground">
                  {Math.round(settings.pageZoom * 100)}%
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {ZOOM_ITEMS.map(({ id, label, key }) => (
                  <DropdownMenuItem key={id} onSelect={() => runMenuItem(id)}>
                    {label}{' '}
                    <DropdownMenuShortcut>
                      {mod}
                      {key}
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {LAYOUT_ITEMS.filter((item) => canFitWindow || item.id !== 'fit-window').map(
              ({ id, icon: Icon, label, key }) => (
                <DropdownMenuItem
                  key={id}
                  data-testid={`rail-${id}`}
                  onSelect={() => runMenuItem(id)}
                >
                  <Icon /> {label}
                  {key && (
                    <DropdownMenuShortcut>
                      {mod}
                      {key}
                    </DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              ),
            )}
            <DropdownMenuItem
              data-testid="rail-user-agent"
              onSelect={() => open({ kind: 'user-agent' })}
            >
              <Globe /> User Agent…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="rail-keyboard-shortcuts"
              onSelect={() => runMenuItem('keyboard-shortcuts')}
            >
              <Keyboard /> Keyboard Shortcuts <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="rail-about">
                <Info /> About XDeck
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {ABOUT_ITEMS.map(({ id, icon: Icon, label }) => (
                  <DropdownMenuItem key={id} onSelect={() => runMenuItem(id)}>
                    <Icon /> {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </TooltipProvider>
  )
}
