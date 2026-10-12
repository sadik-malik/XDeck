import { browser, expect } from '@wdio/globals'
import { dragBy, shownColumns } from '../helpers/layout'
import { waitForLoggedInColumns } from '../helpers/x'

// TASK-013/014: View → Reset Layout forgets the dragged order and widths.
// Config: the bundled default (forYou, following, notifications, profile; columnWidth 380).

describe('View → Reset Layout', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('restores the settings.json order and widths', async () => {
    await dragBy('[data-column="col-0"] [data-testid="column-resize-handle"]', -120)
    const shown = await shownColumns()
    const from = shown.find((c) => c.id === 'col-2')
    const to = shown.find((c) => c.id === 'col-0')
    if (!from || !to) {
      throw new Error('columns missing')
    }
    await dragBy(
      '[data-column="col-2"] [data-testid="column-header"]',
      to.left + to.width / 2 - (from.left + from.width / 2),
    )
    const changed = await shownColumns()
    expect(changed.map((c) => c.id)).not.toEqual(['col-0', 'col-1', 'col-2', 'col-3'])

    await browser.electron.execute((electron) => {
      const item = electron.Menu.getApplicationMenu()?.getMenuItemById('reset-layout')
      if (!item) {
        throw new Error('View → Reset Layout is not in the app menu')
      }
      item.click()
    })
    await browser.waitUntil(
      async () => (await shownColumns()).map((c) => c.id).join() === 'col-0,col-1,col-2,col-3',
      { timeout: 5_000, timeoutMsg: 'the order was not reset' },
    )
    expect((await shownColumns()).map((c) => c.width)).toEqual([380, 380, 380, 380])
  })
})
