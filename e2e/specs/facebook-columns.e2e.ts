import { $, browser, expect } from '@wdio/globals'
import { guestEval, guestOfWebview, listPageGuests, partitionOf } from '../helpers/guests'

// Facebook columns without a Facebook login (roadmap §11): it runs offline (CI) and in full runs on
// a fresh, logged-out profile, so it never touches the Facebook test account. The store says a
// Facebook account with the made-up id 100000000000001 is the first one, but its session has no
// cookies: the feed column shows Facebook's login page, the only Facebook page this spec loads.
// Every other column names an account XDeck does not have, so it is a placeholder: its header is
// recognised from the URL, and nothing loads.
// Config: e2e/configs/offline/facebook.json. Store: { facebookAccount: { username: '100000000000001' } }.

const SESSIONS = ['persist:fb', 'persist:ig', 'persist:x', 'persist:custom']

describe('Facebook columns, no login', () => {
  before(async () => {
    await $('[data-testid="column-strip"]').waitForExist({ timeout: 20_000 })
  })

  it('(a) headers are recognised from Facebook URLs; Messenger is not a column of its own', async () => {
    const headers = await browser.execute(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-column]')).map((column) => [
        column.dataset.kind,
        column.querySelector('[data-testid="column-title"]')?.textContent ?? '',
      ]),
    )
    expect(headers).toEqual([
      ['fbFeed', 'Facebook'],
      ['fbNotifications', 'Facebook Notifications'],
      ['fbVideo', 'Facebook Video'],
      ['fbReels', 'Facebook Reels'],
      ['fbGroups', 'Facebook Groups'],
      ['fbGroup', 'Group'],
      ['fbPage', 'meta.page'],
      ['fbPage', 'Facebook profile'],
      ['fbMarketplace', 'Marketplace'],
      ['fbEvents', 'Facebook Events'],
      ['fbSaved', 'Facebook Saved'],
      ['fbSearch', 'Search: cats'],
      ['fbTag', '#cats'],
      ['fbOther', 'Facebook'],
    ])
  })

  it('(b) a column whose Facebook account is not in XDeck offers to add one, and loads no page', async () => {
    const columns = await browser.execute(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-column]'))
        .slice(1)
        .map((column) => ({
          placeholder: column.querySelector('[data-testid="column-placeholder"]') !== null,
          webview: column.querySelector('webview') !== null,
          button: column.querySelector('[data-testid="column-log-in"]')?.textContent ?? '',
        })),
    )
    expect(columns).toHaveLength(13)
    for (const column of columns) {
      expect(column).toEqual({ placeholder: true, webview: false, button: 'Add Facebook account' })
    }
  })

  it("(c) the first account's column loads Facebook in its own session, persist:fb", async () => {
    const guests = await listPageGuests()
    expect(guests.map((guest) => guest.id)).toEqual(['col-0'])
    const guest = guests[0].guestId
    expect(await partitionOf(guest, SESSIONS)).toBe('persist:fb')
    await browser.waitUntil(
      async () => (await guestEval<string>(guest, 'location.hostname')) === 'www.facebook.com',
      { timeout: 20_000, timeoutMsg: 'the column did not load www.facebook.com' },
    )
  })

  it('(d) on Facebook’s login form the column says it is logged out, and Log in opens the login window in persist:fb', async () => {
    await $('[data-column="col-0"] [data-testid="column-logged-out"]').waitForExist({
      timeout: 30_000,
      timeoutMsg: 'the column did not report Facebook’s login form',
    })
    await $('[data-column="col-0"] [data-testid="column-log-in"]').click()
    await $('[data-testid="login-window"][data-network="facebook"]').waitForExist({
      timeout: 5_000,
    })
    const guest = await guestOfWebview('[data-testid="login-window-webview"]')
    expect(await partitionOf(guest, SESSIONS)).toBe('persist:fb')
    await $('[data-testid="login-window"] [data-slot="dialog-close"]').click()
    await $('[data-testid="login-window"]').waitForExist({ reverse: true, timeout: 5_000 })
  })

  it('(e) the page cannot pick a Facebook session main did not make: an unknown id gets persist:fb', async () => {
    const guestId = await browser.execute(
      () =>
        new Promise<number>((resolve) => {
          const probe = document.createElement('webview') as HTMLElement & {
            getWebContentsId(): number
          }
          probe.setAttribute('partition', 'persist:fb-000000000000')
          probe.setAttribute('src', 'https://www.facebook.com/robots.txt')
          probe.addEventListener('dom-ready', () => resolve(probe.getWebContentsId()), {
            once: true,
          })
          probe.style.cssText = 'position:fixed;width:10px;height:10px;left:-20px'
          probe.dataset.testid = 'e2e-probe'
          document.body.appendChild(probe)
        }),
    )
    expect(await partitionOf(guestId, [...SESSIONS, 'persist:fb-000000000000'])).toBe('persist:fb')
    await browser.execute(() => document.querySelector('[data-testid="e2e-probe"]')?.remove())
  })

  it("(f) a link through Facebook's link shim goes to the browser as the page it leads to", async () => {
    const [col0] = await listPageGuests()
    const openExternal = await browser.electron.mock('shell', 'openExternal')
    try {
      // A click in the page first, as when the user clicks a link.
      await browser.electron.execute(async (electron, id: number) => {
        const contents = electron.webContents.fromId(id)
        contents?.sendInputEvent({ type: 'mouseDown', x: 5, y: 5, button: 'left', clickCount: 1 })
        contents?.sendInputEvent({ type: 'mouseUp', x: 5, y: 5, button: 'left', clickCount: 1 })
        await contents?.executeJavaScript(
          "window.open('https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fpage&h=x'); true",
          true,
        )
      }, col0.guestId)
      await browser.pause(1000)
      expect(openExternal).toHaveBeenCalledWith('https://example.com/page')
    } finally {
      await openExternal.mockRestore()
    }
  })

  it("(g) a Facebook column's filters are Hide Reels and muted words", async () => {
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

  it("(h) Add column offers Facebook's columns, with Your profile for the Facebook account", async () => {
    await $('[data-testid="rail-add-column"]').click()
    await $('[data-testid="add-column-dialog"]').waitForDisplayed({ timeout: 5_000 })
    const choices = await browser.execute(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="add-column-section"][data-network="facebook"] [data-testid="add-column-choice"]',
        ),
      ).map((choice) => choice.dataset.choice),
    )
    expect(choices).toEqual([
      'fbFeed',
      'fbNotifications',
      'fbVideo',
      'fbGroups',
      'fbGroup',
      'fbPage',
      'fbMarketplace',
      'fbEvents',
      'fbProfile',
      'fbSaved',
    ])
    await browser.keys('Escape')
    await $('[data-testid="add-column-dialog"]').waitForExist({ reverse: true, timeout: 5_000 })
  })

  it('(i) the accounts menu lists the Facebook account, named "Facebook account" until its page shows its name', async () => {
    await $('[data-testid="rail-more"]').click()
    await $('[data-testid="rail-more-menu"]').waitForDisplayed({ timeout: 5_000 })
    const menu = await browser.execute(() => ({
      rows: Array.from(document.querySelectorAll<HTMLElement>('[data-testid="rail-account"]')).map(
        (row) => [row.dataset.network, row.querySelector('span.truncate')?.textContent ?? ''],
      ),
      add: Array.from(
        document.querySelectorAll('[data-testid="rail-more-menu"] [data-testid^="rail-add-"]'),
      ).map((item) => item.getAttribute('data-testid')),
    }))
    expect(menu).toEqual({
      rows: [['facebook', 'Facebook account']],
      add: ['rail-add-account', 'rail-add-instagram', 'rail-add-facebook'],
    })
    await browser.keys('Escape')
  })
})
