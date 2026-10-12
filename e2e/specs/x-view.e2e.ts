import { browser } from '@wdio/globals'
import { listPageGuests } from '../helpers/guests'
import { pageLoads, shownColumns } from '../helpers/layout'
import { waitForLoggedInColumns } from '../helpers/x'

// TASK-009 on real x.com: View → Zoom In / Zoom Out / Reset Zoom / Reload (Swift's ⌘ shortcuts).
// Settings…, Check for Updates and the Help links are in menu-actions.e2e.ts, which loads no X pages.
// Config: the bundled default (columnWidth 380).

async function clickMenu(id: string): Promise<void> {
  await browser.electron.execute((electron, itemId: string) => {
    const item = electron.Menu.getApplicationMenu()?.getMenuItemById(itemId)
    if (!item) {
      throw new Error(`menu item ${itemId} is missing`)
    }
    item.click()
  }, id)
}

async function zoomFactors(guests: number[]): Promise<number[]> {
  return browser.electron.execute(
    (electron, ids: number[]) =>
      ids.map(
        (id) => Math.round((electron.webContents.fromId(id)?.getZoomFactor() ?? 0) * 100) / 100,
      ),
    guests,
  )
}

async function expectZoom(zoom: number, widths: number[], guests: number[]): Promise<void> {
  await browser.waitUntil(
    async () => (await shownColumns()).map((c) => c.width).join() === widths.join(),
    { timeout: 5_000, timeoutMsg: `widths did not become ${widths.join(', ')} at zoom ${zoom}` },
  )
  await browser.waitUntil(async () => (await zoomFactors(guests)).every((f) => f === zoom), {
    timeout: 5_000,
    timeoutMsg: `the pages' zoom factor did not become ${zoom}`,
  })
}

describe('View and Help menus on real x.com', () => {
  let guests: Record<string, number> = {}

  before(async () => {
    await waitForLoggedInColumns()
    guests = Object.fromEntries((await listPageGuests()).map((g) => [g.id, g.guestId]))
  })

  it('(a) Zoom In: widths × 1.2 and the pages zoom to 1.2', async () => {
    await clickMenu('zoom-in')
    await expectZoom(1.2, [456, 456, 456, 456], Object.values(guests))
  })

  it('(b) Zoom Out twice: 0.8', async () => {
    await clickMenu('zoom-out')
    await clickMenu('zoom-out')
    await expectZoom(0.8, [304, 304, 304, 304], Object.values(guests))
  })

  it('(c) Reset Zoom: back to 1', async () => {
    await clickMenu('reset-zoom')
    await expectZoom(1, [380, 380, 380, 380], Object.values(guests))
  })

  it('(d) Reload reloads every column', async () => {
    const before = await pageLoads(guests)
    await clickMenu('reload-columns')
    await browser.waitUntil(
      async () => {
        const after = await pageLoads(guests)
        return Object.keys(after).every((id) => after[id] !== before[id])
      },
      { timeout: 20_000, interval: 500, timeoutMsg: 'not every column reloaded' },
    )
    await waitForLoggedInColumns()
  })
})
