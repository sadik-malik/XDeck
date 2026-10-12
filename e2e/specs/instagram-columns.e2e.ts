import { $, browser, expect } from '@wdio/globals'
import { guestEval, guestOfWebview, listPageGuests, partitionOf } from '../helpers/guests'

// Instagram columns without an Instagram login (TASK-041 to TASK-049): it runs offline (CI) and in
// full runs on a fresh, logged-out profile, so it never touches the Instagram test account. The
// store says an Instagram account named xdeck_e2e is the first one, but its session has no cookies:
// the feed column shows Instagram's login page, the only Instagram page this spec loads. Every other
// column names an account XDeck does not have, so it is a placeholder: its header is recognised
// from the URL, and nothing loads.
// Config: e2e/configs/offline/instagram.json. Store: { instagramAccount: { username: 'xdeck_e2e' } }.

const SESSIONS = ['persist:ig', 'persist:x', 'persist:custom']

describe('Instagram columns, no login', () => {
  before(async () => {
    await $('[data-testid="column-strip"]').waitForExist({ timeout: 20_000 })
  })

  it('(a) headers are recognised from Instagram URLs', async () => {
    const headers = await browser.execute(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-column]')).map((column) => [
        column.dataset.kind,
        column.querySelector('[data-testid="column-title"]')?.textContent ?? '',
      ]),
    )
    expect(headers).toEqual([
      ['igFeed', 'Instagram'],
      ['igReels', 'Instagram Reels'],
      ['igExplore', 'Instagram Explore'],
      ['igNotifications', 'Instagram Notifications'],
      ['igMessages', 'Instagram Messages'],
      ['igUser', '@natgeo'],
      ['igTag', '#cats'],
      ['igSaved', '@absent.acct · Saved'],
      ['igPage', 'Instagram'],
    ])
  })

  it('(b) a column whose Instagram account is not in XDeck offers to add it, and loads no page', async () => {
    const columns = await browser.execute(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-column]'))
        .slice(1)
        .map((column) => ({
          placeholder: column.querySelector('[data-testid="column-placeholder"]') !== null,
          webview: column.querySelector('webview') !== null,
          button: column.querySelector('[data-testid="column-log-in"]')?.textContent ?? '',
        })),
    )
    expect(columns).toHaveLength(8)
    for (const column of columns) {
      expect(column).toEqual({ placeholder: true, webview: false, button: 'Add @absent.acct' })
    }
  })

  it("(c) the first account's column loads Instagram in its own session, persist:ig", async () => {
    const guests = await listPageGuests()
    expect(guests.map((guest) => guest.id)).toEqual(['col-0'])
    const guest = guests[0].guestId
    expect(await partitionOf(guest, SESSIONS)).toBe('persist:ig')
    await browser.waitUntil(
      async () => (await guestEval<string>(guest, 'location.hostname')) === 'www.instagram.com',
      { timeout: 20_000, timeoutMsg: 'the column did not load www.instagram.com' },
    )
  })

  it('(d) on Instagram’s login form the column says it is logged out, and Log in opens the login window in persist:ig', async () => {
    const note = $('[data-column="col-0"] [data-testid="column-logged-out"]')
    await note.waitForExist({
      timeout: 30_000,
      timeoutMsg: 'the column did not report Instagram’s login form',
    })
    await $('[data-column="col-0"] [data-testid="column-log-in"]').click()
    await $('[data-testid="login-window"][data-network="instagram"]').waitForExist({
      timeout: 5_000,
    })
    const guest = await guestOfWebview('[data-testid="login-window-webview"]')
    expect(await partitionOf(guest, SESSIONS)).toBe('persist:ig')
    await $('[data-testid="login-window"] [data-slot="dialog-close"]').click()
    await $('[data-testid="login-window"]').waitForExist({ reverse: true, timeout: 5_000 })
  })

  it('(e) the page cannot pick an Instagram session main did not make: an unknown id gets persist:ig', async () => {
    const guestId = await browser.execute(
      () =>
        new Promise<number>((resolve) => {
          const probe = document.createElement('webview') as HTMLElement & {
            getWebContentsId(): number
          }
          probe.setAttribute('partition', 'persist:ig-000000000000')
          probe.setAttribute('src', 'https://www.instagram.com/robots.txt')
          probe.addEventListener('dom-ready', () => resolve(probe.getWebContentsId()), {
            once: true,
          })
          probe.style.cssText = 'position:fixed;width:10px;height:10px;left:-20px'
          probe.dataset.testid = 'e2e-probe'
          document.body.appendChild(probe)
        }),
    )
    expect(await partitionOf(guestId, [...SESSIONS, 'persist:ig-000000000000'])).toBe('persist:ig')
    await browser.execute(() => document.querySelector('[data-testid="e2e-probe"]')?.remove())
  })

  it("(f) an Instagram column's filters are Hide Reels and muted words (TASK-046)", async () => {
    await $('[data-column="col-0"] [data-testid="column-menu"]').click()
    await $('[data-testid="column-menu-filters"]').click()
    await $('[data-testid="filters-dialog"]').waitForDisplayed({ timeout: 5_000 })
    const fields = await browser.execute(() =>
      ['filter-reels', 'filter-words', 'filter-reposts', 'filter-media'].map(
        (id) =>
          document.querySelector(`[data-testid="filters-dialog"] [data-testid="${id}"]`) !== null,
      ),
    )
    expect(fields).toEqual([true, true, false, false])
    await browser.keys('Escape')
    await $('[data-testid="filters-dialog"]').waitForExist({ reverse: true, timeout: 5_000 })
  })

  it("(g) Add column offers Instagram's columns, with Your profile and Saved for the Instagram account (TASK-049)", async () => {
    await $('[data-testid="rail-add-column"]').click()
    await $('[data-testid="add-column-dialog"]').waitForDisplayed({ timeout: 5_000 })
    const picker = await browser.execute(() => ({
      choices: Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="add-column-section"][data-network="instagram"] [data-testid="add-column-choice"]',
        ),
      ).map((choice) => choice.dataset.choice),
      // One Instagram account and no X account: nothing to choose between.
      accountPickers: document.querySelectorAll('[data-testid="add-column-accounts"]').length,
    }))
    expect(picker.choices).toEqual(
      expect.arrayContaining(['igFeed', 'igReels', 'igUser', 'igTag', 'igProfile', 'igSaved']),
    )
    expect(picker.accountPickers).toBe(0)
    await browser.keys('Escape')
    await $('[data-testid="add-column-dialog"]').waitForExist({ reverse: true, timeout: 5_000 })
  })

  it('(h) the accounts menu lists the Instagram account, and offers to add X and Instagram accounts', async () => {
    await $('[data-testid="rail-more"]').click()
    await $('[data-testid="rail-more-menu"]').waitForDisplayed({ timeout: 5_000 })
    const menu = await browser.execute(() => ({
      rows: Array.from(document.querySelectorAll<HTMLElement>('[data-testid="rail-account"]')).map(
        (row) => [row.dataset.network, row.textContent?.match(/@[A-Za-z0-9._]+/)?.[0]],
      ),
      add: ['rail-add-account', 'rail-add-instagram'].map(
        (id) => document.querySelector(`[data-testid="${id}"]`) !== null,
      ),
    }))
    expect(menu).toEqual({ rows: [['instagram', '@xdeck_e2e']], add: [true, true] })
    await browser.keys('Escape')
  })
})
