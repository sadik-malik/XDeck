// One-time login for the E2E suite. The tests run against real x.com with a real account, so a
// person logs in once here. The session is kept in a persistent test profile outside the repo, and
// every test session starts from a copy of it (see e2e/wdio.conf.ts).
//
//   pnpm e2e:login
//
// The app opens on its welcome screen (TASK-043). Add X account, log in, wait for the columns, then quit
// the app. To run the multi-account spec, add a second account before quitting (More → Add X account…),
// and for instagram.e2e.ts the Instagram test account (More → Add Instagram account…). Nothing here
// reads or stores the credentials; X and Instagram set their own session cookies in the profile.
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { e2eProfileDir, e2eUsernameFile } from './profile.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = (await import('node:module')).createRequire(import.meta.url)
const electron = require('electron')

const profile = e2eProfileDir()
mkdirSync(profile, { recursive: true })
// A new login may be another account: the next E2E run finds the user name again.
rmSync(e2eUsernameFile(), { force: true })

// The bundled default columns (forYou, following, notifications, profile), in a throwaway config dir,
// so the real ~/.config/XDeck is never touched.
const configDir = mkdtempSync(join(tmpdir(), 'xdeck-e2e-login-config-'))
copyFileSync(join(root, 'resources', 'config', 'settings.json'), join(configDir, 'settings.json'))

console.log(`E2E profile: ${profile}`)
console.log(
  'Click Add X account, log in to X in the window that opens. When the columns appear, quit the app.',
)
console.log(
  "For x-accounts.e2e.ts, also add a second X account: the left bar's More (…) → Add X account…, log in there.",
)
console.log(
  'For instagram.e2e.ts, add the Instagram test account: More (…) → Add Instagram account…, log in there.',
)
console.log(
  'For facebook.e2e.ts, add the Facebook test account: More (…) → Add Facebook account…, log in there. Then quit.',
)

const child = spawn(electron, [join(root, 'out', 'main', 'index.js')], {
  stdio: 'inherit',
  env: { ...process.env, XDECK_USER_DATA: profile, XDECK_CONFIG_DIR: configDir },
})
child.on('exit', (code) => {
  console.log(`App closed (${code ?? 'signal'}). The E2E suite will use this login.`)
  process.exit(0)
})
