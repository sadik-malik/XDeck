import { browser, expect } from '@wdio/globals'
import { guestEval } from '../helpers/guests'
import { guestOfColumn, waitForLoggedInColumns } from '../helpers/x'

// TASK-002/002b on real x.com: wheel scrolling chains the right way (horizontal over a column scrolls the strip, vertical scrolls the column). The wheel events are
// synthetic (sendInputEvent); the user's touchpad check remains the source of truth.
// Config: the bundled default (4 columns, 1588 px wide, so the strip overflows the window).

function stripScrollLeft(): Promise<number> {
  return browser.execute(
    () => document.querySelector('[data-testid="column-strip"]')?.scrollLeft ?? -1,
  )
}

/** Sends one wheel event to the middle of a column's guest. */
async function wheel(guestId: number, deltaX: number, deltaY: number): Promise<void> {
  await browser.electron.execute(
    (electron, id: number, dx: number, dy: number) => {
      const guest = electron.webContents.fromId(id)
      if (!guest) {
        throw new Error(`guest ${id} not found`)
      }
      // A real wheel comes with the pointer over the page, so the guest gets a move first.
      guest.sendInputEvent({ type: 'mouseMove', x: 190, y: 400 })
      guest.sendInputEvent({
        type: 'mouseWheel',
        x: 190,
        y: 400,
        deltaX: dx,
        deltaY: dy,
        canScroll: true,
      })
    },
    guestId,
    deltaX,
    deltaY,
  )
  await browser.pause(1500)
}

describe('columns on real x.com', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  // Vertical first: synthetic wheels have no gesture phases, so Chromium keeps a horizontal wheel
  // latched to the strip for the next wheel. A real touchpad ends each gesture.
  // The For you column: its timeline never runs out. Following can be short for an account that
  // follows few people, and then there is nothing to scroll.
  it('(a) a vertical wheel over a column scrolls the column, not the strip', async () => {
    const guest = await guestOfColumn('col-0')
    // The page can only scroll once the timeline is taller than the column.
    await browser.waitUntil(
      () => guestEval<boolean>(guest, 'document.documentElement.scrollHeight > innerHeight + 800'),
      {
        timeout: 45_000,
        interval: 500,
        timeoutMsg: 'col-0: the For you timeline did not load enough to scroll',
      },
    )
    const stripBefore = await stripScrollLeft()
    const pageBefore = await guestEval<number>(guest, 'window.scrollY')
    await wheel(guest, 0, -360)
    expect(await guestEval<number>(guest, 'window.scrollY')).toBeGreaterThan(pageBefore)
    expect(await stripScrollLeft()).toBe(stripBefore)
  })

  it('(b) a horizontal wheel over a column scrolls the strip', async () => {
    await browser.execute(() => {
      const strip = document.querySelector('[data-testid="column-strip"]')
      if (strip) {
        strip.scrollLeft = 0
      }
    })
    const guest = await guestOfColumn('col-1')
    const before = await stripScrollLeft()
    await wheel(guest, -120, 0)
    expect(await stripScrollLeft()).toBeGreaterThan(before)
  })
})
