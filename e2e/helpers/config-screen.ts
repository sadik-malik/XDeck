import { browser } from '@wdio/globals'

// Shared by the config specs (TASK-004). The renderer shows either the config error screen or the
// column strip once settings.json has been loaded.

export type Screen = 'error' | 'strip'

/**
 * Waits until config validation has settled and says whether the config was accepted. A rejected
 * config shows the error screen. An accepted one shows the welcome screen (a profile with no
 * account, TASK-043) or the strip.
 */
export async function settledConfigScreen(): Promise<'error' | 'accepted'> {
  let result: 'error' | 'accepted' = 'accepted'
  await browser.waitUntil(
    async () => {
      if (await $('[data-testid="config-error"]').isExisting()) {
        result = 'error'
        return true
      }
      if (
        (await $('[data-testid="welcome"]').isExisting()) ||
        (await $('[data-testid="column-strip"]').isExisting())
      ) {
        result = 'accepted'
        return true
      }
      return false
    },
    {
      timeout: 20_000,
      timeoutMsg: 'neither the error screen, the welcome screen nor the strip appeared',
    },
  )
  return result
}

/** Waits until the renderer shows either the error screen or the column strip, and says which. */
export async function settledScreen(): Promise<Screen> {
  let screen: Screen = 'strip'
  await browser.waitUntil(
    async () => {
      if (await $('[data-testid="config-error"]').isExisting()) {
        screen = 'error'
        return true
      }
      if (await $('[data-testid="column-strip"]').isExisting()) {
        screen = 'strip'
        return true
      }
      return false
    },
    { timeout: 20_000, timeoutMsg: 'neither the error screen nor the column strip appeared' },
  )
  return screen
}
