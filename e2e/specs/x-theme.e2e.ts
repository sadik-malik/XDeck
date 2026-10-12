import { browser, expect } from '@wdio/globals'
import { guestEval, listPageGuests } from '../helpers/guests'
import { pageLoads } from '../helpers/layout'
import { waitForLoggedInColumns } from '../helpers/x'

// TASK-008 on real x.com (Swift ContentView theme): the app chrome follows the theme colour X
// reports, and View → Dark Mode sets X's night_mode cookie, reloads the X columns, and stays
// disabled until X confirms the new theme. Config: the bundled default.

const THEME_META = `document.querySelector('meta[name="theme-color"]')?.getAttribute('content')?.toLowerCase() ?? null`

type Chrome = { bg: string; border: string; text: string; headerBg: string }

function readChrome(): Promise<Chrome> {
  return browser.execute(() => {
    const root = getComputedStyle(document.documentElement)
    const header = document.querySelector('[data-column]')
    return {
      bg: root.getPropertyValue('--app-bg').trim().toLowerCase(),
      border: root.getPropertyValue('--app-border').trim().toLowerCase(),
      text: root.getPropertyValue('--app-text').trim().toLowerCase(),
      headerBg: header ? getComputedStyle(header).backgroundColor : '',
    }
  })
}

type MenuState = { checked: boolean; enabled: boolean }

function darkModeMenu(): Promise<MenuState> {
  return browser.electron.execute((electron) => {
    const item = electron.Menu.getApplicationMenu()?.getMenuItemById('dark-mode')
    return { checked: item?.checked === true, enabled: item?.enabled === true }
  })
}

async function nightModeCookie(): Promise<string | null> {
  // The service's typing wraps an async callback's result in a second Promise; it resolves once.
  return (await browser.electron.execute(async (electron) => {
    const cookies = await electron.session
      .fromPartition('persist:x')
      .cookies.get({ domain: 'x.com', name: 'night_mode' })
    return cookies[0]?.value ?? null
  })) as string | null
}

/** Normalises #rgb to #rrggbb, the form the app uses. */
function hex6(color: string | null): string | null {
  if (!color) {
    return null
  }
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(color)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color
}

/** Waits until the chrome shows exactly the theme colour X has in the leftmost X column. */
async function waitForChromeToFollowX(leftmost: number): Promise<string> {
  let xColor: string | null = null
  await browser.waitUntil(
    async () => {
      xColor = hex6(await guestEval<string | null>(leftmost, THEME_META))
      return xColor !== null && (await readChrome()).bg === xColor
    },
    {
      timeout: 20_000,
      interval: 500,
      timeoutMsg: "the app chrome did not follow X's theme colour",
    },
  )
  return xColor as unknown as string
}

async function toggleDarkMode(): Promise<void> {
  await browser.electron.execute((electron) => {
    const item = electron.Menu.getApplicationMenu()?.getMenuItemById('dark-mode')
    if (!item) {
      throw new Error('View → Dark Mode is not in the app menu')
    }
    item.click()
  })
}

async function switchAndCheck(leftmost: number, guests: Record<string, number>): Promise<void> {
  const before = await darkModeMenu()
  const loadsBefore = await pageLoads(guests)
  await toggleDarkMode()
  const target = !before.checked

  // Disabled while X switches, like the Swift toggle.
  expect(await darkModeMenu()).toEqual({ checked: target, enabled: false })
  // Dark asks for the dark theme X showed last: 1 Dim, 2 Lights out (TASK-028).
  expect(await nightModeCookie()).toMatch(target ? /^[12]$/ : /^0$/)

  // Every X column reloads with the new cookie.
  await browser.waitUntil(
    async () => {
      const loads = await pageLoads(guests)
      return Object.keys(loads).every((id) => loads[id] !== loadsBefore[id])
    },
    { timeout: 20_000, interval: 500, timeoutMsg: 'the X columns did not reload' },
  )
  await waitForLoggedInColumns()
  const xColor = await waitForChromeToFollowX(leftmost)
  expect(xColor !== '#ffffff').toBe(target)
  const chrome = await readChrome()
  expect(chrome.border).toBe(target ? '#38444d' : '#eff3f4')
  expect(chrome.text).toBe(target ? '#8b98a5' : '#536471')
  // X confirmed the theme, so the toggle is enabled again.
  await browser.waitUntil(async () => (await darkModeMenu()).enabled, {
    timeout: 6_000,
    timeoutMsg: 'View → Dark Mode was not enabled again',
  })
  expect((await darkModeMenu()).checked).toBe(target)
}

describe('theme and View → Dark Mode on real x.com', () => {
  let guests: Record<string, number> = {}

  before(async () => {
    await waitForLoggedInColumns()
    guests = Object.fromEntries((await listPageGuests()).map((g) => [g.id, g.guestId]))
  })

  it('(a) the chrome follows the theme colour X reports for the leftmost X column', async () => {
    const xColor = await waitForChromeToFollowX(guests['col-0'])
    const chrome = await readChrome()
    const dark = xColor !== '#ffffff'
    expect(chrome.border).toBe(dark ? '#38444d' : '#eff3f4')
    expect(chrome.text).toBe(dark ? '#8b98a5' : '#536471')
    expect((await darkModeMenu()).checked).toBe(dark)
  })

  it('(b) Dark Mode switches X and the chrome to the other theme', async () => {
    await switchAndCheck(guests['col-0'], guests)
  })

  it('(c) and back again', async () => {
    await switchAndCheck(guests['col-0'], guests)
  })
})
