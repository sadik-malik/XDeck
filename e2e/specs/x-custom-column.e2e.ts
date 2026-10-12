import { browser, expect } from '@wdio/globals'
import { listPageGuests } from '../helpers/guests'
import { readColumnBoxes, waitForLoggedInColumns } from '../helpers/x'

// TASK-005: a custom non-X column (Swift allows any URL). It is as wide as the X column, and it
// lives in persist:custom so it never sees the X cookies.
// Config: e2e/configs/real/custom.json (custom https://example.com/, then forYou; columnWidth 380).

describe('custom non-X column', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) both columns are columnWidth wide', async () => {
    expect((await readColumnBoxes()).map((box) => box.width)).toEqual([380, 380])
  })

  it('(b) the custom column is in persist:custom and the X column in persist:x', async () => {
    const guests = await listPageGuests()
    const partitions = await browser.electron.execute(
      (electron, ids: number[]) => {
        const x = electron.session.fromPartition('persist:x')
        const custom = electron.session.fromPartition('persist:custom')
        return ids.map((id) => {
          const s = electron.webContents.fromId(id)?.session
          return s === x ? 'persist:x' : s === custom ? 'persist:custom' : 'other'
        })
      },
      guests.map((g) => g.guestId),
    )
    expect(partitions).toEqual(['persist:custom', 'persist:x'])
  })

  it('(c) the custom column has no X cookies', async () => {
    const [custom] = await listPageGuests()
    const count = await browser.electron.execute(async (electron, id: number) => {
      const contents = electron.webContents.fromId(id)
      const cookies = await contents?.session.cookies.get({ domain: 'x.com' })
      return cookies?.length ?? -1
    }, custom.guestId)
    expect(count).toBe(0)
  })

  it('(d) the custom column cannot go full screen (only X pages can)', async () => {
    const [custom] = await listPageGuests()
    const entered = await browser.electron.execute(
      (electron, id: number) =>
        electron.webContents.fromId(id)?.executeJavaScript(
          // Refused or left unanswered: either way the page does not go full screen.
          `Promise.race([
              document.documentElement.requestFullscreen().then(() => true, () => false),
              new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
            ]).then((entered) => entered || document.fullscreenElement !== null)`,
          true,
        ),
      custom.guestId,
    )
    expect(entered).toBe(false)
    expect(
      await browser.electron.execute((electron) =>
        electron.BrowserWindow.getAllWindows()[0].isFullScreen(),
      ),
    ).toBe(false)
  })
})
