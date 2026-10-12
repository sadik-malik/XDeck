import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { useSelector } from '@tanstack/react-store'
import { Plus } from 'lucide-react'
import { type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  accountLabel,
  accountNames,
  type ColumnAccount,
  columnAccount,
  unreadKeyOf,
} from '../../../shared/accounts'
import type { ColumnConfig } from '../../../shared/app-config'
import { describeColumn } from '../../../shared/column-kinds'
import {
  columnKeys,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  visualOrder,
} from '../../../shared/column-layout'
import { columnScripts } from '../../../shared/column-scripts'
import {
  columnNetwork,
  columnTarget,
  columnWidths,
  floorToWidthGrid,
  isXColumn,
  RAIL_WIDTH,
} from '../../../shared/columns'
import { NETWORK_INFO, type Network } from '../../../shared/networks'
import { addAccount, changeLayout, dataStore, logIn, removeColumn } from '../state/data'
import { useLoaded } from '../state/loaded'
import { overlayStore } from '../state/overlay'
import { unreadStore } from '../state/unread'
import { Column, type ColumnProps } from './Column'

type ColumnStripProps = {
  /** X's theme colour from the leftmost X column (TASK-008, Swift findThemeColor). */
  onThemeColor: (color: unknown) => void
}

/**
 * The window fits the columns once per app run, not once per strip: the strip is created again for
 * every deck that opens (TASK-022), and switching decks must not resize the window.
 */
let fittedAtStartup = false

/** Swift detectMediaOverlay: a photo or video opened from a tweet. */
const MEDIA_PATH = /\/(photo|video)\/\d+/

function clampWidth(width: number): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width))
}

/** Opens the add-column picker; the new column goes right after `afterKey` when given. */
function addColumnAfter(afterKey?: string) {
  overlayStore.actions.open({ kind: 'add-column', after: afterKey })
}

/** Header menu → Filters… on an X page column (TASK-021). */
function editFilters(columnKey: string) {
  overlayStore.actions.open({ kind: 'filters', columnKey })
}

function removeColumnByKey(columnKey: string) {
  void removeColumn(columnKey)
}

/**
 * How a network's column logs in (TASK-043): its own session again, or a new account when it has
 * none.
 */
function loginFor(column: ColumnConfig, account: ColumnAccount): ColumnProps['login'] {
  if (columnNetwork(column) === null) {
    return undefined
  }

  const { network } = account
  const { name } = NETWORK_INFO[network]
  switch (account.kind) {
    case 'none':
      return { network, label: `Log in to ${name}`, onLogIn: () => void addAccount(network) }
    case 'missing':
      return {
        network,
        label: `Add ${accountLabel(network, account.username)}`,
        onLogIn: () => void addAccount(network),
      }
    case 'ready':
      return {
        network,
        label: `Log in to ${name}`,
        onLogIn: () =>
          logIn(
            account.accountId === null
              ? { network, account: 'first' }
              : { network, account: 'again', id: account.accountId },
          ),
      }
  }
}

/**
 * Every X page title carries its account's unread count: for the rail's badges (the unread store,
 * TASK-040) and main's desktop notifications, which keep only changes (TASK-019), per account.
 */
function reportUnread(count: number, accountId: string | null) {
  window.xdeck.reportUnread(count, accountId).catch(() => undefined)
  unreadStore.actions.report(count, accountId)
}

/**
 * Horizontal strip of columns, built from settings.json. Plain flex layout, so the browser scrolls
 * it natively. Widths follow the Swift geometry (shared/columns.ts) unless the user resized a
 * column. Columns are reordered by dragging their header and resized by dragging their right edge,
 * like TweetDeck. The visual order uses CSS `order`, so no <webview> is ever moved in the DOM (moving
 * one reloads its page).
 */
export function ColumnStrip({ onThemeColor }: ColumnStripProps) {
  const sensors = useSensors(
    // A few px of movement before a drag starts, so a click on a header stays a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ─── State ───────────────────────────────────────────────────────────
  const { deck, columnWidth, username, accounts, settings } = useLoaded()
  // A column that was just added, scrolled into view once it is shown.
  const revealKey = useSelector(dataStore, (data) => data.revealKey)
  const [measured, setMeasured] = useState({ width: 0, pixelRatio: 1 })
  const [strip, setStrip] = useState<HTMLDivElement | null>(null)
  // The width of the column being resized, while the drag is in progress.
  const [liveResize, setLiveResize] = useState<{ key: string; width: number } | null>(null)
  // Any drag (resize or reorder): the <webview>s stop taking the pointer, or they would swallow it.
  const [dragging, setDragging] = useState(false)
  // The column showing a photo or video full width (Swift expandedColumnIndex), by column key.
  const [expanded, setExpanded] = useState<string | null>(null)
  // The latest total width, read by the Fit Window listener.
  const totalRef = useRef(0)

  // ─── Compute ─────────────────────────────────────────────────────────
  const { width: stripWidth, pixelRatio } = measured
  // The open deck's columns, and the user's saved order and widths (TASK-013/014).
  const { columns, layout } = deck
  // Page zoom (Swift pageZoom): scales column widths and the pages.
  const zoom = settings.pageZoom
  const keys = columnKeys(columns)
  const order = visualOrder(keys, layout)
  const visualKeys = order.map((index) => keys[index])
  const described = columns.map((column, index) => {
    // The column's account (TASK-023, TASK-049): its session, or a placeholder when it is not
    // logged in.
    const account = columnAccount(column, accounts)

    return {
      index,
      column,
      account,
      target:
        account.kind === 'ready'
          ? columnTarget(column, account.username, account.partition)
          : ({
              kind: 'placeholder',
              message:
                account.kind === 'missing'
                  ? `${accountLabel(account.network, account.username, accounts[account.network].labels)} is not in XDeck.`
                  : `No ${NETWORK_INFO[account.network].name} account is logged in.`,
            } as const),
      isX: isXColumn(column),
      // Shows a network (X, Instagram): an account, filters, an unread count.
      onNetwork: columnNetwork(column) !== null,
      description: describeColumn(column, username),
    }
  })

  const baseWidths = columnWidths(columns.length, stripWidth, columnWidth, pixelRatio, zoom)
  // The chrome takes X's theme colour from the first X column on screen (TASK-008); a deck with no
  // X column takes the first other network's, white or black (TASK-047).
  const themeColumn =
    order.find((index) => described[index].isX) ??
    order.find((index) => described[index].onNetwork) ??
    -1

  /** A width as shown: the live drag, the user's saved width (kept at zoom 1), or the Swift width. */
  function widthOf(index: number): number {
    const key = keys[index]
    if (expanded !== null) {
      // Swift: the expanded column fills the window and the others go to width 0.
      return key === expanded ? floorToWidthGrid(stripWidth, pixelRatio) : 0
    }

    if (liveResize?.key === key) {
      return liveResize.width
    }

    const saved = layout.widths[key]

    return saved !== undefined ? floorToWidthGrid(saved * zoom, pixelRatio) : baseWidths[index]
  }

  // The rail and the columns: the content width the window fits.
  const totalWidth = RAIL_WIDTH + order.reduce((sum, index) => sum + Math.max(0, widthOf(index)), 0)
  totalRef.current = totalWidth
  // How many accounts each network has: a column names its account once there is more than one.
  const accountCount = (network: Network) => accountNames(accounts[network]).length
  // A deck with no columns never fits the window: it would shrink to the rail.
  const hasColumns = columns.length > 0

  // ─── Callbacks ───────────────────────────────────────────────────────
  // Swift detectMediaOverlay: opening a photo or video expands that column; leaving it collapses.
  const onNavigate = useCallback((key: string, url: string) => {
    let path = ''
    try {
      path = new URL(url).pathname
    } catch {
      return
    }

    if (MEDIA_PATH.test(path)) {
      setExpanded((current) => current ?? key)
    } else {
      setExpanded((current) => (current === key ? null : current))
    }
  }, [])

  function startResize(key: string, startWidth: number, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const widthAt = (clientX: number) => clampWidth(startWidth + clientX - startX)
    // The pages stop taking the pointer at once, not on the next render: a <webview> under the
    // pointer would swallow the first moves (and can take the pointer capture away).
    if (strip) {
      strip.dataset.dragging = 'true'
    }

    setDragging(true)
    setLiveResize({ key, width: startWidth })
    // The last pointer position the drag saw. A cancelled pointer can report clientX 0, so the end
    // of the drag uses this instead of the ending event's position.
    let lastX = startX
    let finished = false
    const move = (moveEvent: globalThis.PointerEvent) => {
      lastX = moveEvent.clientX
      setLiveResize({ key, width: widthAt(lastX) })
    }

    const finish = (endEvent: Event) => {
      if (finished) {
        return
      }

      finished = true
      if (endEvent.type === 'pointerup') {
        lastX = (endEvent as globalThis.PointerEvent).clientX
      }

      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finish)
      setDragging(false)
      setLiveResize(null)
      const width = floorToWidthGrid(widthAt(lastX), pixelRatio)
      if (width !== startWidth) {
        // Saved at zoom 1, so the width scales with the zoom like every other column.
        const atZoom1 = clampWidth(Math.round(width / zoom))
        changeLayout({ ...layout, widths: { ...layout.widths, [key]: atZoom1 } })
      }
    }
    // On the window, not the handle: the pointer leaves the thin handle at once, and nothing depends
    // on keeping the pointer capture. If the window loses focus mid-drag (no pointerup ever comes),
    // the drag ends where it was instead of staying stuck at its live width.
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('blur', finish)
  }

  function endReorder({ active, over }: DragEndEvent) {
    setDragging(false)
    if (!over || active.id === over.id) {
      return
    }

    const from = visualKeys.indexOf(String(active.id))
    const to = visualKeys.indexOf(String(over.id))
    if (from < 0 || to < 0) {
      return
    }

    changeLayout({ ...layout, order: arrayMove(visualKeys, from, to) })
  }

  // ─── Effects ─────────────────────────────────────────────────────────
  // The strip's own width is the window's content width, fractional when the window is. The
  // device pixel ratio goes with it, because column widths are rounded to device px.
  useLayoutEffect(() => {
    if (!strip) {
      return
    }

    const measure = () =>
      setMeasured({
        width: strip.getBoundingClientRect().width,
        pixelRatio: window.devicePixelRatio,
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(strip)

    return () => observer.disconnect()
  }, [strip])

  // A new column may be off screen at the end of the strip: bring it into view.
  useEffect(() => {
    if (!strip || revealKey === null) {
      return
    }

    strip
      .querySelector(`[data-column-key="${CSS.escape(revealKey)}"]`)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [strip, revealKey])

  // Swift WindowWidthFitter: the window fits the columns once at startup, and on View → Fit Window.
  // Only with columnWidth, because otherwise the widths come from the window itself. The window's
  // content is the rail and the columns.
  useEffect(() => {
    if (columnWidth === undefined || fittedAtStartup || stripWidth === 0 || !hasColumns) {
      return
    }

    fittedAtStartup = true
    window.xdeck.fitWindow(totalRef.current).catch(() => undefined)
  }, [columnWidth, stripWidth, hasColumns])
  useEffect(
    () =>
      window.xdeck.onFitWindowRequest(() => {
        if (totalRef.current > RAIL_WIDTH) {
          window.xdeck.fitWindow(totalRef.current).catch(() => undefined)
        }
      }),
    [],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => setDragging(true)}
      onDragEnd={endReorder}
      onDragCancel={() => setDragging(false)}
    >
      <SortableContext items={visualKeys} strategy={horizontalListSortingStrategy}>
        <div
          ref={setStrip}
          data-testid="column-strip"
          data-dragging={dragging ? 'true' : undefined}
          className="flex min-h-0 min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
        >
          {columns.length === 0 && (
            <div
              data-testid="column-strip-empty"
              className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-app-text"
            >
              <p>No columns yet.</p>
              <Button data-testid="column-strip-add" onClick={() => addColumnAfter()}>
                <Plus /> Add Column
              </Button>
            </div>
          )}
          {described.map(({ index, column, account, target, isX, onNetwork, description }) => (
            <Column
              key={keys[index]}
              id={`col-${index}`}
              columnKey={keys[index]}
              title={description.title}
              kind={description.kind}
              usePageTitle={description.usePageTitle}
              target={target}
              width={Math.max(0, widthOf(index))}
              order={order.indexOf(index)}
              scripts={columnScripts(column, isX)}
              zoom={zoom}
              collapsed={expanded !== null && expanded !== keys[index]}
              onNavigate={onNavigate}
              onThemeColor={index === themeColumn ? onThemeColor : undefined}
              onUnread={
                onNetwork && account.kind === 'ready'
                  ? (count) => reportUnread(count, unreadKeyOf(account) ?? null)
                  : undefined
              }
              accountLabel={
                onNetwork && account.kind !== 'none' && accountCount(account.network) > 1
                  ? accountLabel(
                      account.network,
                      account.username,
                      accounts[account.network].labels,
                    )
                  : undefined
              }
              login={loginFor(column, account)}
              filters={onNetwork ? column.filters : undefined}
              onEditFilters={onNetwork && target.kind === 'page' ? editFilters : undefined}
              onResizeStart={startResize}
              onAddAfter={addColumnAfter}
              onRemove={removeColumnByKey}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
