import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { guestEval } from '../helpers/guests'
import { pageLoads } from '../helpers/layout'
import { guestOfColumn, waitForLoggedInColumns, waitInGuest } from '../helpers/x'

// TASK-021 on real x.com: per-column filters (TweetDeck's column filters), set from the header menu,
// saved on the column in settings.json, applied by the column preload without reloading the page.
// The timeline's posts are whatever X shows, so each check picks its own evidence from the page.
// Config: e2e/configs/real/fit.json (forYou and notifications, columnWidth 380).

type SavedColumn = { type: string; filters?: Record<string, unknown> }

function savedColumns(): SavedColumn[] {
  const dir = process.env.XDECK_CONFIG_DIR
  if (!dir) {
    throw new Error('XDECK_CONFIG_DIR is not set')
  }
  return (
    JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as { columns: SavedColumn[] }
  ).columns
}

async function openFilters(column: string): Promise<void> {
  await $(`[data-column="${column}"] [data-testid="column-menu"]`).click()
  await $('[data-testid="column-menu-filters"]').click()
  await $('[data-testid="filters-dialog"]').waitForDisplayed({ timeout: 5_000 })
}

/**
 * Empties the muted words with real keys. WebDriver's clear sets the value without the input event
 * React listens for, so the field's state would keep the old words.
 */
async function clearWords(): Promise<void> {
  await $('[data-testid="filter-words"]').click()
  await browser.keys([process.platform === 'darwin' ? 'Meta' : 'Control', 'a'])
  await browser.keys('Backspace')
}

async function save(): Promise<void> {
  await $('[data-testid="filters-save"]').click()
  await $('[data-testid="filters-dialog"]').waitForExist({ reverse: true, timeout: 5_000 })
}

/** Posts in the column's timeline: whether each one is hidden by a filter, and what it has. */
const POSTS = `Array.from(document.querySelectorAll('div[data-testid="cellInnerDiv"]'))
  .filter((cell) => cell.querySelector('article[data-testid="tweet"]'))
  .map((cell) => ({
    hidden: cell.hasAttribute('data-xdeck-filtered'),
    media: !!cell.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="card.layoutLarge.media"], [data-testid="card.layoutSmall.media"]'),
    repost: !!cell.querySelector('[data-testid="socialContext"]')?.closest('a'),
    text: (cell.querySelector('[data-testid="tweetText"]')?.textContent ?? '').toLowerCase(),
  }))`

type Post = { hidden: boolean; media: boolean; repost: boolean; text: string }

describe('column filters', () => {
  let guest = 0
  let loadsBefore: Record<string, number> = {}

  before(async () => {
    await waitForLoggedInColumns()
    guest = await guestOfColumn('col-0')
    loadsBefore = await pageLoads({ 'col-0': guest })
    await waitInGuest(
      guest,
      `document.querySelectorAll('article[data-testid="tweet"]').length >= 3`,
      'the For you timeline shows no posts',
    )
  })

  it('(a) a muted word hides the posts containing it, and is saved on the column', async () => {
    const posts = await guestEval<Post[]>(guest, POSTS)
    // A word from a visible post: long enough to be a real word, not a link or a handle.
    const word = posts
      .flatMap((post) => post.text.split(/\s+/))
      .find((candidate) => /^[a-z]{6,}$/.test(candidate))
    if (!word) {
      throw new Error('no plain word in the visible posts')
    }
    await openFilters('col-0')
    await $('[data-testid="filter-words"]').setValue(word)
    await save()
    expect(savedColumns()[0]).toEqual({ type: 'forYou', filters: { mutedWords: [word] } })
    await expect($('[data-column="col-0"] [data-testid="column-filtered"]')).toExist()
    await browser.waitUntil(
      async () => {
        const now = await guestEval<Post[]>(guest, POSTS)
        return now.every((post) => post.hidden === post.text.includes(word))
      },
      { timeout: 5_000, timeoutMsg: `posts with "${word}" were not the hidden ones` },
    )
  })

  it('(b) media only and hide reposts hide exactly the posts without media, and the reposts', async () => {
    await openFilters('col-0')
    await clearWords()
    await $('[data-testid="filter-media"]').click()
    await $('[data-testid="filter-reposts"]').click()
    await save()
    expect(savedColumns()[0]).toEqual({
      type: 'forYou',
      filters: { hideReposts: true, mediaOnly: true },
    })
    await browser.waitUntil(
      async () => {
        const now = await guestEval<Post[]>(guest, POSTS)
        return now.every((post) => post.hidden === (!post.media || post.repost))
      },
      { timeout: 5_000, timeoutMsg: 'the hidden posts are not the ones without media or reposts' },
    )
  })

  it('(c) turning every filter off shows all posts again, and the column never reloaded', async () => {
    await openFilters('col-0')
    await $('[data-testid="filter-media"]').click()
    await $('[data-testid="filter-reposts"]').click()
    await save()
    expect(savedColumns()[0]).toEqual({ type: 'forYou' })
    await expect($('[data-column="col-0"] [data-testid="column-filtered"]')).not.toExist()
    await browser.waitUntil(
      async () => (await guestEval<Post[]>(guest, POSTS)).every((post) => !post.hidden),
      { timeout: 5_000, timeoutMsg: 'some posts are still hidden' },
    )
    expect(await pageLoads({ 'col-0': guest })).toEqual(loadsBefore)
  })
})
