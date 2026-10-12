import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $, browser, expect } from '@wdio/globals'
import Ajv2020 from 'ajv/dist/2020'
import { settledConfigScreen, settledScreen } from '../helpers/config-screen'
import { guestOfWebview } from '../helpers/guests'

// TASK-004: settings.json load, create, validate and the config error screen (roadmap §1, §5.2).
//
// Session rules, learned from the runs:
// - The app reads XDECK_CONFIG_DIR at each launch. chromedriver gives every launch the environment
//   it was started with, so the directory path is fixed for the worker session (wdio.conf.ts
//   beforeSession). Each case empties that directory, writes its own files, and relaunches with
//   browser.reloadSession().
// - After a relaunch, the electron service's main-process bridge (browser.electron.*) is stale for
//   the rest of the session. Any check that needs the main process therefore runs before the first
//   relaunch. (g) is first for that reason. Open-folder (f) has its own spec file.

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const bundledDir = join(root, 'resources', 'config')
const fixturesDir = join(root, 'e2e', 'configs')

const bundledSettings = readFileSync(join(bundledDir, 'settings.json'))
const bundledSchema = readFileSync(join(bundledDir, 'schema.json'))

/** The config dir the app was started with. Set by wdio.conf.ts beforeSession. */
let configDir = ''

/** Empties the config dir, writes `files` into it, and relaunches the app. Returns the dir path. */
async function launchWith(files: Record<string, string | Buffer> = {}): Promise<string> {
  rmSync(configDir, { recursive: true, force: true })
  mkdirSync(configDir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(configDir, name), content)
  }
  await browser.reloadSession()
  return configDir
}

type RenderedError = {
  kind: string | null
  path: string
  issues: { path: string | null; text: string }[]
}

/** The error screen as the user sees it, read in the renderer. */
function readErrorScreen(): Promise<RenderedError> {
  return browser.execute(() => {
    const screen = document.querySelector<HTMLElement>('[data-testid="config-error"]')
    return {
      kind: screen?.dataset.kind ?? null,
      path:
        document.querySelector('[data-testid="config-error-path"]')?.getAttribute('data-file') ??
        '',
      issues: Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="config-error-issue"]'),
      ).map((item) => ({ path: item.dataset.path ?? null, text: item.textContent ?? '' })),
    }
  })
}

/** The parser message for a string, from Node's JSON.parse (same V8 family as the app). */
function parserMessage(text: string): string | null {
  try {
    JSON.parse(text)
    return null
  } catch (error) {
    return (error as Error).message
  }
}

function fixture(name: string): Buffer {
  return readFileSync(join(fixturesDir, name))
}

describe('config (TASK-004, roadmap §1)', () => {
  before(() => {
    const dir = process.env.XDECK_CONFIG_DIR
    if (!dir) {
      throw new Error('XDECK_CONFIG_DIR is not set: wdio.conf.ts beforeSession did not run')
    }
    configDir = dir
  })

  // (g) runs first: it needs the main process, which is only reliable before the first relaunch.
  it('(g) config:get is refused for column guests and allowed for the shell main frame', async function () {
    this.timeout(90_000)
    expect(await settledConfigScreen()).toBe('accepted')
    // A guest: a column's when logged in, else the X login window's, opened from the welcome
    // screen (a fresh profile has no account, TASK-043; offline, in CI).
    const welcome = await browser.execute(
      () => document.querySelector('[data-testid="welcome"]') !== null,
    )
    if (welcome) {
      await $('[data-testid="welcome-add-x"]').click()
    }
    const guestId = await guestOfWebview(
      welcome ? '[data-testid="login-window-webview"]' : '[data-column-kind="page"] webview',
    )
    // (1) Inside a guest's main world the preload bridge is absent: nothing is exposed to x.com.
    const guestGlobals = await browser.electron.execute(async (electron, id: number) => {
      const guest = electron.webContents.fromId(id)
      if (!guest) {
        throw new Error('the picked guest is gone')
      }
      return guest.executeJavaScript(
        'JSON.stringify({ xdeck: typeof window.xdeck, ipc: typeof window.ipcRenderer })',
        false,
      )
    }, guestId)
    expect(JSON.parse(guestGlobals)).toEqual({ xdeck: 'undefined', ipc: 'undefined' })

    // (2) The registered config:get handler, called with the real guest webContents and frame as
    // the sender, must throw. The shell main frame is the positive control: the same handler must
    // return the result. Electron keeps invoke handlers in ipcMain._invokeHandlers.
    const outcome = await browser.electron.execute(async (electron, id: number) => {
      const internal = electron.ipcMain as unknown as {
        _invokeHandlers?: Map<string, (event: unknown) => unknown>
      }
      const handler = internal._invokeHandlers?.get('config:get')
      if (!handler) {
        throw new Error('config:get handler not found on ipcMain._invokeHandlers')
      }
      const guest = electron.webContents.fromId(id)
      const shell = electron.BrowserWindow.getAllWindows()[0].webContents
      // Electron may wrap handlers in a promise, so the call is awaited in both branches.
      const attempt = async (sender: { mainFrame: unknown }) => {
        try {
          const value = await handler({ sender, senderFrame: sender.mainFrame })
          return { rejected: false, value: JSON.stringify(value) }
        } catch (error) {
          return { rejected: true, value: (error as Error).message }
        }
      }
      return {
        guest: guest ? await attempt(guest) : null,
        shell: await attempt(shell),
      }
    }, guestId)
    expect(outcome.guest).toEqual({
      rejected: true,
      value: 'config IPC is only available to the XDeck shell window',
    })
    expect(outcome.shell.rejected).toBe(false)
    expect(outcome.shell.value).toContain('"ok":true')
  })

  it('(a) an empty dir gets settings.json (byte-identical default) and schema.json, and the strip shows', async function () {
    this.timeout(90_000)
    const dir = await launchWith()
    expect(await settledConfigScreen()).toBe('accepted')
    expect(readFileSync(join(dir, 'settings.json')).equals(bundledSettings)).toBe(true)
    expect(readFileSync(join(dir, 'schema.json')).equals(bundledSchema)).toBe(true)
  })

  it('(b) an existing settings.json is left alone, and a stale schema.json is overwritten', async function () {
    this.timeout(90_000)
    const custom = Buffer.from('{\n  "columns":   [ { "type": "profile" } ]\n}\n')
    const dir = await launchWith({ 'settings.json': custom, 'schema.json': '{}' })
    expect(await settledConfigScreen()).toBe('accepted')
    expect(readFileSync(join(dir, 'settings.json')).equals(custom)).toBe(true)
    expect(readFileSync(join(dir, 'schema.json')).equals(bundledSchema)).toBe(true)
  })

  it('(c) invalid JSON shows the error screen with kind json, the file path and the parser message', async function () {
    this.timeout(90_000)
    const text = '{\n  "columns": [ }\n'
    const dir = await launchWith({ 'settings.json': text })
    expect(await settledScreen()).toBe('error')
    const screen = await readErrorScreen()
    expect(screen.kind).toBe('json')
    expect(screen.path).toBe(join(dir, 'settings.json'))
    const expected = parserMessage(text)
    expect(expected).not.toBeNull()
    expect(screen.issues).toEqual([{ path: '(file)', text: `(file): ${expected}` }])
  })

  describe('(d) schema violations, one launch each', () => {
    const cases: { file: string; issuePath: string }[] = [
      { file: 'invalid-unknown-type.json', issuePath: 'columns.0.type' },
      { file: 'invalid-extra-top-key.json', issuePath: 'theme' },
      { file: 'invalid-custom-no-url.json', issuePath: 'columns.0.url' },
      { file: 'invalid-column-extra-key.json', issuePath: 'columns.0.width' },
      { file: 'invalid-width-float.json', issuePath: 'columnWidth' },
    ]
    for (const { file, issuePath } of cases) {
      it(`(d) ${file} lists an issue at ${issuePath}`, async function () {
        this.timeout(90_000)
        const dir = await launchWith({ 'settings.json': fixture(file) })
        expect(await settledScreen()).toBe('error')
        const screen = await readErrorScreen()
        expect(screen.kind).toBe('schema')
        expect(screen.path).toBe(join(dir, 'settings.json'))
        expect(screen.issues.map((issue) => issue.path)).toContain(issuePath)
        // Each issue is shown as "path: message".
        for (const issue of screen.issues) {
          expect(issue.text.startsWith(`${issue.path}: `)).toBe(true)
        }
      })
    }
  })

  // (e): one test per fixture. wdio runs each test under mochaOpts.timeout (60 s), and a test body
  // cannot raise that limit (this.timeout inside the body is read too late), so a single loop over
  // every fixture would time out. Each fixture is one launch, so each test fits the limit.
  describe('(e) Zod and schema.json agree: the app shows the error screen exactly when Ajv rejects the fixture', () => {
    const validate = new Ajv2020({ allErrors: true }).compile(
      JSON.parse(bundledSchema.toString('utf8')),
    )
    const names = readdirSync(fixturesDir)
      .filter((name) => name.endsWith('.json'))
      .sort()

    it('has at least 10 fixtures', () => {
      expect(names.length).toBeGreaterThanOrEqual(10)
    })

    for (const name of names) {
      it(`(e) ${name}: the error screen shows exactly when Ajv rejects it`, async () => {
        const content = fixture(name)
        const ajvValid = validate(JSON.parse(content.toString('utf8'))) === true
        await launchWith({ 'settings.json': content })
        // An accepted config shows the welcome screen (no account) or the strip.
        const appValid = (await settledConfigScreen()) === 'accepted'
        expect(appValid).toBe(ajvValid)
      })
    }
  })
})
