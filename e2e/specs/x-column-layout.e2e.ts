import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, expect } from '@wdio/globals'
import { guestEval, listPageGuests } from '../helpers/guests'
import { dragBy, pageLoads, shownColumns } from '../helpers/layout'
import { waitForLoggedInColumns } from '../helpers/x'

// TASK-013/014 on real x.com: column headers, TweetDeck-style resize (one column grows) and drag to
// reorder, without reloading any column, and saved for the next launch.
// Config: the bundled default (forYou, following, notifications, profile; columnWidth 380).

const HEADER_DISPLAY = `(() => { const h = document.querySelector('header'); return h ? getComputedStyle(h).display : null })()`

let guests: Record<string, number> = {}
let loadsBefore: Record<string, number> = {}

describe('column layout: headers, resize, reorder', () => {
  before(async () => {
    await waitForLoggedInColumns()
    guests = Object.fromEntries((await listPageGuests()).map((g) => [g.id, g.guestId]))
    loadsBefore = await pageLoads(guests)
  })

  it('(a) each column has a header with its title', async () => {
    const titles = (await shownColumns()).map((column) => column.title)
    expect(titles.slice(0, 3)).toEqual(['For you', 'Following', 'Notifications'])
    expect(titles[3]).toMatch(/^@[A-Za-z0-9_]{1,15}$/)
  })

  it('(b) dragging a column edge resizes only that column, without reloading it', async () => {
    await dragBy('[data-column="col-1"] [data-testid="column-resize-handle"]', 100)
    const widths = Object.fromEntries((await shownColumns()).map((c) => [c.id, c.width]))
    expect(widths['col-0']).toBe(380)
    expect(widths['col-1']).toBeGreaterThanOrEqual(476)
    expect(widths['col-1']).toBeLessThanOrEqual(482)
    expect(widths['col-2']).toBe(380)
    expect(widths['col-3']).toBe(380)
    expect(await pageLoads(guests)).toEqual(loadsBefore)
  })

  it('(c) dragging a header reorders the columns, without reloading any of them', async () => {
    const before = await shownColumns()
    const from = before.find((c) => c.id === 'col-2')
    const to = before.find((c) => c.id === 'col-0')
    if (!from || !to) {
      throw new Error('columns missing')
    }
    // From the middle of col-2's header to the middle of col-0's.
    await dragBy(
      '[data-column="col-2"] [data-testid="column-header"]',
      to.left + to.width / 2 - (from.left + from.width / 2),
    )
    const after = await shownColumns()
    expect(after.map((c) => c.id)).toEqual(['col-2', 'col-0', 'col-1', 'col-3'])
    expect(await pageLoads(guests)).toEqual(loadsBefore)
  })

  it('(d) widths move with their columns, the rail lists the new order, and no X side navigation shows', async () => {
    const widths = Object.fromEntries((await shownColumns()).map((c) => [c.id, c.width]))
    expect(widths['col-2']).toBe(380)
    expect(widths['col-0']).toBe(380)
    expect(widths['col-1']).toBeGreaterThanOrEqual(476)
    const railKeys = await browser.execute(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-testid="rail-column"]')).map(
        (button) => button.dataset.columnKey,
      ),
    )
    expect(railKeys).toEqual(['notifications#0', 'forYou#0', 'following#0', 'profile#0'])
    for (const id of ['col-0', 'col-1', 'col-2', 'col-3']) {
      expect(await guestEval<string | null>(guests[id], HEADER_DISPLAY)).toBe('none')
    }
  })

  it('(e) the new order and width are saved in the profile (store.json)', async () => {
    // Saving is checked on disk; loading at startup is x-column-persist.e2e.ts. A relaunch inside
    // one session hard-kills the old app and can leave the profile locked (TASK-007 notes).
    const userData = process.env.XDECK_USER_DATA
    if (!userData) {
      throw new Error('XDECK_USER_DATA is not set')
    }
    const saved = await browser.waitUntil(
      () => {
        // Saved per deck (TASK-022); a columns settings.json is one deck, Main.
        const layout = JSON.parse(readFileSync(join(userData, 'store.json'), 'utf8')).deckLayouts?.[
          'Main#0'
        ]
        return layout?.order?.length === 4 ? layout : false
      },
      { timeout: 5_000, timeoutMsg: 'the layout was not saved' },
    )
    expect(saved.order).toEqual(['notifications#0', 'forYou#0', 'following#0', 'profile#0'])
    expect(saved.widths['following#0']).toBeGreaterThanOrEqual(476)
    expect(saved.widths['following#0']).toBeLessThanOrEqual(482)
  })
})
