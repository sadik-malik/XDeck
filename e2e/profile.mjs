// Where the E2E suite keeps its logged-in X profile. Outside the repo, because it holds a real X
// session. XDECK_E2E_PROFILE overrides the default.
import { homedir } from 'node:os'
import { join } from 'node:path'

export function e2eProfileDir() {
  return process.env.XDECK_E2E_PROFILE || join(homedir(), '.xdeck-e2e', 'profile')
}

// The test account's user name, cached by the E2E run (see e2e/wdio.conf.ts).
export function e2eUsernameFile() {
  return `${e2eProfileDir()}-username.txt`
}
