import { expect } from '@wdio/globals'
import { shownColumns } from '../helpers/layout'
import { waitForLoggedInColumns } from '../helpers/x'

// TASK-013/014: a saved layout is applied at startup. wdio.conf.ts seeds store.json for this spec
// with order [profile, forYou, following, notifications] and forYou resized to 520 px.
// Config: the bundled default (forYou, following, notifications, profile; columnWidth 380).

describe('saved column layout at startup', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('shows the saved order and the saved width', async () => {
    const shown = await shownColumns()
    expect(shown.map((c) => c.id)).toEqual(['col-3', 'col-0', 'col-1', 'col-2'])
    expect(shown.map((c) => c.width)).toEqual([380, 520, 380, 380])
  })
})
