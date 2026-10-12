import { $, browser, expect } from '@wdio/globals'
import { guestEval } from '../helpers/guests'
import { waitForLoggedInColumns, waitInGuest } from '../helpers/x'

// TASK-018 on real x.com: XDeck's navigation rail (TweetDeck's): Compose, Search, a button per
// column, Add column, X's account pages and XDeck's settings. Nothing is posted, and Log Out is
// never chosen: the session belongs to the test account.
// Config: the bundled default (forYou, following, notifications, profile; columnWidth 380).

function popupGuest(): Promise<number> {
  return browser.execute(() =>
    (
      document.querySelector('[data-testid="page-popup-webview"]') as unknown as {
        getWebContentsId(): number
      }
    ).getWebContentsId(),
  )
}

/** Post, as the main account when there is more than one (TASK-023). */
async function openPost(): Promise<void> {
  await $('[data-testid="rail-compose"]').click()
  const postAs = $('[data-testid="rail-compose-as"]')
  if (await postAs.isExisting()) {
    await postAs.click()
  }
  await $('[data-testid="compose-popup"][data-open="true"]').waitForExist({ timeout: 5_000 })
}

/** The main account's Post editor (TASK-025): open, or loaded and hidden when `open` is false. */
function composeGuest(open = true): Promise<number> {
  return browser.execute(
    (onlyOpen: boolean) =>
      (
        document.querySelector(
          onlyOpen
            ? '[data-testid="compose-popup"][data-open="true"] [data-testid="compose-webview"]'
            : '[data-testid="compose-popup"] [data-testid="compose-webview"]',
        ) as unknown as { getWebContentsId(): number }
      ).getWebContentsId(),
    open,
  )
}

async function closePopup(): Promise<void> {
  await browser.keys('Escape')
  await $('[data-testid="page-popup"]').waitForExist({ reverse: true, timeout: 5_000 })
}

async function notificationsChecked(): Promise<boolean | undefined> {
  return browser.electron.execute(
    (electron) => electron.Menu.getApplicationMenu()?.getMenuItemById('notifications')?.checked,
  )
}

/**
 * Opens the rail's settings menu. Right after a popup closes, its overlay can still take the first
 * click for a moment, so the click is tried again if the menu did not open.
 */
async function openSettingsMenu(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // A switch in the menu leaves it open; a click on the button would close it.
    if (await $('[data-testid="rail-settings-menu"]').isDisplayed()) {
      return
    }
    await $('[data-testid="rail-settings"]').click()
    if (await $('[data-testid="rail-settings-menu"]').isDisplayed()) {
      return
    }
    await browser.pause(500)
  }
  throw new Error('the settings menu did not open')
}

/** Moves the pointer from wherever it is into the first column's page, through Electron's input. */
async function pointerIntoColumn(): Promise<void> {
  const point = await browser.execute(() => {
    const box = document.querySelector('[data-column] webview')?.getBoundingClientRect()
    return box
      ? { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
      : null
  })
  if (!point) {
    throw new Error('no column page to move into')
  }
  await browser.electron.execute((electron, at: { x: number; y: number }) => {
    electron.BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({
      type: 'mouseMove',
      x: at.x,
      y: at.y,
    })
  }, point)
}

/** Whether the first column's page has the pointer over it (for failure messages). */
async function columnHovered(): Promise<boolean> {
  const id = await browser.execute(() =>
    (
      document.querySelector('[data-column] webview') as unknown as { getWebContentsId(): number }
    ).getWebContentsId(),
  )
  return browser.electron.execute(
    (electron, guest: number) =>
      electron.webContents
        .fromId(guest)
        ?.executeJavaScript(`document.querySelector(':hover') !== null`) ?? false,
    id,
  )
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

describe('navigation rail', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) the rail is 68 px on the left, with Compose, Search, one button per column and Add column', async () => {
    const rail = await browser.execute(() => {
      const box = document.querySelector('[data-testid="nav-rail"]')?.getBoundingClientRect()
      const strip = document.querySelector('[data-testid="column-strip"]')?.getBoundingClientRect()
      const titles = Array.from(document.querySelectorAll('[data-testid="rail-column"]')).map(
        (button) => button.getAttribute('aria-label'),
      )
      const has = (id: string) => document.querySelector(`[data-testid="${id}"]`) !== null
      return {
        box: box ? [box.left, box.width] : null,
        stripLeft: strip?.left,
        titles,
        buttons: [
          'rail-compose',
          'rail-search',
          'rail-add-column',
          'rail-more',
          'rail-settings',
        ].map(has),
      }
    })
    expect(rail.box).toEqual([0, 68])
    expect(rail.stripLeft).toBe(68)
    expect(rail.titles.slice(0, 3)).toEqual(['For you', 'Following', 'Notifications'])
    expect(rail.titles[3]).toMatch(/^@[A-Za-z0-9_]{1,15}$/)
    expect(rail.buttons).toEqual([true, true, true, true, true])
  })

  it('(b) a column button brings that column into view', async () => {
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows()[0]
      const [, height] = win.getContentSize()
      win.setContentSize(900, height)
    })
    await browser.pause(800)
    await $('[data-testid="rail-column"][data-column-key="profile#0"]').click()
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const box = document.querySelector('[data-column="col-3"]')?.getBoundingClientRect()
          return box !== undefined && box.right <= window.innerWidth + 1 && box.left >= 68
        }),
      { timeout: 5_000, timeoutMsg: 'the profile column did not come into view' },
    )
  })

  it('(c) Search opens the add-column picker on Search', async () => {
    await $('[data-testid="rail-search"]').click()
    await $('[data-testid="add-column-input"]').waitForDisplayed({ timeout: 5_000 })
    await expect(
      $('[data-testid="add-column-choice"][data-choice="search"][aria-pressed="true"]'),
    ).toExist()
    await browser.keys('Escape')
    await $('[data-testid="add-column-dialog"]').waitForExist({ reverse: true, timeout: 5_000 })
  })

  it("(d) Post opens X's editor over the columns, sized to it, and Escape closes it", async () => {
    await openPost()
    const guest = await composeGuest()
    await waitInGuest(
      guest,
      `location.pathname === '/compose/post' && !!document.querySelector('[data-testid="tweetTextarea_0"]')`,
      'the post editor did not load',
    )
    // As tall as the editor (its toolbar's bottom plus a little), not a fixed tall box (TASK-025).
    await browser.waitUntil(
      async () => {
        const [box, toolbar] = await Promise.all([
          browser.execute(
            () =>
              document
                .querySelector('[data-testid="compose-popup"][data-open="true"] [role="dialog"]')
                ?.getBoundingClientRect().height ?? 0,
          ),
          guestEval<number>(
            guest,
            `document.querySelector('[data-testid="toolBar"]')?.getBoundingClientRect().bottom ?? 0`,
          ),
        ])
        return toolbar > 0 && box >= toolbar && box <= toolbar + 40
      },
      { timeout: 5_000, timeoutMsg: 'the popup is not sized to the editor' },
    )
    const loadedAt = await guestEval<number>(guest, 'performance.timeOrigin')
    await escapeInCompose()
    // Escape only hid the popup: X kept its editor, so the next Post needs no reload (TASK-035).
    await browser.pause(1_000)
    expect(await guestEval<string>(guest, 'location.pathname')).toBe('/compose/post')
    expect(await guestEval<number>(guest, 'performance.timeOrigin')).toBe(loadedAt)
  })

  it('(d2) Post opens again at once: the editor stays loaded between posts', async () => {
    const guest = await composeGuest(false)
    const loadedAt = await guestEval<number>(guest, 'performance.timeOrigin')
    await openPost()
    expect(await composeGuest()).toBe(guest)
    expect(
      await guestEval<boolean>(
        guest,
        `!!document.querySelector('[data-testid="tweetTextarea_0"]')`,
      ),
    ).toBe(true)
    expect(await guestEval<number>(guest, 'performance.timeOrigin')).toBe(loadedAt)
    await escapeInCompose()
  })

  it("(e) More → X Settings and Privacy opens X's settings; each account has its remove (log out) button", async () => {
    await $('[data-testid="rail-more"]').click()
    await expect($('[data-testid="rail-log-out"]')).toBeDisplayed()
    await $('[data-testid="rail-x-settings"]').click()
    await $('[data-testid="page-popup-webview"]').waitForExist({ timeout: 5_000 })
    const guest = await popupGuest()
    await waitInGuest(guest, `location.pathname.startsWith('/settings')`, 'X settings did not open')
    expect(await guestEval<string>(guest, 'location.hostname')).toBe('x.com')
    await closePopup()
  })

  it('(e2) hovering a rail button shows its name and shortcut key beside it', async () => {
    for (const [id, label, key] of [
      ['rail-search', 'Search', '/'],
      ['rail-compose', 'Post', 'N'],
      ['rail-settings', 'XDeck settings', ''],
    ]) {
      await $(`[data-testid="${id}"]`).moveTo()
      const tip = $('[data-testid="rail-tooltip"]')
      await tip.waitForDisplayed({ timeout: 3_000 })
      // The tooltip slides in from the rail; measure it once it has settled.
      await browser.execute(() =>
        Promise.all(
          (document.querySelector('[data-testid="rail-tooltip"]')?.getAnimations() ?? []).map(
            (animation) => animation.finished,
          ),
        ).then(() => true),
      )
      const shown = await browser.execute(() => {
        const content = document.querySelector('[data-testid="rail-tooltip"]')
        const rail = document.querySelector('[data-testid="nav-rail"]')?.getBoundingClientRect()
        return {
          text: content?.querySelector('span')?.textContent ?? '',
          key: content?.querySelector('kbd')?.textContent ?? '',
          // Beside its button and clear of the rail's edge.
          clear: (content?.getBoundingClientRect().left ?? 0) >= (rail?.right ?? 1e9),
        }
      })
      expect(shown).toEqual({ text: `${label}${key}`, key, clear: true })
      // Straight from the rail into a column page, as a real mouse (WebDriver's moves stop at the
      // shell): the tooltip goes.
      await pointerIntoColumn()
      await tip.waitForExist({
        reverse: true,
        timeout: 3_000,
        timeoutMsg: `the ${label} tooltip stayed up; the column page has the pointer: ${await columnHovered()}`,
      })
    }
    // Column buttons carry their 1–9 key.
    await $('[data-testid="rail-column"]').moveTo()
    await expect($('[data-testid="rail-tooltip"] kbd')).toHaveText('1')
    await pointerIntoColumn()
  })

  it('(f) the settings menu runs the app menu: Desktop Notifications off and on again', async () => {
    const before = await notificationsChecked()
    for (const expected of [!before, before]) {
      await openSettingsMenu()
      await $('[data-testid="rail-notifications"]').click()
      await browser.waitUntil(async () => (await notificationsChecked()) === expected, {
        timeout: 5_000,
        timeoutMsg: `Desktop Notifications did not become ${expected}`,
      })
    }
  })
})
