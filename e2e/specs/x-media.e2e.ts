import { browser, expect } from '@wdio/globals'
import { guestEval } from '../helpers/guests'
import { shownColumns } from '../helpers/layout'
import { guestOfColumn, waitForLoggedInColumns } from '../helpers/x'

// TASK-009 (Swift detectMediaOverlay) on real x.com: opening a photo from a tweet expands that
// column to the whole strip and collapses the others; going back restores the layout. If the For you
// timeline shows no photo tweet, the test is skipped, not passed. Config: the bundled default.

const PHOTO_LINK = 'a[href*="/photo/"]'

function stripWidth(): Promise<number> {
  return browser.execute(
    () =>
      document.querySelector('[data-testid="column-strip"]')?.getBoundingClientRect().width ?? 0,
  )
}

describe('photo opens full width', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('expands the column for a photo, and Back restores the columns', async function () {
    const guest = await guestOfColumn('col-0')
    let found = false
    for (let step = 0; step < 12 && !found; step += 1) {
      found = await guestEval<boolean>(
        guest,
        `!!document.querySelector(${JSON.stringify(PHOTO_LINK)})`,
      )
      if (!found) {
        await guestEval(guest, 'window.scrollBy(0, 1500); true')
        await browser.pause(1500)
      }
    }
    if (!found) {
      console.log('[x-media] no photo tweet in the For you timeline; skipped')
      this.skip()
    }

    await guestEval(guest, `document.querySelector(${JSON.stringify(PHOTO_LINK)}).click(); true`)
    const strip = await stripWidth()
    await browser.waitUntil(
      async () => {
        const columns = await shownColumns()
        const col0 = columns.find((c) => c.id === 'col-0')
        return (
          col0 !== undefined &&
          col0.width > strip - 3 &&
          columns.filter((c) => c.id !== 'col-0').every((c) => c.width === 0)
        )
      },
      { timeout: 10_000, timeoutMsg: 'the column did not expand for the photo' },
    )

    await guestEval(guest, 'history.back(); true')
    await browser.waitUntil(
      async () => (await shownColumns()).map((c) => c.width).join() === '380,380,380,380',
      { timeout: 10_000, timeoutMsg: 'the columns did not come back after Back' },
    )
    expect((await shownColumns()).map((c) => c.id)).toEqual(['col-0', 'col-1', 'col-2', 'col-3'])
  })
})
