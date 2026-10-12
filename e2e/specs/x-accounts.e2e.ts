import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { listPageGuests, partitionOf } from '../helpers/guests'
import { shownColumns } from '../helpers/layout'
import { guestOfColumn, waitForLoggedInColumns, waitInGuest } from '../helpers/x'

// TASK-023 on real x.com: per-column accounts, like TweetDeck's. Needs a second X account added in
// the E2E profile (pnpm e2e:login, then More → Add X Account…); without one the spec is skipped.
// Each added account has its own session (persist:x-<id>), made by the main process.
// Config: e2e/configs/real/fit.json (forYou and notifications, columnWidth 380).

type Account = { id: string; username: string }

function storedAccounts(): Account[] {
  const dir = process.env.XDECK_USER_DATA
  if (!dir) {
    throw new Error('XDECK_USER_DATA is not set')
  }
  return JSON.parse(readFileSync(join(dir, 'store.json'), 'utf8')).accounts ?? []
}

function savedColumns(): { type: string; account?: string }[] {
  const dir = process.env.XDECK_CONFIG_DIR
  if (!dir) {
    throw new Error('XDECK_CONFIG_DIR is not set')
  }
  return JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).columns
}

/**
 * The logged-in X user of a session: X's twid cookie ("u=<user id>"). A 380 px column uses X's
 * narrow layout, which has no profile link to read a name from.
 */
async function loggedInUser(partition: string): Promise<string | null> {
  const value: unknown = await browser.electron.execute(async (electron, name: string) => {
    const [cookie] = await electron.session.fromPartition(name).cookies.get({ name: 'twid' })
    return cookie?.value ?? null
  }, partition)
  return typeof value === 'string' ? value : null
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

describe('per-column accounts', () => {
  let second: Account | undefined

  before(async function () {
    await waitForLoggedInColumns()
    second = storedAccounts()[0]
    if (!second) {
      console.log('[x-accounts] no second account in the E2E profile; skipped (see pnpm e2e:login)')
      this.skip()
    }
  })

  it('(a) with a second account, headers show each column’s account', async () => {
    const labels = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid="column-account"]')).map(
        (label) => label.textContent,
      ),
    )
    // Both fixture columns show the main account, which is not the second one.
    expect(labels).toHaveLength(2)
    expect(labels[0]).toMatch(/^@[A-Za-z0-9_]{1,15}$/)
    expect(labels[1]).toBe(labels[0])
    expect(labels[0]?.toLowerCase()).not.toBe(`@${(second as Account).username.toLowerCase()}`)
  })

  it('(b) a column added for the second account is logged in as that account, in its own session', async () => {
    const account = second as Account
    await browser.electron.execute((electron) => {
      electron.Menu.getApplicationMenu()?.getMenuItemById('add-column')?.click()
    })
    await $(`[data-testid="add-column-account"][data-account="${account.username}"]`).click()
    await $('[data-testid="add-column-choice"][data-choice="notifications"]').click()
    await browser.waitUntil(async () => (await shownColumns()).length === 3, {
      timeout: 10_000,
      timeoutMsg: 'the column was not added',
    })
    expect(savedColumns()[2]).toEqual({ type: 'notifications', account: account.username })
    await browser.waitUntil(
      async () => (await listPageGuests()).some((guest) => guest.id === 'col-2'),
      { timeout: 15_000, timeoutMsg: 'the new column has no page' },
    )
    const guest = await guestOfColumn('col-2')
    const partitions = ['persist:x', `persist:x-${account.id}`]
    expect(await partitionOf(guest, partitions)).toBe(`persist:x-${account.id}`)
    expect(await partitionOf(await guestOfColumn('col-0'), partitions)).toBe('persist:x')
    // Logged in, as a different X user than the main account, and X shows the page (not a login).
    const mainUser = await loggedInUser('persist:x')
    const secondUser = await loggedInUser(`persist:x-${account.id}`)
    expect(mainUser).toBeTruthy()
    expect(secondUser).toBeTruthy()
    expect(secondUser).not.toBe(mainUser)
    await waitInGuest(
      guest,
      `location.pathname === '/notifications' && !!document.querySelector('[data-testid="primaryColumn"]')`,
      `the column did not show @${account.username}'s notifications`,
    )
  })

  it('(c) Post asks which account posts, and opens the editor in that account’s session', async () => {
    const account = second as Account
    await $('[data-testid="rail-compose"]').click()
    await $(`[data-testid="rail-compose-as"][data-account-id="${account.id}"]`).click()
    const open = '[data-testid="compose-popup"][data-open="true"] [data-testid="compose-webview"]'
    await $(open).waitForExist({ timeout: 5_000 })
    const popup = await browser.execute(
      (selector: string) =>
        (
          document.querySelector(selector) as unknown as { getWebContentsId(): number }
        ).getWebContentsId(),
      open,
    )
    expect(await partitionOf(popup, ['persist:x', `persist:x-${account.id}`])).toBe(
      `persist:x-${account.id}`,
    )
    await escapeInCompose()
  })

  it('(d) the page cannot pick a session main did not make: an unknown account id gets persist:x', async () => {
    const guestId = await browser.execute(
      () =>
        new Promise<number>((resolve) => {
          const probe = document.createElement('webview') as HTMLElement & {
            getWebContentsId(): number
          }
          probe.setAttribute('partition', 'persist:x-000000000000')
          probe.setAttribute('src', 'https://x.com/robots.txt')
          probe.addEventListener('dom-ready', () => resolve(probe.getWebContentsId()), {
            once: true,
          })
          probe.style.cssText = 'position:fixed;width:10px;height:10px;left:-20px'
          probe.dataset.testid = 'e2e-probe'
          document.body.appendChild(probe)
        }),
    )
    expect(await partitionOf(guestId, ['persist:x', 'persist:x-000000000000'])).toBe('persist:x')
    await browser.execute(() => document.querySelector('[data-testid="e2e-probe"]')?.remove())
  })

  it('(e) removing the account shows its column as not logged in, and keeps it in settings.json', async () => {
    const account = second as Account
    await $('[data-testid="rail-more"]').click()
    await $(`[data-testid="rail-remove-account"][data-account-id="${account.id}"]`).click()
    await $('[data-testid="account-remove-confirm"]').click()
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document.querySelector('[data-column="col-2"] [data-testid="column-placeholder"]') !==
            null,
        ),
      { timeout: 10_000, timeoutMsg: 'the column did not become a placeholder' },
    )
    expect(storedAccounts()).toEqual([])
    expect(savedColumns()[2]).toEqual({ type: 'notifications', account: account.username })
  })
})
