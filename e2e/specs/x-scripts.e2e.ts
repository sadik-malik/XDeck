import { expect } from '@wdio/globals'
import { guestEval } from '../helpers/guests'
import { guestOfColumn, waitForLoggedInColumns, waitInGuest } from '../helpers/x'

// TASK-006 on real x.com (Swift makeColumn): the For you and Following columns select their home
// tab, and X's side navigation (<header>) is hidden in every X column: XDeck's rail replaces it.
// Config: the bundled default (forYou, following, notifications, profile).

// The same selector as src/column-preload/scripts.ts (X renders the tabs as div[role='tab']).
const TABS = "[role='tablist'] [role='tab']"

function tabSelected(index: number): string {
  return `document.querySelectorAll(${JSON.stringify(TABS)})[${index}]?.getAttribute('aria-selected') === 'true'`
}

const HEADER_DISPLAY = `(() => { const h = document.querySelector('header'); return h ? getComputedStyle(h).display : null })()`

describe('column scripts on real x.com', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) col-0 (For you) has the first home tab selected', async () => {
    const guest = await guestOfColumn('col-0')
    await waitInGuest(guest, tabSelected(0), 'col-0: the For you tab was not selected')
  })

  it('(b) col-1 (Following) has the second home tab selected', async () => {
    const guest = await guestOfColumn('col-1')
    await waitInGuest(guest, tabSelected(1), 'col-1: the Following tab was not selected')
  })

  it("(c) X's side navigation is hidden in every X column (the rail replaces it)", async () => {
    for (const id of ['col-0', 'col-1', 'col-2', 'col-3']) {
      const guest = await guestOfColumn(id)
      await waitInGuest(
        guest,
        "document.querySelector('header') !== null",
        `${id}: no <header> on the page`,
      )
    }
    for (const id of ['col-0', 'col-1', 'col-2', 'col-3']) {
      expect(await guestEval<string | null>(await guestOfColumn(id), HEADER_DISPLAY)).toBe('none')
    }
  })

  it('(d) the page main world has no XDeck globals', async () => {
    const globals = await guestEval<Record<string, string>>(
      await guestOfColumn('col-0'),
      `({ xdeck: typeof xdeck, setFilters: typeof setFilters, waitForElement: typeof waitForElement, ipcRenderer: typeof ipcRenderer, require: typeof require, process: typeof process })`,
    )
    expect(globals).toEqual({
      xdeck: 'undefined',
      setFilters: 'undefined',
      waitForElement: 'undefined',
      ipcRenderer: 'undefined',
      require: 'undefined',
      process: 'undefined',
    })
  })
})
