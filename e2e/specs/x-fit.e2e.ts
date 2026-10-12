import { browser, expect } from '@wdio/globals'
import { shownColumns } from '../helpers/layout'
import { waitForLoggedInColumns } from '../helpers/x'

// TASK-009 (Swift WindowWidthFitter): with columnWidth set, the window's content width fits the
// columns once at startup and again on View → Fit Window. Config: e2e/configs/real/fit.json
// (forYou and notifications at columnWidth 380, so the rail and columns are 68 + 380 + 380 = 828 px).

function contentWidth(): Promise<number> {
  return browser.electron.execute(
    (electron) => electron.BrowserWindow.getAllWindows()[0].getContentSize()[0],
  )
}

describe('View → Fit Window', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) the window fits the columns at startup', async () => {
    expect((await shownColumns()).map((c) => c.width)).toEqual([380, 380])
    await browser.waitUntil(async () => (await contentWidth()) === 828, {
      timeout: 5_000,
      timeoutMsg: 'the window did not fit the 828 px of columns at startup',
    })
  })

  it('(b) after the user widens the window, Fit Window fits it again', async () => {
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows()[0]
      const [, height] = win.getContentSize()
      win.setContentSize(1100, height)
    })
    await browser.waitUntil(async () => (await contentWidth()) === 1100, { timeout: 5_000 })
    await browser.electron.execute((electron) => {
      electron.Menu.getApplicationMenu()?.getMenuItemById('fit-window')?.click()
    })
    await browser.waitUntil(async () => (await contentWidth()) === 828, {
      timeout: 5_000,
      timeoutMsg: 'Fit Window did not fit the window to the columns',
    })
  })
})
