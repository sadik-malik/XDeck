import { createStore } from '@tanstack/store'
import {
  accountLabel,
  isValidLabel,
  type KnownAccounts,
  type NetworkAccounts,
  NO_ACCOUNTS,
  parseAccounts,
  parseKnownAccounts,
  parseNetworkAccounts,
} from '../../../shared/accounts'
import type { AppConfig, ColumnConfig } from '../../../shared/app-config'
import type { ColumnFilters } from '../../../shared/column-filters'
import {
  type ColumnLayout,
  columnKeys,
  EMPTY_LAYOUT,
  layoutAfterAdd,
  layoutAfterRemove,
} from '../../../shared/column-layout'
import type { ConfigResult } from '../../../shared/config-result'
import {
  configDecks,
  type DeckConfig,
  type DeckLayouts,
  deckKeys,
  deckLayout,
  isDeckKey,
  parseDeckLayouts,
} from '../../../shared/decks'
import { accountSession, NETWORK_INFO, NETWORKS, type Network } from '../../../shared/networks'
import { type AccountRef, type LoginTarget, overlayStore } from './overlay'

// The app's data (TASK-040 step 3): settings.json, the deck layouts, the open deck, the accounts and
// the logged-in user name, with the actions that change them. The main process owns everything
// persisted; each action goes through IPC and the store takes main's answer.

export type AppData = {
  /** null until the startup load answers. No columns load before that, so a bad config never flashes. */
  config: ConfigResult<AppConfig> | null
  /** Every deck's column order and widths. null until loaded, so the first layout is the saved one. */
  layouts: DeckLayouts | null
  /** The open deck's key (TASK-022). undefined until loaded; null opens the first deck. */
  activeDeck: string | null | undefined
  /**
   * Every network's accounts: its first account's name (persist:x, persist:ig; TASK-043) and its
   * added accounts (TASK-023, TASK-049). null until loaded, so no column shows a wrong "not logged
   * in".
   */
  accounts: KnownAccounts | null
  /** A column that was just added, scrolled into view once it is shown. */
  revealKey: string | null
  /**
   * persist:x holds an X login with no user name kept (a profile from the login-screen days): the app
   * finds the name once, in the background, before it shows the columns. undefined until checked.
   */
  unnamedXSession: boolean | undefined
  /** Bumped for a session each time an account logs in there, so its pages reload logged in. */
  sessionLogins: Record<string, number>
}

const NOT_LOADED: AppData = {
  config: null,
  layouts: null,
  activeDeck: undefined,
  accounts: null,
  revealKey: null,
  unnamedXSession: undefined,
  sessionLogins: {},
}

export const dataStore = createStore(NOT_LOADED, ({ setState }) => ({
  set: (changes: Partial<AppData>) => setState((data) => ({ ...data, ...changes })),
}))

const set = dataStore.actions.set

/** The open deck and what it shows, worked out from the config, the saved layouts and the open key. */
export type OpenDeck = {
  decks: DeckConfig[]
  keys: string[]
  index: number
  key: string
  columns: ColumnConfig[]
  layout: ColumnLayout
}

function openDeck(config: AppConfig, layouts: DeckLayouts, activeKey: string | null): OpenDeck {
  const decks = configDecks(config)
  const keys = deckKeys(decks)
  const index = Math.max(0, activeKey === null ? 0 : keys.indexOf(activeKey))

  return {
    decks,
    keys,
    index,
    key: keys[index],
    columns: decks[index].columns,
    layout: deckLayout(layouts, keys[index], index),
  }
}

/** The open deck, once everything has loaded; recomputed when the data changes. */
export const openDeckStore = createStore(() => {
  const { config, layouts, activeDeck } = dataStore.get()

  return config?.ok && layouts !== null && activeDeck !== undefined
    ? openDeck(config.config, layouts, activeDeck)
    : null
})

/**
 * Loads the config, layouts, accounts and open deck, and follows View → Reset Layout. Returns the
 * function that stops: a value that arrives later is dropped.
 */
export function startDataLoad(): () => void {
  let active = true
  // Each value is set once it arrives, or its fallback if the request failed.
  function load<T>(
    request: Promise<T>,
    fallback: (error: unknown) => T,
    apply: (value: T) => void,
  ) {
    request.catch(fallback).then((value) => {
      if (active) {
        apply(value)
      }
    })
  }

  load(
    window.xdeck.getConfig(),
    (error): ConfigResult<AppConfig> => ({
      ok: false,
      path: '',
      kind: 'read',
      issues: [{ path: '(ipc)', message: String(error) }],
    }),
    (config) => set({ config }),
  )
  load(
    window.xdeck.getColumnLayout(),
    () => null,
    (value) => set({ layouts: parseDeckLayouts(value) }),
  )
  load(
    window.xdeck.getAccounts(),
    () => NO_ACCOUNTS,
    (value) => set({ accounts: parseKnownAccounts(value) }),
  )
  load(
    window.xdeck.hasUnnamedXSession(),
    () => false,
    (unnamedXSession) => set({ unnamedXSession }),
  )
  load(
    window.xdeck.getActiveDeck(),
    () => null,
    (value) => set({ activeDeck: isDeckKey(value) ? value : null }),
  )

  // View → Reset Layout resets the open deck.
  const unsubscribeReset = window.xdeck.onColumnLayoutReset(() => {
    if (active) {
      changeLayout(EMPTY_LAYOUT)
    }
  })

  return () => {
    active = false
    unsubscribeReset()
  }
}

// ─── Layouts ───────────────────────────────────────────────────────────

/** The new layout shows at once; saving it is best effort (a failed save only loses it on restart). */
function saveLayout(deck: string, next: ColumnLayout): void {
  const { layouts } = dataStore.get()
  if (layouts) {
    set({ layouts: { ...layouts, decks: { ...layouts.decks, [deck]: next } } })
  }

  window.xdeck.setColumnLayout(deck, next).catch(() => undefined)
}

/** A new order or widths for the open deck. */
export function changeLayout(next: ColumnLayout): void {
  const current = openDeckStore.get()
  if (current) {
    saveLayout(current.key, next)
  }
}

// ─── Decks and columns ─────────────────────────────────────────────────

/** Saves the decks to settings.json and shows the saved config. */
async function saveDecks(decks: DeckConfig[]): Promise<AppConfig> {
  const saved = await window.xdeck.setDecks(decks)
  set({ config: { ok: true, config: saved } })

  return saved
}

/** Saves new columns for the open deck. */
function saveColumns(open: OpenDeck, columns: ColumnConfig[]): Promise<AppConfig> {
  return saveDecks(open.decks.map((deck, i) => (i === open.index ? { ...deck, columns } : deck)))
}

export function selectDeck(key: string): void {
  set({ activeDeck: key, revealKey: null })
  window.xdeck.setActiveDeck(key).catch(() => undefined)
}

/**
 * Adds a column to the open deck, after `afterKey` when given, and brings it into view. It is shown
 * only once settings.json has it: main also adds a new custom column's origin to the guest
 * allow-list before it answers.
 */
export async function addColumn(column: ColumnConfig, afterKey?: string): Promise<void> {
  const current = openDeckStore.get()
  if (!current) {
    return
  }

  await saveColumns(current, [...current.columns, column])
  const added = layoutAfterAdd(current.columns, column, current.layout, afterKey)
  changeLayout(added.layout)
  set({ revealKey: added.key })
}

/**
 * Filters are saved to settings.json with the column. The column key does not include them, so the
 * page stays loaded and gets the new filters with its next setup.
 */
export async function saveFilters(key: string, filters: ColumnFilters | undefined): Promise<void> {
  const current = openDeckStore.get()
  if (!current) {
    return
  }

  const index = columnKeys(current.columns).indexOf(key)
  if (index < 0) {
    return
  }

  await saveColumns(
    current,
    current.columns.map((column, i) => {
      if (i !== index) {
        return column
      }

      const { filters: _old, ...rest } = column

      return filters ? { ...rest, filters } : rest
    }),
  )
}

export async function removeColumn(key: string): Promise<void> {
  const current = openDeckStore.get()
  if (!current) {
    return
  }

  const index = columnKeys(current.columns).indexOf(key)
  if (index < 0) {
    return
  }

  try {
    await saveColumns(
      current,
      current.columns.filter((_, i) => i !== index),
    )
    changeLayout(layoutAfterRemove(current.columns, index, current.layout))
  } catch (error) {
    console.error('XDeck: the column could not be removed', error)
  }
}

/** Decks (TASK-022). A new deck starts empty and opens at once. */
export async function createDeck(name: string): Promise<void> {
  const current = openDeckStore.get()
  if (!current) {
    return
  }

  const saved = await saveDecks([...current.decks, { name, columns: [] }])
  selectDeck(deckKeys(configDecks(saved)).at(-1) as string)
}

/** A renamed deck keeps its layout, which is stored by the deck's key. */
export async function renameDeck(name: string): Promise<void> {
  const current = openDeckStore.get()
  if (!current) {
    return
  }

  const next = current.decks.map((deck, i) => (i === current.index ? { ...deck, name } : deck))
  const layout = current.layout
  await saveDecks(next)
  const key = deckKeys(next)[current.index]
  saveLayout(key, layout)
  selectDeck(key)
}

export async function deleteDeck(): Promise<void> {
  const current = openDeckStore.get()
  if (!current || current.decks.length < 2) {
    return
  }

  const next = current.decks.filter((_, i) => i !== current.index)
  await saveDecks(next)
  selectDeck(deckKeys(next)[0])
}

// ─── Accounts ──────────────────────────────────────────────────────────

/** Sets one network's accounts. */
function setNetwork(network: Network, value: NetworkAccounts): void {
  set({ accounts: { ...(dataStore.get().accounts ?? NO_ACCOUNTS), [network]: value } })
}

/** A network's accounts, now. */
function accountsOf(network: Network): NetworkAccounts {
  return (dataStore.get().accounts ?? NO_ACCOUNTS)[network]
}

/**
 * A network's first account logged in, or a page of its session showed who is logged in (roadmap
 * §9). A new name is kept, so the accounts menu lists it at startup. Returns whether the name was
 * valid.
 */
export function firstAccountFound(network: Network, value: unknown): boolean {
  if (typeof value !== 'string' || !NETWORK_INFO[network].isValidName(value)) {
    return false
  }

  const now = accountsOf(network)
  if (now.first !== value) {
    setNetwork(network, { ...now, first: value })
    window.xdeck
      .setFirstAccount(network, value)
      .catch((error: unknown) => console.error('XDeck: the account could not be saved', error))
  }

  if (network === 'x') {
    set({ unnamedXSession: false })
    window.xdeck.markXSessionChecked().catch(() => undefined)
    // The login cookie is written to disk now, not on Chromium's timer (TASK-007 (c)).
    window.xdeck.flushXCookies().catch(() => undefined)
  }

  return true
}

/** An account logged in to a session: its pages reload (a logged-out page shows the login form). */
function sessionLoggedIn(partition: string): void {
  const { sessionLogins } = dataStore.get()
  set({ sessionLogins: { ...sessionLogins, [partition]: (sessionLogins[partition] ?? 0) + 1 } })
}

/** Opens a login window: adding an account, or logging one in again (TASK-043). */
export function logIn(target: LoginTarget): void {
  overlayStore.actions.open({ kind: 'login', target })
}

/**
 * Add an account: a network's first goes in its own session (persist:x, persist:ig); later ones each
 * get a new session, made by main (TASK-023, TASK-049).
 */
export async function addAccount(network: Network): Promise<void> {
  if (accountsOf(network).first === null) {
    logIn({ network, account: 'first' })

    return
  }

  try {
    logIn({ network, account: 'new', id: await window.xdeck.beginLogin(network) })
  } catch (error) {
    console.error('XDeck: an account could not be added', error)
  }
}

export function addXAccount(): Promise<void> {
  return addAccount('x')
}

/** The login window closed before it found a user name. A new session is thrown away. */
export function cancelLogin(target: LoginTarget): void {
  overlayStore.actions.close('login')
  if (target.account === 'new') {
    window.xdeck.cancelLogin(target.network, target.id).catch(() => undefined)
  }
}

/**
 * The login window found who is logged in. An account already in XDeck is not added twice: the
 * user is told why nothing was added (TASK-029), and the new session is dropped.
 */
export function loggedIn(target: LoginTarget, value: unknown): void {
  const { network } = target
  if (typeof value !== 'string' || !NETWORK_INFO[network].isValidName(value)) {
    return
  }

  overlayStore.actions.close('login')
  if (target.account === 'first') {
    firstAccountFound(network, value)
    saveFoundLabels(network)
    sessionLoggedIn(accountSession(network, null))

    return
  }

  if (target.account === 'again') {
    sessionLoggedIn(accountSession(network, target.id))

    return
  }

  const { first, added, labels } = accountsOf(network)
  const same = (name: string) => name.toLowerCase() === value.toLowerCase()
  const already = `${accountLabel(network, value, { ...labels, ...foundLabels[network] })} is already in XDeck.`
  if (first && same(first)) {
    window.xdeck.cancelLogin(network, target.id).catch(() => undefined)
    overlayStore.actions.open({ kind: 'notice', text: already })

    return
  }

  if (added.some((account) => same(account.username))) {
    overlayStore.actions.open({ kind: 'notice', text: already })
  }

  window.xdeck
    .finishLogin(network, target.id, value)
    .then((saved) => {
      setNetwork(network, { ...accountsOf(network), added: parseAccounts(saved, network) })
      saveFoundLabels(network)
    })
    .catch((error: unknown) => console.error('XDeck: the account could not be saved', error))
}

/**
 * Labels pages showed (a Facebook account's name, roadmap §11), by network and account name. One
 * can come before its account is saved (the login window), so it waits here until it is.
 */
const foundLabels: Record<string, Record<string, string>> = {}

/** Saves the found labels of a network's accounts that XDeck has and that changed. */
function saveFoundLabels(network: Network): void {
  const { first, added, labels } = accountsOf(network)
  const names = [...(first ? [first] : []), ...added.map((account) => account.username)]
  for (const [name, label] of Object.entries(foundLabels[network] ?? {})) {
    if (names.includes(name) && labels[name] !== label) {
      window.xdeck
        .setAccountLabel(network, name, label)
        .then((saved) => setNetwork(network, parseNetworkAccounts(saved, network)))
        .catch(() => undefined)
    }
  }
}

/** A page showed an account's label: kept, and saved once XDeck has the account. */
export function accountLabelFound(network: Network, name: unknown, label: unknown): void {
  if (
    typeof name !== 'string' ||
    !NETWORK_INFO[network].isValidName(name) ||
    !isValidLabel(label)
  ) {
    return
  }

  foundLabels[network] = { ...foundLabels[network], [name]: label.trim() }
  saveFoundLabels(network)
}

/** The background check found the name of a profile's existing X login (unnamedXSession). */
export function unnamedXSessionFound(value: unknown): void {
  if (firstAccountFound('x', value)) {
    sessionLoggedIn(accountSession('x', null))
  }
}

/**
 * The background check gave up (X logged the session out, or did not answer): the columns show
 * without the account, and the check never runs again; Add X account finds it at once if it is
 * still logged in.
 */
export function unnamedXSessionGaveUp(): void {
  set({ unnamedXSession: false })
  window.xdeck.markXSessionChecked().catch(() => undefined)
}

/** Removes an account: main forgets it and clears its session, which logs it out. */
export async function removeAccount(account: AccountRef): Promise<void> {
  const { network } = account
  setNetwork(
    network,
    parseNetworkAccounts(await window.xdeck.removeAccount(network, account.id ?? null), network),
  )
}

// ─── Post ──────────────────────────────────────────────────────────────

/** An account that can post (TASK-044): X or Instagram; a network's first account has no id. */
export type Poster = { network: Network; id: string | null; username: string }

/** Who can post: every account, network by network, each network's first one first. */
export function postersOf(accounts: KnownAccounts): Poster[] {
  return NETWORKS.flatMap((network) => {
    const { first, added } = accounts[network]

    return [
      ...(first ? [{ network, id: null, username: first }] : []),
      ...added.map((account) => ({
        network,
        id: account.id as string | null,
        username: account.username,
      })),
    ]
  })
}

/** Opens Post as one account: X's editor in its session, or the network's create dialog in its own. */
export function post(poster: Poster): void {
  if (poster.network === 'x') {
    overlayStore.actions.open({ kind: 'compose', account: poster.id })

    return
  }

  overlayStore.actions.open({
    kind: 'network-post',
    network: poster.network,
    partition: accountSession(poster.network, poster.id),
  })
}

/** Post with no choice made (the N key): the first account that can post, or Add X account. */
export function postDefault(): void {
  const [first] = postersOf(dataStore.get().accounts ?? NO_ACCOUNTS)
  if (first) {
    post(first)
  } else {
    void addXAccount()
  }
}
