import { createStore } from '@tanstack/store'
import { type AppSettings, DEFAULT_SETTINGS, parseSettings } from '../../../shared/settings'

/**
 * The app settings (TASK-040), mirrored from the main process, which owns them (store.json). Null
 * until the first load answers, so the first column setup already has the right values.
 */
export const settingsStore = createStore(null as AppSettings | null, ({ setState }) => ({
  set: (settings: AppSettings) => setState(() => settings),
}))

/**
 * Loads the settings and follows every change main makes (the app menu, the rail's settings menu,
 * dark mode confirmed by X). Returns the function that stops following.
 */
export function startSettingsSync(): () => void {
  let active = true
  window.xdeck
    .getSettings()
    .catch((): AppSettings => DEFAULT_SETTINGS)
    .then((settings) => {
      if (active) {
        settingsStore.actions.set(settings)
      }
    })

  const unsubscribe = window.xdeck.onSettingsChanged((value) => {
    const next = parseSettings(value)
    if (active && next) {
      settingsStore.actions.set(next)
    }
  })

  return () => {
    active = false
    unsubscribe()
  }
}
