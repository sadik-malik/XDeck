import { browser } from '@wdio/globals'
import { guestEval, listPageGuests } from './guests'

// Helpers for the real-x.com specs. Every session starts from a copy of the profile `pnpm e2e:login`
// logged in, with the test account's user name in store.json, so the app opens on the columns.

const NOT_LOGGED_IN =
  'the columns did not appear: the E2E profile is probably not logged in. Run `pnpm e2e:login` and log in to X.'

/** Waits until the column strip shows (for x-login, once the X login was found, TASK-043). */
export async function waitForColumnStrip(): Promise<void> {
  await browser.waitUntil(
    () => browser.execute(() => document.querySelector('[data-testid="column-strip"]') !== null),
    { timeout: 60_000, interval: 500, timeoutMsg: NOT_LOGGED_IN },
  )
}

/** Waits until every page column's preload has reported in. */
export async function waitForPreloadsReady(): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.execute(() => {
        const pages = Array.from(
          document.querySelectorAll<HTMLElement>('[data-column-kind="page"]'),
        )
        return pages.length > 0 && pages.every((el) => el.dataset.preloadReady === 'true')
      }),
    { timeout: 60_000, interval: 500, timeoutMsg: 'the column preloads did not report in' },
  )
}

/**
 * Waits until every x.com column shows X's real app (its primary column), not the splash screen.
 * When X is slow or throttling the account, the columns stay on the splash, and every later check
 * would fail with a misleading message.
 */
export async function waitForXLoaded(): Promise<void> {
  const xGuests = (await listPageGuests()).filter((guest) => guest.id !== '')
  await browser.waitUntil(
    async () => {
      for (const guest of xGuests) {
        const ready = await guestEval<boolean>(
          guest.guestId,
          `!/(^|.)x.com$/.test(location.hostname) || !!document.querySelector('[data-testid="primaryColumn"]')`,
        )
        if (!ready) {
          return false
        }
      }
      return true
    },
    {
      timeout: 60_000,
      interval: 1_000,
      timeoutMsg:
        'X did not finish loading in every column (still on the splash screen). X may be slow or rate-limiting the test account.',
    },
  )
}

/** Login + columns + preloads + X loaded: the state every real-X spec starts from. */
export async function waitForLoggedInColumns(): Promise<void> {
  await waitForColumnStrip()
  await waitForPreloadsReady()
  await waitForXLoaded()
}

/** The guest webContents id of a column (col-N). */
export async function guestOfColumn(id: string): Promise<number> {
  const guest = (await listPageGuests()).find((g) => g.id === id)
  if (!guest) {
    throw new Error(`no page guest for ${id}`)
  }
  return guest.guestId
}

/** Waits until a condition, evaluated in a guest's main world, is true. */
export async function waitInGuest(
  guestId: number,
  script: string,
  timeoutMsg: string,
  timeout = 45_000,
): Promise<void> {
  await browser.waitUntil(
    () => guestEval<boolean>(guestId, script).then((value) => value === true),
    {
      timeout,
      interval: 500,
      timeoutMsg,
    },
  )
}

/** A column container's width and its <webview>'s height, CSS px, read in the renderer. */
export type ColumnBox = { id: string; width: number; webviewHeight: number }

export function readColumnBoxes(): Promise<ColumnBox[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-column]')).map((container) => ({
      id: container.dataset.column ?? '',
      width: container.getBoundingClientRect().width,
      webviewHeight: container.querySelector('webview')?.getBoundingClientRect().height ?? 0,
    })),
  )
}

/**
 * The guest page's own viewport, CSS px. X's layout is drawn into exactly this area, so a viewport
 * bigger than the column box means the page is clipped (the sub-pixel issue of TASK-002c/005).
 */
export function guestViewport(guestId: number): Promise<{ width: number; height: number }> {
  return guestEval(guestId, '({ width: window.innerWidth, height: window.innerHeight })')
}
