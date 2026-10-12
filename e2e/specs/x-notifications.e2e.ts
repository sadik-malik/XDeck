import { $, browser, expect } from '@wdio/globals'
import { guestEval } from '../helpers/guests'
import { guestOfColumn, waitForLoggedInColumns } from '../helpers/x'

// TASK-019 on real x.com: desktop notifications from X's unread count. X puts the count in every
// page title ("(3) Home / X"); when it goes up while XDeck is not focused, a notification is shown.
// wdio.conf.ts sets XDECK_NOTIFY_DRY_RUN, so notifications are recorded in the main process
// (globalThis.xdeckNotifications) instead of shown. The test account has no real notifications, so
// the specs set the page title themselves.
// Config: e2e/configs/real/fit.json (forYou and notifications, columnWidth 380).

function shownNotifications(): Promise<string[]> {
  return browser.electron.execute(
    () => (globalThis as { xdeckNotifications?: string[] }).xdeckNotifications ?? [],
  )
}

async function setTitle(column: string, title: string): Promise<void> {
  await guestEval(await guestOfColumn(column), `document.title = ${JSON.stringify(title)}; true`)
}

/**
 * Puts XDeck in the background. Minimized, not blurred: Windows can keep the focus on a window
 * that only calls blur(), depending on what else is on the desktop.
 */
async function sendToBackground(): Promise<void> {
  await browser.electron.execute((electron) => electron.BrowserWindow.getAllWindows()[0].minimize())
  await browser.waitUntil(
    () =>
      browser.electron.execute((electron) =>
        electron.BrowserWindow.getAllWindows()[0].isMinimized(),
      ),
    { timeout: 5_000, timeoutMsg: 'the window did not minimize' },
  )
}

async function bringBack(): Promise<void> {
  await browser.electron.execute((electron) => {
    const win = electron.BrowserWindow.getAllWindows()[0]
    win.restore()
    win.focus()
  })
  await browser.waitUntil(
    () =>
      browser.electron.execute(
        (electron) => !electron.BrowserWindow.getAllWindows()[0].isMinimized(),
      ),
    { timeout: 5_000, timeoutMsg: 'the window stayed minimized' },
  )
}

describe('desktop notifications from the unread count', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) a higher count in a page title shows a notification while XDeck is in the background', async () => {
    await sendToBackground()
    await setTitle('col-0', '(3) Home / X')
    await browser.waitUntil(
      // Named for the account since TASK-045: "@name: 3 new notifications on X".
      async () =>
        (await shownNotifications()).some((text) =>
          /^@[A-Za-z0-9_]{1,15}: 3 new notifications on X$/.test(text),
        ),
      { timeout: 5_000, timeoutMsg: 'no notification for the unread count' },
    )
  })

  it('(b) with Desktop Notifications off, a higher count shows nothing', async () => {
    await browser.electron.execute((electron) =>
      electron.Menu.getApplicationMenu()?.getMenuItemById('notifications')?.click(),
    )
    const before = (await shownNotifications()).length
    await sendToBackground()
    await setTitle('col-0', '(20+) Home / X')
    await browser.pause(1_500)
    expect(await shownNotifications()).toHaveLength(before)
    // On again, for the next checks.
    await browser.electron.execute((electron) =>
      electron.Menu.getApplicationMenu()?.getMenuItemById('notifications')?.click(),
    )
    await bringBack()
  })

  it("(c) the rail's settings menu shows the setting", async () => {
    await $('[data-testid="rail-settings"]').click()
    await expect($('[data-testid="rail-notifications"]')).toHaveAttribute('data-state', 'checked')
    await browser.keys('Escape')
  })

  it('(d) a clicked notification brings the Notifications column into view', async () => {
    // Zoomed in twice, the columns are 532 px and the Notifications column (col-1) runs off the
    // right edge of the window.
    for (let step = 0; step < 2; step += 1) {
      await browser.electron.execute((electron) =>
        electron.Menu.getApplicationMenu()?.getMenuItemById('zoom-in')?.click(),
      )
    }
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            (document.querySelector('[data-column="col-1"]')?.getBoundingClientRect().right ?? 0) >
            window.innerWidth + 1,
        ),
      { timeout: 5_000, timeoutMsg: 'the Notifications column still fits on screen' },
    )
    // What the notification's click handler sends (src/main/notifications.ts).
    await browser.electron.execute((electron) =>
      electron.BrowserWindow.getAllWindows()[0].webContents.send('notifications:reveal'),
    )
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const box = document.querySelector('[data-column="col-1"]')?.getBoundingClientRect()
          return box !== undefined && box.left >= 68 && box.right <= window.innerWidth + 1
        }),
      { timeout: 5_000, timeoutMsg: 'the Notifications column did not come into view' },
    )
    await browser.electron.execute((electron) =>
      electron.Menu.getApplicationMenu()?.getMenuItemById('reset-zoom')?.click(),
    )
  })
})
