import { browser, expect } from '@wdio/globals'
import { listPageGuests } from '../helpers/guests'
import { waitForLoggedInColumns } from '../helpers/x'

// Roadmap §2 security baseline for <webview> columns, on real x.com (TASK-002 (a)–(g)).
// Config: the bundled default (four x.com columns).

type GuestInfo = { id: number; url: string; prefs: Record<string, unknown>; inPersistX: boolean }

function guestInfo(ids: number[]): Promise<GuestInfo[]> {
  return browser.electron.execute((electron, guestIds: number[]) => {
    const persistX = electron.session.fromPartition('persist:x')
    return guestIds.map((id) => {
      const contents = electron.webContents.fromId(id)
      return {
        id,
        url: contents?.getURL() ?? '',
        // getLastWebPreferences() exists at runtime but not in Electron 44's typings.
        prefs: contents
          ? (
              contents as unknown as { getLastWebPreferences(): Record<string, unknown> }
            ).getLastWebPreferences()
          : {},
        inPersistX: contents?.session === persistX,
      }
    })
  }, ids)
}

function guestCount(): Promise<number> {
  return browser.electron.execute(
    (electron) =>
      electron.webContents.getAllWebContents().filter((c) => c.getType() === 'webview').length,
  )
}

/** Adds a <webview> from the renderer and reports whether a guest attached; then removes it. */
async function probeAttach(src: string, timeoutMs: number): Promise<boolean> {
  const before = await guestCount()
  await browser.execute((url: string) => {
    const probe = document.createElement('webview')
    probe.setAttribute('src', url)
    probe.setAttribute('nodeintegration', '')
    probe.setAttribute('data-probe', 'true')
    document.querySelector('[data-testid="column-strip"]')?.appendChild(probe)
  }, src)
  const attached = await browser
    .waitUntil(async () => (await guestCount()) > before, { timeout: timeoutMs, interval: 250 })
    .then(
      () => true,
      () => false,
    )
  await browser.execute(() => document.querySelector('[data-probe="true"]')?.remove())
  await browser.waitUntil(async () => (await guestCount()) === before, { timeout: 10_000 })
  return attached
}

describe('webview security on real x.com (roadmap §2)', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a+b) the four columns are x.com guests in persist:x, hardened, with the forced preload', async () => {
    const guests = await listPageGuests()
    expect(guests.map((g) => g.id)).toEqual(['col-0', 'col-1', 'col-2', 'col-3'])
    // data-preload-ready comes from our column preload (waitForLoggedInColumns waited for it).
    for (const guest of await guestInfo(guests.map((g) => g.guestId))) {
      expect(new URL(guest.url).hostname).toMatch(/^(www\.)?x\.com$/)
      expect(guest.inPersistX).toBe(true)
      expect(guest.prefs.contextIsolation).toBe(true)
      expect(guest.prefs.sandbox).toBe(true)
      expect(guest.prefs.nodeIntegration).toBe(false)
    }
  })

  it('(c+g) off-origin and lookalike webviews are blocked; www.x.com is allowed', async () => {
    expect(await probeAttach('https://example.com/', 3_000)).toBe(false)
    expect(await probeAttach('https://x.com.evil.example/', 3_000)).toBe(false)
    expect(await probeAttach('https://evilx.com/', 3_000)).toBe(false)
    expect(await probeAttach('https://www.x.com/home', 15_000)).toBe(true)
  })

  it('(d) the persist:x user agent is Chrome, not Electron', async () => {
    const ua = await browser.electron.execute((electron) =>
      electron.session.fromPartition('persist:x').getUserAgent(),
    )
    expect(ua).toContain('Chrome/')
    expect(ua).not.toContain('Electron')
  })

  it('(e0) window.open with no click before it hands nothing to the browser', async () => {
    const [col0] = await listPageGuests()
    const openExternal = await browser.electron.mock('shell', 'openExternal')
    try {
      // A page opening links by itself (TASK-036): only a click or key press lets one through.
      await browser.pause(5_500)
      await browser.electron.execute(async (electron, id: number) => {
        await electron.webContents
          .fromId(id)
          ?.executeJavaScript("window.open('https://example.com/unasked'); true", true)
      }, col0.guestId)
      await browser.pause(1000)
      expect(openExternal).not.toHaveBeenCalled()
    } finally {
      await openExternal.mockRestore()
    }
  })

  it('(e) window.open in an x.com column opens no window and hands the URL to the browser', async () => {
    const [col0] = await listPageGuests()
    const openExternal = await browser.electron.mock('shell', 'openExternal')
    try {
      const windowsBefore = await browser.electron.execute(
        (electron) => electron.BrowserWindow.getAllWindows().length,
      )
      // A click in the page first, as when the user clicks a link.
      await browser.electron.execute(async (electron, id: number) => {
        const contents = electron.webContents.fromId(id)
        contents?.sendInputEvent({ type: 'mouseDown', x: 5, y: 5, button: 'left', clickCount: 1 })
        contents?.sendInputEvent({ type: 'mouseUp', x: 5, y: 5, button: 'left', clickCount: 1 })
        await contents?.executeJavaScript("window.open('https://example.com'); true", true)
      }, col0.guestId)
      await browser.pause(1000)
      expect(
        await browser.electron.execute((electron) => electron.BrowserWindow.getAllWindows().length),
      ).toBe(windowsBefore)
      expect(openExternal).toHaveBeenCalledWith('https://example.com/')
    } finally {
      await openExternal.mockRestore()
    }
  })
})
