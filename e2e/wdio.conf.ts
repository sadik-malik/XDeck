import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser } from '@wdio/globals'
import type { Options } from '@wdio/types'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const artifactsDir = join(root, 'e2e', 'artifacts')

// The suite runs against real x.com with a real account. `pnpm e2e:login` stores a logged-in profile
// outside the repo once (e2e/real-login.mjs), and every worker session starts from a fresh copy of it,
// so a session can change settings or cookies without affecting the next one.
// Same rule as e2e/profile.mjs (wdio compiles this config to CJS, which cannot import that .mjs).
const profileDir =
  process.env.XDECK_E2E_PROFILE ||
  join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.xdeck-e2e', 'profile')

/** The cookie store of the persist:x partition, which holds the X session. */
const xCookieStore = join(profileDir, 'Partitions', 'x', 'Network', 'Cookies')

// Profile parts that are not needed and can be large or locked: caches and Chromium's lock files.
const SKIP_IN_COPY = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  'ShaderCache',
  'Crashpad',
  'Singleton',
  'lockfile',
]

// The settings.json each spec file starts with. The app reads its config once per launch, so a spec
// that needs other columns gets its own worker session. Files not listed start with the bundled
// default (forYou, following, notifications, profile, columnWidth 380).
const SPEC_CONFIGS: Record<string, string> = {
  'x-layout-fill.e2e.ts': 'real/fill.json',
  'x-custom-column.e2e.ts': 'real/custom.json',
  'x-fit.e2e.ts': 'real/fit.json',
  'x-add-column.e2e.ts': 'real/fit.json',
  'x-notifications.e2e.ts': 'real/fit.json',
  'x-column-filters.e2e.ts': 'real/fit.json',
  'x-decks.e2e.ts': 'real/fit.json',
  'x-accounts.e2e.ts': 'real/fit.json',
  'x-user-agent.e2e.ts': 'real/fit.json',
  'instagram-columns.e2e.ts': 'offline/instagram.json',
  'instagram.e2e.ts': 'real/instagram.json',
  'facebook-columns.e2e.ts': 'offline/facebook.json',
  'facebook.e2e.ts': 'real/facebook.json',
}

// store.json seeded into a spec's profile copy (app settings and the saved column layout).
const SPEC_STORES: Record<string, object> = {
  'x-column-persist.e2e.ts': {
    columnLayout: {
      order: ['profile#0', 'forYou#0', 'following#0', 'notifications#0'],
      widths: { 'forYou#0': 520 },
    },
  },
  // An Instagram account with no session behind it: the spec loads only Instagram's login page.
  'instagram-columns.e2e.ts': { instagramAccount: { username: 'xdeck_e2e' } },
  // A Facebook account with a made-up id and no session: the spec loads only Facebook's login page.
  'facebook-columns.e2e.ts': { facebookAccount: { username: '100000000000001' } },
}

// XDECK_E2E_OFFLINE=1 runs only the specs that don't need a logged-in account (no CI runs them now), on a
// fresh profile: the app still opens x.com's login page, but nothing logs in.
const OFFLINE = process.env.XDECK_E2E_OFFLINE === '1'
const OFFLINE_SPECS = [
  './specs/smoke.e2e.ts',
  './specs/config.e2e.ts',
  './specs/config-open-folder.e2e.ts',
  './specs/menu-actions.e2e.ts',
  './specs/instagram-columns.e2e.ts',
  './specs/facebook-columns.e2e.ts',
]

// Specs that need no logged-in X account start from a fresh, logged-out profile even in full runs:
// the app stays on X's login page, so it never swaps the login webview for the columns (that swap
// can crash chromedriver mid-command, and config.e2e relaunches about 20 times), and they load no
// timelines on the test account.
const LOGGED_OUT_SPECS = OFFLINE_SPECS.map((spec) => basename(spec))

/** The profile's store.json, or an empty object. */
function profileStore(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(profileDir, 'store.json'), 'utf8'))
  } catch {
    return {}
  }
}

/** The X accounts added in the E2E profile at login (store.json `accounts`), or none. */
function profileAccounts(): unknown[] {
  const stored = profileStore().accounts
  return Array.isArray(stored) ? stored : []
}

// Specs that use the Instagram or Facebook test account (More → Add Instagram account… or Add
// Facebook account… in `pnpm e2e:login`). Only they get the profile's accounts of that network;
// every other spec starts without them, so no other spec loads that network's pages on the test
// account (Meta locks accounts readily).
const META_SPECS: Record<string, string[]> = {
  'instagram.e2e.ts': ['instagramAccount', 'instagramAccounts'],
  'facebook.e2e.ts': ['facebookAccount', 'facebookAccounts', 'accountLabels'],
}

/** The profile's store.json entries a spec's network needs, for the specs that use them. */
function profileMetaAccounts(spec: string): Record<string, unknown> {
  const stored = profileStore()
  return Object.fromEntries(
    (META_SPECS[spec] ?? []).filter((key) => stored[key] != null).map((key) => [key, stored[key]]),
  )
}

// The test account's user name. The app keeps the first X account in store.json (TASK-043), and the
// profile copy gets it from there, or from this file beside the profile, written by the first session
// that found the name (`pnpm e2e:login` deletes it). Without either, the app looks the name up on X's
// home page out of sight, one more X page load: X limits how often an account loads its pages.
// Same name as in e2e/profile.mjs.
const usernameFile = `${profileDir}-username.txt`
const USERNAME = /^[A-Za-z0-9_]{1,15}$/

// Specs that test the app finding an older profile's X login always start without the name.
const FIND_ACCOUNT_SPECS = ['x-login.e2e.ts']

/** Whether this worker's session started with the user name in store.json. */
let usernameSeeded = false

/** The test account's user name: the profile's own store.json, then the cached file, or null. */
function knownUsername(): string | null {
  try {
    const stored = JSON.parse(readFileSync(join(profileDir, 'store.json'), 'utf8')).xAccount
      ?.username
    if (typeof stored === 'string' && USERNAME.test(stored)) {
      return stored
    }
  } catch {
    // No store.json: try the cached file.
  }
  try {
    const name = readFileSync(usernameFile, 'utf8').trim()
    return USERNAME.test(name) ? name : null
  } catch {
    return null
  }
}

type ChromeCapability = {
  'goog:chromeOptions'?: { args?: string[] }
}

export const config: Options.Testrunner & Record<string, unknown> = {
  runner: 'local',
  // The specs on the bundled default config share one app launch, so the suite loads x.com fewer
  // times. Each launch loads four X columns, and a full run used to launch about 40 times, which
  // risks X slowing down or flagging the test account. Order matters inside the group: x-layout
  // resizes the window, so it runs last.
  specs: OFFLINE
    ? OFFLINE_SPECS
    : [
        [
          './specs/x-login.e2e.ts',
          './specs/x-scripts.e2e.ts',
          './specs/x-security.e2e.ts',
          './specs/x-columns.e2e.ts',
          './specs/x-shortcuts.e2e.ts',
          // Resizes the window, like x-layout, so it runs near the end.
          './specs/x-rail.e2e.ts',
          './specs/x-layout.e2e.ts',
        ],
        './specs/smoke.e2e.ts',
        './specs/config.e2e.ts',
        './specs/config-open-folder.e2e.ts',
        './specs/menu-actions.e2e.ts',
        './specs/instagram-columns.e2e.ts',
        './specs/facebook-columns.e2e.ts',
        './specs/x-layout-fill.e2e.ts',
        './specs/x-custom-column.e2e.ts',
        './specs/x-column-layout.e2e.ts',
        './specs/x-column-reset.e2e.ts',
        './specs/x-column-persist.e2e.ts',
        // Own session: it reloads every X column and changes the night_mode cookie.
        './specs/x-theme.e2e.ts',
        // Own sessions: zoom and reload change every column; fit resizes the window; media expands one.
        './specs/x-view.e2e.ts',
        './specs/x-fit.e2e.ts',
        './specs/x-media.e2e.ts',
        // Own session: it writes settings.json.
        './specs/x-add-column.e2e.ts',
        // Own session: it changes every column session's user agent and reloads the columns.
        './specs/x-user-agent.e2e.ts',
        // Own session: it blurs the window and changes the unread count.
        './specs/x-notifications.e2e.ts',
        // Own session: it writes settings.json.
        './specs/x-column-filters.e2e.ts',
        // Own session: it writes settings.json.
        './specs/x-decks.e2e.ts',
        // Own session: it adds a column for the second account and removes that account.
        './specs/x-accounts.e2e.ts',
        // Own session, on the Instagram test account: one feed column and one Post window.
        './specs/instagram.e2e.ts',
        // Own session, on the Facebook test account: one feed column and one Post window.
        './specs/facebook.e2e.ts',
      ],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        // The built app (pnpm build), not a packaged binary.
        appEntryPoint: join(root, 'out', 'main', 'index.js'),
        // Calls into the main process (browser.electron.execute) wait for it to answer. Real x.com can keep
        // a column busy for a while, so the 10 s default timed out now and then.
        cdpBridgeTimeout: 45_000,
      },
    },
  ],
  services: ['electron'],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    // Real x.com over the network is slower than a local page.
    timeout: 120_000,
  },
  // Fail fast if chromedriver cannot start the app (default is 120 s of retries).
  connectionRetryTimeout: 30_000,
  connectionRetryCount: 1,
  logLevel: 'warn',
  bail: 0,

  onPrepare: () => {
    if (!OFFLINE && !existsSync(xCookieStore)) {
      throw new Error(
        `No logged-in X profile at ${profileDir}. Run \`pnpm e2e:login\` once and log in to X first.`,
      )
    }
  },

  beforeSession: (_config, capabilities, specs) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'xdeck-e2e-'))
    const loggedOut = OFFLINE || specs.every((spec) => LOGGED_OUT_SPECS.includes(basename(spec)))
    if (!loggedOut) {
      cpSync(profileDir, userDataDir, {
        recursive: true,
        filter: (source) => {
          const name = source.slice(profileDir.length).split(sep).filter(Boolean)
          return !name.some((part) => SKIP_IN_COPY.some((skip) => part.startsWith(skip)))
        },
      })
    }
    process.env.XDECK_USER_DATA = userDataDir
    const findsAccount =
      loggedOut || specs.some((spec) => FIND_ACCOUNT_SPECS.includes(basename(spec)))
    const username = findsAccount ? null : knownUsername()
    usernameSeeded = username !== null
    // Notifications are recorded in the main process instead of shown on the desktop.
    process.env.XDECK_NOTIFY_DRY_RUN = '1'
    const store = specs.map((spec) => SPEC_STORES[basename(spec)]).find(Boolean)
    // Every other spec starts with the default layout and settings, whatever the login left. The
    // accounts added at login (More → Add X Account, TASK-023) are kept: their sessions are in the
    // profile copy, and x-accounts.e2e.ts needs one.
    const accounts = loggedOut ? [] : profileAccounts()
    const xAccount = username ? { xAccount: { username }, xSessionChecked: true } : {}
    const meta = loggedOut
      ? {}
      : Object.assign({}, ...specs.map((spec) => profileMetaAccounts(basename(spec))))
    writeFileSync(
      join(userDataDir, 'store.json'),
      JSON.stringify({ ...store, accounts, ...xAccount, ...meta }),
    )
    // Every session gets its own config dir, so the real ~/.config/XDeck is never read or written.
    const configDir = mkdtempSync(join(tmpdir(), 'xdeck-e2e-config-'))
    process.env.XDECK_CONFIG_DIR = configDir
    // The open-folder spec must start on the error screen, so its first launch reads a broken file.
    // menu-actions also starts there, so it loads no X pages.
    if (specs.some((spec) => /config-open-folder\.e2e|menu-actions\.e2e/.test(spec))) {
      writeFileSync(join(configDir, 'settings.json'), '{ "columns": [ }\n')
    }
    const fixture = specs.map((spec) => SPEC_CONFIGS[basename(spec)]).find(Boolean)
    if (fixture) {
      writeFileSync(
        join(configDir, 'settings.json'),
        readFileSync(join(root, 'e2e', 'configs', fixture)),
      )
    }
    // Chromedriver waits for DevToolsActivePort inside --user-data-dir. Electron's userData is
    // moved to XDECK_USER_DATA by the test hook, so both must name the same directory.
    const list = (Array.isArray(capabilities) ? capabilities : [capabilities]) as ChromeCapability[]
    for (const capability of list) {
      const chromeOptions = capability['goog:chromeOptions'] ?? {}
      chromeOptions.args = [...(chromeOptions.args ?? []), `--user-data-dir=${userDataDir}`]
      capability['goog:chromeOptions'] = chromeOptions
    }
  },

  // chromedriver lists XDeck's <webview> pages as windows too, and the electron service can start
  // the session on one of them. x-login's hidden X page (XSessionProbe) goes away a few seconds in,
  // and a session left on it ends there (2026-10-12). Every session drives the shell window.
  before: async () => {
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle)
      if ((await browser.getUrl()).startsWith('file:')) {
        return
      }
    }
  },

  // On failure: a real window pixel capture (BrowserWindow.capturePage) and the renderer console log.
  afterTest: async (test, _context, result) => {
    if (result.passed) {
      return
    }
    const name = test.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    mkdirSync(artifactsDir, { recursive: true })
    try {
      const png = await browser.electron.execute(async (electron) => {
        const win = electron.BrowserWindow.getAllWindows()[0]
        if (!win) {
          return null
        }
        const image = await win.capturePage()
        return image.toPNG().toString('base64')
      })
      if (png) {
        writeFileSync(join(artifactsDir, `${name}.png`), Buffer.from(png, 'base64'))
      }
    } catch (error) {
      writeFileSync(join(artifactsDir, `${name}.screenshot-error.txt`), String(error))
    }
    try {
      const logs = await browser.getLogs('browser')
      writeFileSync(join(artifactsDir, `${name}.console.json`), JSON.stringify(logs, null, 2))
    } catch (error) {
      writeFileSync(join(artifactsDir, `${name}.console-error.txt`), String(error))
    }
  },

  // A session that found the user name itself caches it for the next sessions.
  after: async () => {
    if (OFFLINE || usernameSeeded) {
      return
    }
    try {
      const name = await browser.execute(
        () =>
          document.querySelector<HTMLElement>('[data-testid="nav-rail"]')?.dataset.username ?? null,
      )
      if (name && USERNAME.test(name)) {
        writeFileSync(usernameFile, name)
      }
    } catch {
      // The app is gone (a crashed session): the next session caches it instead.
    }
  },
}
