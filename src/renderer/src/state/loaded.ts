import { useSelector } from '@tanstack/react-store'
import type { KnownAccounts } from '../../../shared/accounts'
import type { AppSettings } from '../../../shared/settings'
import { dataStore, type OpenDeck, openDeckStore } from './data'
import { settingsStore } from './settings'

/** What the columns, the rail and the dialogs over them show, once it has all loaded. */
export type Loaded = {
  deck: OpenDeck
  /** settings.json columnWidth, or undefined to fill the strip. */
  columnWidth: number | undefined
  /** The first X account's user name, or null when none is logged in (TASK-043). */
  username: string | null
  /** Every network's accounts: its first account's name and its added accounts. */
  accounts: KnownAccounts
  /** The settings main owns (dark mode, zoom, notifications, user agent). */
  settings: AppSettings
}

/**
 * The loaded data, for the components App shows only once it has loaded (TASK-040 step 4). None of
 * it goes back to unloaded.
 */
export function useLoaded(): Loaded {
  // ─── State ───────────────────────────────────────────────────────────
  const deck = useSelector(openDeckStore)
  const config = useSelector(dataStore, (data) => data.config)
  const accounts = useSelector(dataStore, (data) => data.accounts)
  const settings = useSelector(settingsStore)

  if (!deck || !config?.ok || accounts === null || settings === null) {
    throw new Error('XDeck: shown before the app data loaded')
  }

  return {
    deck,
    columnWidth: config.config.columnWidth,
    username: accounts.x.first,
    accounts,
    settings,
  }
}
