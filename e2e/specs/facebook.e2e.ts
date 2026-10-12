import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { guestEval, guestOfWebview, listPageGuests, partitionOf } from '../helpers/guests'
import { waitInGuest } from '../helpers/x'

// Facebook on real facebook.com with the Facebook test account (roadmap §11). Meta locks accounts
// readily, so this spec is kept small: one session, one feed column and one Post window (two page
// loads), no login, no reloads, nothing posted, and no rerun loops. Everything that needs no
// Facebook login is in facebook-columns.e2e.ts. Needs the Facebook account in the E2E profile
// (pnpm e2e:login, then More → Add Facebook account…); without one the spec is skipped.
// Config: e2e/configs/real/facebook.json (one Facebook feed column, no X column).

const SESSIONS = ['persist:fb', 'persist:ig', 'persist:x', 'persist:custom']

/** The session's store.json: the Facebook account it starts with, and the labels kept since. */
function store(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(process.env.XDECK_USER_DATA ?? '', 'store.json'), 'utf8'))
  } catch {
    return {}
  }
}

function facebookId(): string | null {
  const id = (store().facebookAccount as { username?: unknown } | null)?.username

  return typeof id === 'string' ? id : null
}

describe('Facebook on real facebook.com', () => {
  let id = ''
  let guest = 0

  before(async function () {
    const stored = facebookId()
    if (!stored) {
      console.log('[facebook] no Facebook account in the E2E profile; skipped (see pnpm e2e:login)')
      this.skip()
    }

    id = stored as string
    await $('[data-testid="column-strip"]').waitForExist({ timeout: 30_000 })
    await browser.waitUntil(async () => (await listPageGuests()).length === 1, {
      timeout: 20_000,
      timeoutMsg: 'the Facebook column has no page',
    })
    guest = (await listPageGuests())[0].guestId
  })

  it("(a) the feed column is logged in, in persist:fb, and shows Facebook's feed", async () => {
    expect(await partitionOf(guest, SESSIONS)).toBe('persist:fb')
    await waitInGuest(
      guest,
      `location.hostname === 'www.facebook.com' && !!document.querySelector('div[role="main"] div[role="region"] div[role="button"]')`,
      "Facebook did not show the feed's post box: the test account may be logged out or checked",
    )
    expect(await $('[data-column="col-0"] [data-testid="column-logged-out"]').isExisting()).toBe(
      false,
    )
  })

  it("(b) Facebook's top bar and Messenger button are hidden, and the page starts at the top", async () => {
    const layout = await guestEval<{ banner: boolean; messenger: boolean; mainTop: number }>(
      guest,
      `(() => ({
        banner: [...document.querySelectorAll('div[role="banner"]')].some((bar) => bar.checkVisibility()),
        messenger: [...document.querySelectorAll('div[role="button"]:has(path[d^="M17.99.93a1.75"])')].some((button) => button.checkVisibility()),
        mainTop: Math.round(document.querySelector('div[role="main"]').getBoundingClientRect().top + scrollY),
      }))()`,
    )
    expect(layout.banner).toBe(false)
    expect(layout.messenger).toBe(false)
    expect(layout.mainTop).toBeLessThan(20)
  })

  it("(c) the account is named by its Facebook name, from the page's data, and kept", async () => {
    await browser.waitUntil(
      () => {
        const labels = (store().accountLabels as Record<string, Record<string, string>>) ?? {}
        return typeof labels.facebook?.[id] === 'string'
      },
      { timeout: 20_000, timeoutMsg: "the Facebook account's name was not kept" },
    )
    const name = (store().accountLabels as Record<string, Record<string, string>>).facebook[id]
    await $('[data-testid="rail-more"]').click()
    await $('[data-testid="rail-more-menu"]').waitForDisplayed({ timeout: 5_000 })
    const rows = await browser.execute(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-testid="rail-account"]'))
        .filter((row) => row.dataset.network === 'facebook')
        .map((row) => row.querySelector('span.truncate')?.textContent ?? ''),
    )
    expect(rows).toEqual([name])
    expect(name).not.toBe('Facebook account')
    await browser.keys('Escape')
  })

  it("(d) Post as Facebook opens Facebook's create-post dialog in persist:fb, and the window closes with it", async () => {
    await $('[data-testid="rail-compose"]').click()
    await $('[data-testid="rail-compose-as"][data-network="facebook"]').click()
    const popup = await guestOfWebview('[data-testid="facebook-post-webview"]')
    expect(await partitionOf(popup, SESSIONS)).toBe('persist:fb')
    await waitInGuest(
      popup,
      `[...document.querySelectorAll('div[role="dialog"]')].some((dialog) => dialog.checkVisibility() && dialog.querySelector('[contenteditable="true"]'))`,
      "Facebook's create-post dialog did not open",
    )
    // Facebook's own close button (the test account's language is English), clicked with a real
    // mouse event. Nothing is typed or posted.
    const close = await guestEval<{ x: number; y: number } | null>(
      popup,
      `(() => {
        const button = [...document.querySelectorAll('div[role="dialog"] [role="button"][aria-label^="Close"]')]
          .filter((element) => element.checkVisibility())
          .pop()
        const rect = button?.getBoundingClientRect()
        return rect ? { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) } : null
      })()`,
    )
    expect(close).not.toBeNull()
    await browser.electron.execute(
      (electron, contentsId: number, point: { x: number; y: number }) => {
        const contents = electron.webContents.fromId(contentsId)
        for (const type of ['mouseDown', 'mouseUp'] as const) {
          contents?.sendInputEvent({ type, x: point.x, y: point.y, button: 'left', clickCount: 1 })
        }
      },
      popup,
      close as { x: number; y: number },
    )
    await $('[data-testid="facebook-post"]').waitForExist({
      reverse: true,
      timeout: 10_000,
      timeoutMsg: "XDeck's Post window stayed open after Facebook's dialog closed",
    })
  })
})
