import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { guestEval, guestOfWebview, listPageGuests, partitionOf } from '../helpers/guests'
import { waitInGuest } from '../helpers/x'

// Instagram on real instagram.com with the Instagram test account (roadmap §9). Meta locks accounts
// readily, so this spec is kept small: one session, one feed column and one Post window (two page
// loads), no login, no reloads, nothing posted, and no rerun loops. Everything that needs no
// Instagram login is in instagram-columns.e2e.ts. Needs the Instagram account in the E2E profile
// (pnpm e2e:login, then More → Add Instagram account…); without one the spec is skipped.
// Config: e2e/configs/real/instagram.json (one Instagram feed column, no X column).

const SESSIONS = ['persist:ig', 'persist:x', 'persist:custom']

/** The Instagram account the session's store.json starts with (seeded from the E2E profile). */
function instagramName(): string | null {
  const dir = process.env.XDECK_USER_DATA ?? ''
  try {
    const name = JSON.parse(readFileSync(join(dir, 'store.json'), 'utf8')).instagramAccount
      ?.username

    return typeof name === 'string' ? name : null
  } catch {
    return null
  }
}

describe('Instagram on real instagram.com', () => {
  let name = ''
  let guest = 0

  before(async function () {
    const stored = instagramName()
    if (!stored) {
      console.log(
        '[instagram] no Instagram account in the E2E profile; skipped (see pnpm e2e:login)',
      )
      this.skip()
    }

    name = stored as string
    await $('[data-testid="column-strip"]').waitForExist({ timeout: 30_000 })
    await browser.waitUntil(async () => (await listPageGuests()).length === 1, {
      timeout: 20_000,
      timeoutMsg: 'the Instagram column has no page',
    })
    guest = (await listPageGuests())[0].guestId
  })

  it('(a) the feed column is logged in, in persist:ig, as the account XDeck has', async () => {
    expect(await partitionOf(guest, SESSIONS)).toBe('persist:ig')
    // Instagram's own link to the account's profile shows only to that logged-in account.
    await waitInGuest(
      guest,
      `location.hostname === 'www.instagram.com' && !!document.querySelector('a[href="/direct/inbox/"]') && !!document.querySelector(${JSON.stringify(`a[href="/${name}/"]`)})`,
      `Instagram did not show @${name}'s feed: the test account may be logged out or checked`,
    )
    expect(await $('[data-column="col-0"] [data-testid="column-logged-out"]').isExisting()).toBe(
      false,
    )
  })

  it("(b) Instagram's top and bottom bars are hidden: the rail is the navigation (TASK-042)", async () => {
    const hidden = await guestEval<{ links: number; shown: number }>(
      guest,
      `(() => {
        const links = Array.from(document.querySelectorAll('a[href="/direct/inbox/"]'))
        return { links: links.length, shown: links.filter((link) => link.checkVisibility()).length }
      })()`,
    )
    expect(hidden.links).toBeGreaterThan(0)
    expect(hidden.shown).toBe(0)
  })

  it('(c) the accounts menu lists the Instagram account', async () => {
    await $('[data-testid="rail-more"]').click()
    await $('[data-testid="rail-more-menu"]').waitForDisplayed({ timeout: 5_000 })
    const rows = await browser.execute(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-testid="rail-account"]'))
        .filter((row) => row.dataset.network === 'instagram')
        .map((row) => row.textContent?.match(/@[A-Za-z0-9._]+/)?.[0]),
    )
    expect(rows[0]).toBe(`@${name}`)
    await browser.keys('Escape')
  })

  it("(d) Post as Instagram opens Instagram's create dialog in persist:ig, and the window closes with it (TASK-044)", async () => {
    await $('[data-testid="rail-compose"]').click()
    await $('[data-testid="rail-compose-as"][data-network="instagram"]').click()
    const popup = await guestOfWebview('[data-testid="instagram-post-webview"]')
    expect(await partitionOf(popup, SESSIONS)).toBe('persist:ig')
    await waitInGuest(
      popup,
      `!!document.querySelector('[role="dialog"]')`,
      "Instagram's create dialog did not open",
    )
    // Its close button can show a moment after the dialog does.
    await waitInGuest(
      popup,
      `[...document.querySelectorAll('svg[aria-label="Close"]')].some((icon) => icon.checkVisibility())`,
      "Instagram's create dialog showed no close button",
    )
    // Instagram's own close button (the visible one) closes its dialog, and XDeck's window with it,
    // clicked with a real mouse event. Nothing is posted.
    const close = await guestEval<{ x: number; y: number } | null>(
      popup,
      `(() => {
        const icons = Array.from(document.querySelectorAll('svg[aria-label="Close"]'))
        const icon = icons.filter((element) => element.checkVisibility()).pop()
        const rect = icon?.getBoundingClientRect()
        return rect ? { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) } : null
      })()`,
    )
    expect(close).not.toBeNull()
    await browser.electron.execute(
      (electron, id: number, point: { x: number; y: number }) => {
        const contents = electron.webContents.fromId(id)
        for (const type of ['mouseDown', 'mouseUp'] as const) {
          contents?.sendInputEvent({ type, x: point.x, y: point.y, button: 'left', clickCount: 1 })
        }
      },
      popup,
      close as { x: number; y: number },
    )
    await $('[data-testid="instagram-post"]').waitForExist({
      reverse: true,
      timeout: 10_000,
      timeoutMsg: "XDeck's Post window stayed open after Instagram's dialog closed",
    })
  })
})
