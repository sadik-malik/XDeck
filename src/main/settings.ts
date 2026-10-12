import { BrowserWindow } from 'electron'
import type ElectronStore from 'electron-store'
import { type Account, parseAccounts, parseLabels } from '../shared/accounts'
import { type ColumnLayout, EMPTY_LAYOUT, parseColumnLayout } from '../shared/column-layout'
import { type DeckLayouts, isDeckKey } from '../shared/decks'
import { NETWORK_INFO, type Network } from '../shared/networks'
import { type AppSettings, clampZoom, DEFAULT_SETTINGS } from '../shared/settings'
import { parseDarkBg } from '../shared/theme'
import {
  DEFAULT_USER_AGENT,
  parseUserAgentChoice,
  type UserAgentChoice,
} from '../shared/user-agents'

// electron-store 11 is ESM only. The main bundle is CommonJS, and Electron's require() returns the
// module namespace, with the class as `default`. An import statement would go through rollup's
// namespace helper, which sets `default` to the whole module, so the class is taken with require.
const { default: Store } = require('electron-store') as { default: typeof ElectronStore }

/**
 * App settings in the userData folder (electron-store, `store.json`). The renderer reaches them only
 * through the settings IPC, which checks the sender (settings-ipc.ts). Created on first use, after
 * the userData path has been set.
 */
type StoreData = AppSettings & {
  /** The layout saved before decks existed (TASK-013/014). It is the first deck's until replaced. */
  columnLayout: ColumnLayout
  /** Each deck's order and widths, by deck key (TASK-022). */
  deckLayouts: Record<string, ColumnLayout>
  /** The deck open last, by key. */
  activeDeck: string
  /**
   * The X account of the persist:x session, XDeck's first X account, or null when none is logged in.
   * Kept like every other account, so the app opens straight to the columns (no login screen).
   */
  xAccount: { username: string } | null
  /** The one-time search for an older profile's X login has run (TASK-043): it never runs again. */
  xSessionChecked: boolean
  /** Added X accounts (TASK-023), each with its own session; the first X account is not listed. */
  accounts: Account[]
  /** The first Instagram account (roadmap §9, persist:ig), or null when none is logged in. */
  instagramAccount: { username: string } | null
  /** Added Instagram accounts (TASK-049), each with its own session, persist:ig-<id>. */
  instagramAccounts: Account[]
  /** The first Facebook account (roadmap §11, persist:fb): its user id, or null. */
  facebookAccount: { username: string } | null
  /** Added Facebook accounts, each with its own session, persist:fb-<id>. */
  facebookAccounts: Account[]
  /** Each network's account labels by account name: Facebook accounts' names (roadmap §11). */
  accountLabels: Record<string, Record<string, string>>
}

let store: ElectronStore<StoreData> | undefined

function settingsStore(): ElectronStore<StoreData> {
  store ??= new Store<StoreData>({
    name: 'store',
    defaults: {
      ...DEFAULT_SETTINGS,
      columnLayout: EMPTY_LAYOUT,
      deckLayouts: {},
      activeDeck: '',
      xAccount: null,
      xSessionChecked: false,
      accounts: [],
      instagramAccount: null,
      instagramAccounts: [],
      facebookAccount: null,
      facebookAccounts: [],
      accountLabels: {},
    },
  })

  return store
}

export function readSettings(): AppSettings {
  return {
    darkMode: settingsStore().get('darkMode') === true,
    darkBg: parseDarkBg(settingsStore().get('darkBg')),
    pageZoom: readPageZoom(),
    notifications: settingsStore().get('notifications') !== false,
    userAgent: parseUserAgentChoice(settingsStore().get('userAgent')) ?? DEFAULT_USER_AGENT,
  }
}

function readPageZoom(): number {
  const zoom = settingsStore().get('pageZoom')

  return typeof zoom === 'number' && Number.isFinite(zoom) ? clampZoom(zoom) : 1
}

export function writePageZoom(zoom: number): void {
  settingsStore().set('pageZoom', clampZoom(zoom))
}

export function writeDarkMode(darkMode: boolean): void {
  settingsStore().set('darkMode', darkMode)
}

export function writeDarkBg(darkBg: string): void {
  settingsStore().set('darkBg', darkBg)
}

export function writeNotifications(notifications: boolean): void {
  settingsStore().set('notifications', notifications)
}

export function writeUserAgent(userAgent: UserAgentChoice): void {
  settingsStore().set('userAgent', userAgent)
}

/** Main → shell renderer: the settings changed. */
export const SETTINGS_CHANGED = 'settings:changed'

/** Sends the current settings to the shell window, after any change made in main. */
export function broadcastSettings(): void {
  const settings = readSettings()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(SETTINGS_CHANGED, settings)
  }
}

/** Every deck's saved layout, and the one saved before decks. Damaged entries are left out. */
export function readDeckLayouts(): DeckLayouts {
  const stored = settingsStore().get('deckLayouts')
  const decks: Record<string, ColumnLayout> = {}
  if (typeof stored === 'object' && stored !== null) {
    for (const [key, value] of Object.entries(stored)) {
      const layout = parseColumnLayout(value)
      if (isDeckKey(key) && layout) {
        decks[key] = layout
      }
    }
  }

  return {
    decks,
    legacy: parseColumnLayout(settingsStore().get('columnLayout')) ?? EMPTY_LAYOUT,
  }
}

export function writeDeckLayout(deck: string, layout: ColumnLayout): void {
  settingsStore().set('deckLayouts', { ...readDeckLayouts().decks, [deck]: layout })
}

/** Drops the saved layouts of decks that no longer exist. */
export function pruneDeckLayouts(keep: string[]): void {
  const decks = readDeckLayouts().decks
  settingsStore().set(
    'deckLayouts',
    Object.fromEntries(Object.entries(decks).filter(([key]) => keep.includes(key))),
  )
}

export function readActiveDeck(): string | null {
  const deck = settingsStore().get('activeDeck')

  return isDeckKey(deck) ? deck : null
}

export function writeActiveDeck(deck: string): void {
  settingsStore().set('activeDeck', deck)
}

/**
 * Where each network's accounts are kept in store.json: its first account (`{ username }` or null)
 * and its added accounts. X's keys are older than the other networks'.
 */
const ACCOUNT_KEYS = {
  x: { first: 'xAccount', added: 'accounts' },
  instagram: { first: 'instagramAccount', added: 'instagramAccounts' },
  facebook: { first: 'facebookAccount', added: 'facebookAccounts' },
} as const satisfies Record<Network, { first: keyof StoreData; added: keyof StoreData }>

/** A network's first account's name, or null. A malformed entry counts as none. */
export function readFirstAccount(network: Network): string | null {
  const stored = settingsStore().get(ACCOUNT_KEYS[network].first) as unknown
  const username =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>).username
      : undefined

  return typeof username === 'string' && NETWORK_INFO[network].isValidName(username)
    ? username
    : null
}

export function writeFirstAccount(network: Network, username: string | null): void {
  settingsStore().set(ACCOUNT_KEYS[network].first, username === null ? null : { username })
}

/** A network's added accounts. Malformed entries are left out. */
export function readAddedAccounts(network: Network): Account[] {
  return parseAccounts(settingsStore().get(ACCOUNT_KEYS[network].added), network)
}

export function writeAddedAccounts(network: Network, accounts: Account[]): void {
  settingsStore().set(ACCOUNT_KEYS[network].added, accounts)
}

/** A network's account labels, by account name. Malformed entries are left out. */
export function readLabels(network: Network): Record<string, string> {
  const all = settingsStore().get('accountLabels') as unknown

  return typeof all === 'object' && all !== null
    ? parseLabels((all as Record<string, unknown>)[network], network)
    : {}
}

export function writeLabels(network: Network, labels: Record<string, string>): void {
  const all = settingsStore().get('accountLabels') as unknown
  settingsStore().set('accountLabels', {
    ...(typeof all === 'object' && all !== null ? all : {}),
    [network]: labels,
  })
}

export function readXSessionChecked(): boolean {
  return settingsStore().get('xSessionChecked') === true
}

export function writeXSessionChecked(): void {
  settingsStore().set('xSessionChecked', true)
}
