import { $, browser, expect } from '@wdio/globals'
import { guestEval, guestOfWebview, partitionOf } from '../helpers/guests'

type WindowInfo = {
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
}

describe('XDeck shell smoke', () => {
  it('(a) window title is XDeck', async () => {
    expect(await browser.getTitle()).toBe('XDeck')
  })

  it('(b) a profile with no account opens on the welcome screen, with one button per network (TASK-043)', async () => {
    await $('[data-testid="welcome"]').waitForExist({ timeout: 20_000 })
    await expect($('[data-testid="welcome"] h1')).toHaveText('Welcome to XDeck')
    const buttons = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid^="welcome-add-"]')).map((button) =>
        button.getAttribute('data-testid'),
      ),
    )
    expect(buttons).toEqual(['welcome-add-x', 'welcome-add-instagram', 'welcome-add-facebook'])
    // No columns, so no column pages either.
    expect(await $('[data-testid="column-strip"]').isExisting()).toBe(false)
  })

  it('(c) main window webPreferences are hardened', async () => {
    const prefs = await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows()[0]
      // getLastWebPreferences() is present at runtime in Electron 44 (verified with a probe app)
      // but missing from the public typings, hence the narrow cast.
      const contents = win.webContents as unknown as {
        getLastWebPreferences(): Record<string, unknown>
      }
      return contents.getLastWebPreferences()
    })
    expect(prefs.contextIsolation).toBe(true)
    expect(prefs.sandbox).toBe(true)
    expect(prefs.nodeIntegration).toBe(false)
    expect(prefs.webviewTag).toBe(true)
  })

  it('(d) window bounds lie fully inside the display work area', async () => {
    const info: WindowInfo = await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows()[0]
      const bounds = win.getBounds()
      const workArea = electron.screen.getDisplayMatching(bounds).workArea
      return { bounds, workArea }
    })
    const { bounds, workArea } = info
    expect(bounds.x).toBeGreaterThanOrEqual(workArea.x)
    expect(bounds.y).toBeGreaterThanOrEqual(workArea.y)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(workArea.x + workArea.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height)
  })

  it('(e) renderer has no require or process globals', async () => {
    const globals = await browser.execute(() => ({
      require: typeof (globalThis as Record<string, unknown>).require,
      process: typeof (globalThis as Record<string, unknown>).process,
    }))
    expect(globals.require).toBe('undefined')
    expect(globals.process).toBe('undefined')
  })

  it('(f) window.open from the renderer opens no new window', async () => {
    const countWindows = () =>
      browser.electron.execute((electron) => electron.BrowserWindow.getAllWindows().length)
    const before = await countWindows()
    await browser.execute(() => {
      window.open('https://example.com')
    })
    await browser.pause(1000)
    expect(await countWindows()).toBe(before)
  })

  it('(g) the app menu has no Hide Ads: XDeck shows X as it is (TASK-038)', async () => {
    const item = await browser.electron.execute(
      (electron) => electron.Menu.getApplicationMenu()?.getMenuItemById('hide-ads') ?? null,
    )
    expect(item).toBeNull()
  })

  it('(h) the app menu has View → Dark Mode and View → Reset Layout', async () => {
    const items = await browser.electron.execute((electron) => {
      const menu = electron.Menu.getApplicationMenu()
      const dark = menu?.getMenuItemById('dark-mode')
      const reset = menu?.getMenuItemById('reset-layout')
      return {
        dark: dark ? { label: dark.label, type: dark.type } : null,
        reset: reset ? reset.label : null,
      }
    })
    expect(items).toEqual({ dark: { label: 'Dark Mode', type: 'checkbox' }, reset: 'Reset Layout' })
  })

  it('(i) the welcome screen fills the window beside the rail, and the shell has nothing to scroll', async () => {
    const box = await browser.execute(() => {
      const rect = document.querySelector('[data-testid="welcome"]')?.getBoundingClientRect()
      const root = document.documentElement
      return {
        rect: rect ? [rect.left, rect.top, rect.width, rect.height].map(Math.round) : null,
        window: [innerWidth, innerHeight],
        scroll: [root.scrollWidth, root.scrollHeight],
      }
    })
    // Below XDeck's 32 px title bar (TASK-024), right of the 68 px rail (TASK-018).
    expect(box.rect).toEqual([68, 32, box.window[0] - 68, box.window[1] - 32])
    expect(box.scroll).toEqual(box.window)
  })

  it("(i2) each welcome button opens its network's login window in that network's first session", async () => {
    for (const [network, partition, host] of [
      ['x', 'persist:x', 'x.com'],
      ['instagram', 'persist:ig', 'www.instagram.com'],
      ['facebook', 'persist:fb', 'www.facebook.com'],
    ]) {
      await $(`[data-testid="welcome-add-${network}"]`).click()
      await $(`[data-testid="login-window"][data-network="${network}"]`).waitForExist({
        timeout: 5_000,
      })
      const guest = await guestOfWebview('[data-testid="login-window-webview"]')
      expect(
        await partitionOf(guest, ['persist:x', 'persist:ig', 'persist:fb', 'persist:custom']),
      ).toBe(partition)
      await browser.waitUntil(
        async () => (await guestEval<string>(guest, 'location.hostname')) === host,
        { timeout: 20_000, timeoutMsg: `the ${network} login window did not load ${host}` },
      )
      // Closing it before a login keeps the welcome screen.
      await $('[data-testid="login-window"] [data-slot="dialog-close"]').click()
      await $('[data-testid="login-window"]').waitForExist({ reverse: true, timeout: 5_000 })
      await expect($('[data-testid="welcome"]')).toExist()
    }
  })

  it('(j) XDeck draws its own title bar, and no menu bar shows on Windows or Linux', async () => {
    const bar = await browser.execute(() => {
      const header = document.querySelector('[data-testid="title-bar"]')
      const rect = header?.getBoundingClientRect()
      const icon = document.querySelector<HTMLImageElement>('[data-testid="title-bar-icon"]')
      return {
        rect: rect ? [rect.top, Math.round(rect.height)] : null,
        drag: header ? getComputedStyle(header).getPropertyValue('-webkit-app-region') : null,
        // The app icon is drawn left of the name, square and legible; macOS has its traffic lights there.
        icon: icon
          ? icon.complete && icon.naturalWidth > 0 && icon.width === icon.height && icon.width >= 12
          : null,
      }
    })
    expect(bar).toEqual({
      rect: [0, 32],
      drag: 'drag',
      icon: process.platform === 'darwin' ? null : true,
    })
    const menuBar = await browser.electron.execute((electron) =>
      electron.BrowserWindow.getAllWindows()[0].isMenuBarVisible(),
    )
    expect(menuBar).toBe(process.platform === 'darwin')
  })
})
