import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, expect } from '@wdio/globals'
import { listPageGuests } from '../helpers/guests'
import { waitForColumnStrip, waitForPreloadsReady } from '../helpers/x'

// TASK-007, TASK-043 on real x.com: a profile whose X login has no user name in store.json (from
// before TASK-043) has it found once, out of sight (XSessionProbe), and opens on the columns; the
// profile column is the logged-in user's own page. This spec always starts without the name
// (FIND_ACCOUNT_SPECS in wdio.conf.ts). Config: the bundled default (forYou, following,
// notifications, profile).

const USERNAME = /^[A-Za-z0-9_]{1,15}$/

describe('login on real x.com', () => {
  it('(a) the logged-in session reaches the columns, and the app keeps the user name it found', async () => {
    await waitForColumnStrip()
    const state = await browser.execute(() => ({
      probe: document.querySelector('[data-testid="x-session-probe"]') !== null,
      welcome: document.querySelector('[data-testid="welcome"]') !== null,
      loginWindow: document.querySelector('[data-testid="login-window"]') !== null,
      // The Swift bottom toolbar was removed (2026-10-10); controls live in the app menu.
      toolbar: document.querySelector('footer') !== null,
      username:
        document.querySelector<HTMLElement>('[data-testid="nav-rail"]')?.dataset.username ?? '',
    }))
    expect(state).toMatchObject({
      probe: false,
      welcome: false,
      loginWindow: false,
      toolbar: false,
    })
    expect(state.username).toMatch(USERNAME)
    // Kept in store.json, so the next launch does not look again.
    const dir = process.env.XDECK_USER_DATA ?? ''
    await browser.waitUntil(
      () => {
        const store = JSON.parse(readFileSync(join(dir, 'store.json'), 'utf8'))
        return store.xAccount?.username === state.username && store.xSessionChecked === true
      },
      { timeout: 5_000, timeoutMsg: 'store.json did not get the user name' },
    )
  })

  it('(b) the four columns load x.com home, home, notifications and the user profile', async () => {
    await waitForPreloadsReady()
    const srcs = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-column] webview')).map(
        (webview) => webview.getAttribute('src') ?? '',
      ),
    )
    expect(srcs.slice(0, 3)).toEqual([
      'https://x.com/home',
      'https://x.com/home',
      'https://x.com/notifications',
    ])
    const profile = new URL(srcs[3])
    expect(profile.origin).toBe('https://x.com')
    expect(profile.pathname.slice(1)).toMatch(USERNAME)
  })

  it('(c) every column stays on x.com and none is sent back to a login page', async () => {
    await waitForPreloadsReady()
    const guests = await listPageGuests()
    const urls = await browser.electron.execute(
      (electron, ids: number[]) => ids.map((id) => electron.webContents.fromId(id)?.getURL() ?? ''),
      guests.map((guest) => guest.guestId),
    )
    for (const url of urls) {
      const parsed = new URL(url)
      expect(['https://x.com', 'https://www.x.com']).toContain(parsed.origin)
      expect(parsed.pathname).not.toMatch(/login|\/i\/flow\//)
    }
  })
})
