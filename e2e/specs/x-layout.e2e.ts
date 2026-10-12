import { browser, expect } from '@wdio/globals'
import { guestOfColumn, guestViewport, readColumnBoxes, waitForLoggedInColumns } from '../helpers/x'

// TASK-005 geometry on real x.com: every column is columnWidth (380) wide, next to the 68 px
// navigation rail (TASK-018). And no column clips its page: the guest's viewport fits the box.
// Config: the bundled default (forYou, following, notifications, profile, columnWidth 380).

describe('column layout with columnWidth 380', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) widths are [380, 380, 380, 380], right of the 68 px rail', async () => {
    const widths = (await readColumnBoxes()).map((box) => box.width)
    expect(widths).toEqual([380, 380, 380, 380])
    const rail = await browser.execute(
      () => document.querySelector('[data-testid="nav-rail"]')?.getBoundingClientRect().width,
    )
    expect(rail).toBe(68)
  })

  it('(b) every page fits its column: the guest viewport is not bigger than the box', async () => {
    for (const box of await readColumnBoxes()) {
      const viewport = await guestViewport(await guestOfColumn(box.id))
      expect(viewport.width).toBe(box.width)
      expect(viewport.height).toBeLessThanOrEqual(Math.floor(box.webviewHeight))
      expect(viewport.height).toBeGreaterThan(box.webviewHeight - 1)
    }
  })

  it('(c) still fits after the window is resized to a fractional content height', async () => {
    // At 150 % an even frame height gives a fractional CSS height (TASK-002c finding).
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows()[0]
      const bounds = win.getBounds()
      win.setBounds({ ...bounds, width: 1100, height: 752 })
    })
    await browser.pause(1500)
    for (const box of await readColumnBoxes()) {
      const viewport = await guestViewport(await guestOfColumn(box.id))
      expect(viewport.width).toBe(box.width)
      expect(viewport.height).toBeLessThanOrEqual(Math.floor(box.webviewHeight))
    }
  })

  it('(d) a column page can go full screen (a video full-screen button) and back', async () => {
    const guest = await guestOfColumn('col-0')
    // As a click would: requestFullscreen needs a user gesture, which executeJavaScript's second
    // argument gives the page.
    const entered = await browser.electron.execute(
      (electron, id: number) =>
        electron.webContents
          .fromId(id)
          ?.executeJavaScript(
            'document.documentElement.requestFullscreen().then(() => true, () => false)',
            true,
          ),
      guest,
    )
    expect(entered).toBe(true)
    await browser.waitUntil(
      () =>
        browser.electron.execute((electron) =>
          electron.BrowserWindow.getAllWindows()[0].isFullScreen(),
        ),
      { timeout: 5_000, timeoutMsg: 'the window did not go full screen with the page' },
    )
    await browser.electron.execute(
      (electron, id: number) =>
        electron.webContents.fromId(id)?.executeJavaScript('document.exitFullscreen()', true),
      guest,
    )
    await browser.waitUntil(
      async () =>
        !(await browser.electron.execute((electron) =>
          electron.BrowserWindow.getAllWindows()[0].isFullScreen(),
        )),
      { timeout: 5_000, timeoutMsg: 'the window did not leave full screen' },
    )
  })
})
