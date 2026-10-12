import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { shownColumns } from '../helpers/layout'
import { waitForLoggedInColumns } from '../helpers/x'

// TASK-022 on real x.com: decks (TweetDeck's), named sets of columns listed at the top of the rail.
// Only the open deck's columns are loaded. Decks are saved in settings.json ("decks"), the open deck
// in store.json. Config: e2e/configs/real/fit.json (forYou and notifications, columnWidth 380).

type Saved = {
  columnWidth?: number
  columns?: unknown[]
  decks?: { name: string; columns: { type: string; url?: string }[] }[]
}

function savedConfig(): Saved {
  const dir = process.env.XDECK_CONFIG_DIR
  if (!dir) {
    throw new Error('XDECK_CONFIG_DIR is not set')
  }
  return JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as Saved
}

function savedActiveDeck(): string | undefined {
  const dir = process.env.XDECK_USER_DATA
  if (!dir) {
    throw new Error('XDECK_USER_DATA is not set')
  }
  return JSON.parse(readFileSync(join(dir, 'store.json'), 'utf8')).activeDeck
}

function railDecks(): Promise<{ name: string; active: boolean }[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-testid="rail-deck"]')).map((tile) => ({
      name: tile.dataset.deckName ?? '',
      active: tile.dataset.active === 'true',
    })),
  )
}

async function nameDeck(name: string): Promise<void> {
  await $('[data-testid="deck-name-dialog"]').waitForDisplayed({ timeout: 5_000 })
  await $('[data-testid="deck-name-input"]').setValue(name)
  await $('[data-testid="deck-name-save"]').click()
}

async function openDeckMenu(): Promise<void> {
  await $('[data-testid="rail-deck"][data-active="true"]').click()
  await $('[data-testid="rail-deck-menu"]').waitForDisplayed({ timeout: 5_000 })
}

function contentWidth(): Promise<number> {
  return browser.electron.execute(
    (electron) => electron.BrowserWindow.getAllWindows()[0].getContentSize()[0],
  )
}

const MAIN_COLUMNS = [{ type: 'forYou' }, { type: 'notifications' }]

describe('decks', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) a columns settings.json is one deck, Main', async () => {
    expect(await railDecks()).toEqual([{ name: 'Main', active: true }])
    expect((await shownColumns()).map((c) => c.title)).toEqual(['For you', 'Notifications'])
    // With one deck there is nothing to tell apart: the title bar shows no deck name.
    expect(await $('[data-testid="title-bar-deck"]').isExisting()).toBe(false)
  })

  it('(b) New deck opens an empty deck, unloads the old columns, and saves decks', async () => {
    const widthBefore = await contentWidth()
    await $('[data-testid="rail-new-deck"]').click()
    await nameDeck('News')
    await $('[data-testid="column-strip-empty"]').waitForDisplayed({ timeout: 5_000 })
    // The window is not fitted again to the empty deck (it would shrink to the rail).
    await browser.pause(500)
    expect(await contentWidth()).toBe(widthBefore)
    // No column pages are left (the Post editor, kept loaded for the next post, is not a column).
    expect(
      await browser.execute(() => document.querySelectorAll('[data-column] webview').length),
    ).toBe(0)
    expect(await railDecks()).toEqual([
      { name: 'Main', active: false },
      { name: 'News', active: true },
    ])
    await expect($('[data-testid="title-bar-deck"]')).toHaveText('News')
    expect(savedConfig()).toEqual({
      columnWidth: 380,
      decks: [
        { name: 'Main', columns: MAIN_COLUMNS },
        { name: 'News', columns: [] },
      ],
    })
  })

  it('(c) a deck name that is taken is refused', async () => {
    await $('[data-testid="rail-new-deck"]').click()
    await nameDeck('news')
    await expect($('[data-testid="deck-name-error"]')).toBeDisplayed()
    await browser.keys('Escape')
    await $('[data-testid="deck-name-dialog"]').waitForExist({ reverse: true, timeout: 5_000 })
    expect(savedConfig().decks).toHaveLength(2)
  })

  it('(d) a column added in a deck is saved in that deck', async () => {
    await $('[data-testid="rail-search"]').click()
    await $('[data-testid="add-column-input"]').setValue('electron')
    await $('[data-testid="add-column-submit"]').click()
    await browser.waitUntil(
      async () => (await shownColumns()).map((c) => c.title).join() === 'Search: electron',
      { timeout: 10_000, timeoutMsg: 'the search column did not appear in the News deck' },
    )
    expect(savedConfig().decks?.[1]).toEqual({
      name: 'News',
      columns: [{ type: 'custom', url: 'https://x.com/search?q=electron&f=live' }],
    })
  })

  it('(e) switching decks shows that deck’s columns and remembers the open deck', async () => {
    await $('[data-testid="rail-deck"][data-deck-key="Main#0"]').click()
    await browser.waitUntil(
      async () => (await shownColumns()).map((c) => c.title).join() === 'For you,Notifications',
      { timeout: 10_000, timeoutMsg: 'the Main deck’s columns did not come back' },
    )
    await browser.waitUntil(async () => savedActiveDeck() === 'Main#0', {
      timeout: 5_000,
      timeoutMsg: 'the open deck was not saved',
    })
  })

  it('(f) Rename Deck renames it in settings.json', async () => {
    await $('[data-testid="rail-deck"][data-deck-key="News#0"]').click()
    await openDeckMenu()
    await $('[data-testid="rail-deck-rename"]').click()
    await $('[data-testid="deck-name-input"]').waitForDisplayed({ timeout: 5_000 })
    await browser.keys([process.platform === 'darwin' ? 'Meta' : 'Control', 'a'])
    await browser.keys('Backspace')
    await nameDeck('World')
    await browser.waitUntil(async () => (await railDecks())[1]?.name === 'World', {
      timeout: 5_000,
      timeoutMsg: 'the deck was not renamed on the rail',
    })
    expect(savedConfig().decks?.map((deck) => deck.name)).toEqual(['Main', 'World'])
  })

  it('(g) Delete Deck removes it after confirming, and opens the first deck', async () => {
    await openDeckMenu()
    await $('[data-testid="rail-deck-delete"]').click()
    await $('[data-testid="deck-delete-confirm"]').click()
    await browser.waitUntil(async () => (await railDecks()).length === 1, {
      timeout: 5_000,
      timeoutMsg: 'the deck was not deleted',
    })
    expect(await railDecks()).toEqual([{ name: 'Main', active: true }])
    expect(savedConfig()).toEqual({
      columnWidth: 380,
      decks: [{ name: 'Main', columns: MAIN_COLUMNS }],
    })
  })
})
