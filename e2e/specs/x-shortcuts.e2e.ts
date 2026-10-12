import { $, browser, expect } from '@wdio/globals'
import { guestEval } from '../helpers/guests'
import { guestOfColumn, waitForLoggedInColumns } from '../helpers/x'

// TASK-020 on real x.com: XDeck's keyboard shortcuts, pressed inside a column page (real key input,
// sent to the guest), like TweetDeck's: 1–9 go to a column, N posts, / searches, ? lists them. Never
// while typing. Nothing is posted.
// Config: the bundled default (forYou, following, notifications, profile; columnWidth 380).

/** Presses one key in a column page, as the keyboard would. */
async function pressInColumn(column: string, key: string): Promise<void> {
  const guest = await guestOfColumn(column)
  await browser.electron.execute(
    (electron, id: number, keyCode: string) => {
      const contents = electron.webContents.fromId(id)
      if (!contents) {
        throw new Error('no guest')
      }
      contents.focus()
      contents.sendInputEvent({ type: 'keyDown', keyCode })
      contents.sendInputEvent({ type: 'char', keyCode })
      contents.sendInputEvent({ type: 'keyUp', keyCode })
    },
    guest,
    key,
  )
}

async function waitClosed(testId: string): Promise<void> {
  await browser.keys('Escape')
  await $(`[data-testid="${testId}"]`).waitForExist({ reverse: true, timeout: 5_000 })
}

/** Presses Escape in the open Post editor's page, as the keyboard would (TASK-025). */
async function escapeInCompose(): Promise<void> {
  const guest = await browser.execute(() =>
    (
      document.querySelector(
        '[data-testid="compose-popup"][data-open="true"] [data-testid="compose-webview"]',
      ) as unknown as { getWebContentsId(): number }
    ).getWebContentsId(),
  )
  // X's page reports Escape once it has loaded; a fresh editor may still be loading.
  await browser.waitUntil(
    () =>
      browser.electron.execute(
        (electron, id: number) =>
          electron.webContents
            .fromId(id)
            ?.executeJavaScript(`!!document.querySelector('[data-testid="tweetTextarea_0"]')`),
        guest,
      ),
    { timeout: 30_000, timeoutMsg: 'the post editor did not load' },
  )
  await browser.electron.execute((electron, id: number) => {
    const contents = electron.webContents.fromId(id)
    contents?.focus()
    contents?.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    contents?.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  }, guest)
  await $('[data-testid="compose-popup"][data-open="true"]').waitForExist({
    reverse: true,
    timeout: 5_000,
  })
}

describe('keyboard shortcuts', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) ? in a column shows the shortcuts', async () => {
    await pressInColumn('col-0', '?')
    await $('[data-testid="shortcuts-dialog"]').waitForDisplayed({ timeout: 5_000 })
    await waitClosed('shortcuts-dialog')
  })

  it("(b) N in a column opens XDeck's post popup, not X's editor inside the column", async () => {
    await pressInColumn('col-1', 'n')
    await $('[data-testid="compose-popup"][data-open="true"]').waitForExist({ timeout: 5_000 })
    expect(await guestEval<string>(await guestOfColumn('col-1'), 'location.pathname')).toBe('/home')
    await escapeInCompose()
  })

  it('(c) / opens the add-column picker on Search', async () => {
    await pressInColumn('col-0', '/')
    await $(
      '[data-testid="add-column-choice"][data-choice="search"][aria-pressed="true"]',
    ).waitForExist({ timeout: 5_000 })
    await waitClosed('add-column-dialog')
  })

  it('(d) 4 brings the fourth column into view and gives it the keyboard', async () => {
    // Zoomed in twice, the columns are 532 px, so the fourth one is off screen.
    for (let step = 0; step < 2; step += 1) {
      await browser.electron.execute((electron) =>
        electron.Menu.getApplicationMenu()?.getMenuItemById('zoom-in')?.click(),
      )
    }
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            (document.querySelector('[data-column="col-3"]')?.getBoundingClientRect().left ?? 0) >=
            window.innerWidth,
        ),
      { timeout: 5_000, timeoutMsg: 'the fourth column is on screen' },
    )
    await pressInColumn('col-0', '4')
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const column = document.querySelector('[data-column="col-3"]')
          const box = column?.getBoundingClientRect()
          return (
            box !== undefined &&
            box.right <= window.innerWidth + 1 &&
            document.activeElement === column?.querySelector('webview')
          )
        }),
      { timeout: 5_000, timeoutMsg: 'the fourth column did not come into view with the focus' },
    )
    await browser.electron.execute((electron) =>
      electron.Menu.getApplicationMenu()?.getMenuItemById('reset-zoom')?.click(),
    )
  })

  it('(e) while typing, the keys are text, not shortcuts', async () => {
    const guest = await guestOfColumn('col-0')
    await guestEval(
      guest,
      `(() => { const input = document.createElement('input'); input.id = 'xdeck-e2e-input'; document.body.prepend(input); input.focus(); return true })()`,
    )
    await pressInColumn('col-0', 'n')
    await browser.pause(1_000)
    expect(await $('[data-testid="compose-popup"][data-open="true"]').isExisting()).toBe(false)
    expect(await guestEval<string>(guest, `document.getElementById('xdeck-e2e-input').value`)).toBe(
      'n',
    )
    await guestEval(guest, `document.getElementById('xdeck-e2e-input').remove(); true`)
  })

  it('(f) Help → Keyboard Shortcuts shows them too', async () => {
    await browser.electron.execute((electron) =>
      electron.Menu.getApplicationMenu()?.getMenuItemById('keyboard-shortcuts')?.click(),
    )
    await $('[data-testid="shortcuts-dialog"]').waitForDisplayed({ timeout: 5_000 })
    await waitClosed('shortcuts-dialog')
  })
})
