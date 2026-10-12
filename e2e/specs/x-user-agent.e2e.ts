import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { $, $$, browser, expect } from '@wdio/globals'
import { guestEval, listPageGuests } from '../helpers/guests'
import { waitForLoggedInColumns } from '../helpers/x'

// TASK-039 on real x.com: Settings → User Agent… picks the user agent every column sends, from a
// list of popular browsers or a custom string. Saving applies it to the column sessions and reloads
// the columns. Config: e2e/configs/real/fit.json (two columns), to keep the reloads light.

type Choice = { kind: string; id?: string; value?: string }

function savedUserAgent(): Choice | undefined {
  const dir = process.env.XDECK_USER_DATA
  if (!dir) {
    throw new Error('XDECK_USER_DATA is not set')
  }

  return JSON.parse(readFileSync(join(dir, 'store.json'), 'utf8')).userAgent
}

function sessionUserAgent(): Promise<string> {
  return browser.electron.execute((electron) =>
    electron.session.fromPartition('persist:x').getUserAgent(),
  )
}

/** The user agent the first column's page reports, once it has reloaded with `expected`. */
async function waitForPageUserAgent(expected: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const [first] = await listPageGuests()
      if (!first) {
        return false
      }

      try {
        return (await guestEval<string>(first.guestId, 'navigator.userAgent')) === expected
      } catch {
        // Mid-reload: the page is not there yet.
        return false
      }
    },
    { timeout: 30_000, interval: 500, timeoutMsg: `the column did not reload as ${expected}` },
  )
}

async function openDialog(): Promise<void> {
  if (!(await $('[data-testid="rail-settings-menu"]').isDisplayed())) {
    await $('[data-testid="rail-settings"]').click()
  }

  await $('[data-testid="rail-user-agent"]').click()
  await $('[data-testid="user-agent-dialog"]').waitForDisplayed({ timeout: 5_000 })
}

async function choose(option: string): Promise<void> {
  await $(`[data-testid="user-agent-option"][data-option="${option}"]`).click()
}

async function save(): Promise<void> {
  await $('[data-testid="user-agent-save"]').click()
  await $('[data-testid="user-agent-dialog"]').waitForExist({ reverse: true, timeout: 5_000 })
}

describe('user agent choice', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) the dialog lists the presets and Custom, with Chrome on this computer chosen', async () => {
    await openDialog()
    const options = await $$('[data-testid="user-agent-option"]').map((option) =>
      option.getAttribute('data-option'),
    )
    expect(options).toEqual([
      'chrome',
      'chrome-windows',
      'chrome-macos',
      'chrome-linux',
      'edge-windows',
      'firefox-windows',
      'firefox-macos',
      'safari-macos',
      'custom',
    ])
    expect(
      await $('[data-testid="user-agent-option"][data-option="chrome"] input').isSelected(),
    ).toBe(true)
    // The default is reduced like real Chrome: the major version, then .0.0.0, and never "Electron".
    const userAgent = await sessionUserAgent()
    expect(userAgent).toMatch(/ Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/)
    expect(userAgent).not.toContain('Electron')
    await browser.keys('Escape')
  })

  it('(b) Edge applies to the session and the reloaded columns, and is saved', async () => {
    await openDialog()
    await choose('edge-windows')
    await save()
    const userAgent = await sessionUserAgent()
    expect(userAgent).toMatch(
      /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) .* Edg\/\d+\.0\.0\.0$/,
    )
    await waitForPageUserAgent(userAgent)
    expect(savedUserAgent()).toEqual({ kind: 'preset', id: 'edge-windows' })
  })

  it('(c) a custom user agent with characters outside printable ASCII is refused', async () => {
    await openDialog()
    await choose('custom')
    const field = $('[data-testid="user-agent-custom"]')
    await field.click()
    await browser.keys(['Control', 'a'])
    await browser.keys('Backspace')
    await field.addValue('Mozilla/5.0 Café')
    await $('[data-testid="user-agent-save"]').click()
    await expect($('[data-testid="user-agent-dialog"] [role="alert"]')).toBeDisplayed()
    expect(await $('[data-testid="user-agent-dialog"]').isDisplayed()).toBe(true)
    await browser.keys('Escape')
  })

  it('(d) main refuses a line break even when the dialog is bypassed', async () => {
    const refused = await browser.execute(() =>
      (window as unknown as { xdeck: { setUserAgent: (choice: unknown) => Promise<void> } }).xdeck
        .setUserAgent({ kind: 'custom', value: 'Mozilla/5.0\r\nX-Injected: 1' })
        .then(
          () => false,
          () => true,
        ),
    )
    expect(refused).toBe(true)
    expect(savedUserAgent()).toEqual({ kind: 'preset', id: 'edge-windows' })
  })

  it('(e) a custom user agent applies, then Chrome on this computer brings back the default', async () => {
    const custom = `${(await sessionUserAgent()).replace(/ Edg\/[\d.]+$/, '')} XDeckE2E/1.0`
    await openDialog()
    await choose('custom')
    const field = $('[data-testid="user-agent-custom"]')
    await field.click()
    await browser.keys(['Control', 'a'])
    await browser.keys('Backspace')
    await field.addValue(custom)
    await save()
    expect(await sessionUserAgent()).toBe(custom)
    await waitForPageUserAgent(custom)
    expect(savedUserAgent()).toEqual({ kind: 'custom', value: custom })

    await openDialog()
    await choose('chrome')
    await save()
    const userAgent = await sessionUserAgent()
    expect(userAgent).toMatch(/ Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/)
    await waitForPageUserAgent(userAgent)
    expect(savedUserAgent()).toEqual({ kind: 'preset', id: 'chrome' })
  })
})
