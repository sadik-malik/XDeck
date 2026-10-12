import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { guestEval, listPageGuests } from '../helpers/guests'
import { pageLoads, shownColumns } from '../helpers/layout'
import { guestOfColumn, waitForLoggedInColumns, waitInGuest } from '../helpers/x'

// TASK-015/016 on real x.com: TweetDeck-style column headers (icon, title, click to scroll to the
// top, a menu) and adding and removing columns in the app. Added and removed columns are saved to
// settings.json. Config: e2e/configs/real/fit.json (forYou and notifications, columnWidth 380).

type SavedConfig = { columnWidth?: number; columns: { type: string; url?: string }[] }

function savedConfig(): SavedConfig {
  const dir = process.env.XDECK_CONFIG_DIR
  if (!dir) {
    throw new Error('XDECK_CONFIG_DIR is not set')
  }
  return JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as SavedConfig
}

async function savedLayoutOrder(): Promise<string[]> {
  const layout = await browser.execute(() =>
    (
      window as unknown as { xdeck: { getColumnLayout(): Promise<unknown> } }
    ).xdeck.getColumnLayout(),
  )
  // Saved per deck (TASK-022); a columns settings.json is one deck, Main.
  return (layout as { decks: Record<string, { order: string[] }> }).decks['Main#0']?.order ?? []
}

async function openColumnMenu(column: string): Promise<void> {
  await $(`[data-column="${column}"] [data-testid="column-menu"]`).click()
  await $('[data-testid="column-menu-content"]').waitForDisplayed({ timeout: 5_000 })
}

async function chooseInPicker(choice: string): Promise<void> {
  await $('[data-testid="add-column-dialog"]').waitForDisplayed({ timeout: 5_000 })
  await $(`[data-testid="add-column-choice"][data-choice="${choice}"]`).click()
}

async function waitForTitles(titles: string[]): Promise<void> {
  await browser.waitUntil(
    async () => (await shownColumns()).map((c) => c.title).join('|') === titles.join('|'),
    { timeout: 15_000, timeoutMsg: `the columns did not become ${titles.join(', ')}` },
  )
}

describe('column headers, and adding and removing columns', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) each header shows an icon, the title and a menu button', async () => {
    expect((await shownColumns()).map((c) => c.title)).toEqual(['For you', 'Notifications'])
    const headers = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-column]')).map((column) => ({
        icon: column.querySelector('[data-testid="column-header"] svg') !== null,
        menu: column.querySelector('[data-testid="column-menu"]') !== null,
      })),
    )
    expect(headers).toEqual([
      { icon: true, menu: true },
      { icon: true, menu: true },
    ])
  })

  it('(b) a click on the header scrolls the column back to the top', async () => {
    const guest = await guestOfColumn('col-0')
    // The timeline grows as X loads posts, so keep scrolling until it is well down.
    await browser.waitUntil(
      () => guestEval<boolean>(guest, 'window.scrollBy(0, 1500); window.scrollY > 1000'),
      { timeout: 30_000, interval: 1_000, timeoutMsg: 'the timeline did not scroll down' },
    )
    await $('[data-column="col-0"] [data-testid="column-header"]').click()
    await waitInGuest(guest, 'window.scrollY === 0', 'the header click did not scroll to the top')
  })

  it('(c) View → Add Column… adds a search column at the end and saves it', async () => {
    await browser.electron.execute((electron) => {
      electron.Menu.getApplicationMenu()?.getMenuItemById('add-column')?.click()
    })
    await chooseInPicker('search')
    await $('[data-testid="add-column-input"]').setValue('electron')
    await $('[data-testid="add-column-submit"]').click()
    await $('[data-testid="add-column-dialog"]').waitForDisplayed({ reverse: true, timeout: 5_000 })
    await waitForTitles(['For you', 'Notifications', 'Search: electron'])

    const url = 'https://x.com/search?q=electron&f=live'
    expect(savedConfig()).toEqual({
      columnWidth: 380,
      columns: [{ type: 'forYou' }, { type: 'notifications' }, { type: 'custom', url }],
    })
    await browser.waitUntil(
      async () => (await listPageGuests()).some((guest) => guest.id === 'col-2'),
      { timeout: 15_000, timeoutMsg: 'the search column has no page' },
    )
    await waitInGuest(
      await guestOfColumn('col-2'),
      `location.pathname === '/search' && !!document.querySelector('[data-testid="primaryColumn"]')`,
      'the search column did not load X search',
    )
  })

  it('(d) a bad user name shows an error and adds nothing', async () => {
    await openColumnMenu('col-0')
    await $('[data-testid="column-menu-add-after"]').click()
    await chooseInPicker('user')
    await $('[data-testid="add-column-input"]').setValue('not a user!')
    await $('[data-testid="add-column-submit"]').click()
    await expect($('[data-testid="add-column-error"]')).toBeDisplayed()
    await browser.keys('Escape')
    await $('[data-testid="add-column-dialog"]').waitForDisplayed({ reverse: true, timeout: 5_000 })
    expect(savedConfig().columns).toHaveLength(3)
  })

  it('(e) Add Column to the Right… puts the new column next to that column', async () => {
    await openColumnMenu('col-0')
    await $('[data-testid="column-menu-add-after"]').click()
    await chooseInPicker('bookmarks')
    await waitForTitles(['For you', 'Bookmarks', 'Notifications', 'Search: electron'])
    expect(savedConfig().columns.at(-1)).toEqual({
      type: 'custom',
      url: 'https://x.com/i/bookmarks',
    })
    await browser.waitUntil(
      async () => (await savedLayoutOrder())[1] === 'custom:https://x.com/i/bookmarks#0',
      { timeout: 5_000, timeoutMsg: 'the new place was not saved' },
    )
  })

  it('(f) Remove Column removes it from the strip and settings.json, and reloads no other column', async () => {
    const guests = Object.fromEntries(
      (await listPageGuests())
        .filter((guest) => guest.id === 'col-0' || guest.id === 'col-1')
        .map((guest) => [guest.id, guest.guestId]),
    )
    const before = await pageLoads(guests)
    await openColumnMenu('col-2')
    await $('[data-testid="column-menu-remove"]').click()
    await waitForTitles(['For you', 'Bookmarks', 'Notifications'])
    expect(savedConfig().columns).toEqual([
      { type: 'forYou' },
      { type: 'notifications' },
      { type: 'custom', url: 'https://x.com/i/bookmarks' },
    ])
    expect(await pageLoads(guests)).toEqual(before)
  })
})
