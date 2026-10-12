import { browser, expect } from '@wdio/globals'
import { settledScreen } from '../helpers/config-screen'

// TASK-004 (f): "Open settings folder" on the config error screen calls shell.openPath with the
// config dir. This spec is its own session because the mock is a main-process call: the electron
// service's main-process bridge is only valid before the first relaunch (see config.e2e.ts). The
// session's first launch reads a broken settings.json, written by wdio.conf.ts beforeSession for
// this spec file. So the app starts on the error screen.

describe('config: open settings folder (TASK-004 (f))', () => {
  it('(f) "Open settings folder" calls shell.openPath with the config dir', async function () {
    this.timeout(90_000)
    const dir = process.env.XDECK_CONFIG_DIR
    if (!dir) {
      throw new Error('XDECK_CONFIG_DIR is not set: wdio.conf.ts beforeSession did not run')
    }
    expect(await settledScreen()).toBe('error')
    const openPath = await browser.electron.mock('shell', 'openPath')
    try {
      await $('[data-testid="config-open-folder"]').click()
      await browser.waitUntil(async () => openPath.mock.calls.length > 0, {
        timeout: 10_000,
        timeoutMsg: 'shell.openPath was not called',
      })
      expect(openPath).toHaveBeenCalledWith(dir)
    } finally {
      await openPath.mockRestore()
    }
  })
})
