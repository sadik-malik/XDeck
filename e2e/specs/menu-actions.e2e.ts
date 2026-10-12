import { $, browser, expect } from '@wdio/globals'

// TASK-009: Check for Updates and the GitHub link (Swift's bottom-toolbar
// links). They don't need X, so this spec starts on the settings error screen (wdio.conf.ts writes a
// broken settings.json for it) and loads no X pages: it adds no load on the test X account.

async function clickMenu(id: string): Promise<void> {
  await browser.electron.execute((electron, itemId: string) => {
    const item = electron.Menu.getApplicationMenu()?.getMenuItemById(itemId)
    if (!item) {
      throw new Error(`menu item ${itemId} is missing`)
    }
    item.click()
  }, id)
}

describe('menu actions without X', () => {
  before(async () => {
    await browser.waitUntil(() => $('[data-testid="config-error"]').isExisting(), {
      timeout: 20_000,
      timeoutMsg: 'the settings error screen did not appear',
    })
  })

  it('(b) Check for Updates reads the latest release and says whether this version is current', async () => {
    const showMessageBox = await browser.electron.mock('dialog', 'showMessageBox')
    await showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false })
    try {
      await clickMenu('check-updates')
      await browser.waitUntil(async () => (await showMessageBox.update()).mock.calls.length > 0, {
        timeout: 20_000,
        timeoutMsg: 'no update dialog',
      })
      // update() copies the calls the main process made into this mock.
      const calls = (await showMessageBox.update()).mock.calls as unknown[][]
      const options = calls[0].find(
        (arg) => typeof arg === 'object' && arg && 'message' in arg,
      ) as {
        message: string
      }
      // The expected answer depends on what GitHub says right now, so the test asks it the same way.
      const latest = await fetch('https://github.com/sadik-malik/XDeck/releases/latest', {
        method: 'HEAD',
        redirect: 'manual',
      })
      const location = latest.headers.get('location') ?? ''
      if (/\/tag\/[0-9]+\.[0-9]+/.test(location)) {
        expect(options.message).toMatch(/^XDeck \d+\.\d+(\.\d+)? (is up to date|is available)\.$/)
      } else if (/\/releases\/?$/.test(location)) {
        expect(options.message).toBe('No XDeck release has been published yet.')
      } else {
        expect(options.message).toBe('Could not check for updates.')
      }
    } finally {
      await showMessageBox.mockRestore()
    }
  })

  it('(c) Help → XDeck on GitHub opens the repository in the browser', async () => {
    const openExternal = await browser.electron.mock('shell', 'openExternal')
    try {
      await clickMenu('github')
      expect(openExternal).toHaveBeenCalledWith('https://github.com/sadik-malik/XDeck')
    } finally {
      await openExternal.mockRestore()
    }
  })
})
