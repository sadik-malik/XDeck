import { randomBytes } from 'node:crypto'
import { session } from 'electron'
import { type Account, isValidLabel, MAX_ACCOUNTS, type NetworkAccounts } from '../shared/accounts'
import { FACEBOOK_USER_COOKIE, isValidFacebookId } from '../shared/facebook-user'
import {
  accountIdOfPartition,
  accountSession,
  addedPartition,
  isAccountId,
  NETWORK_INFO,
  NETWORKS,
  type Network,
  networkOfPartition,
} from '../shared/networks'
import {
  readAddedAccounts,
  readFirstAccount,
  readLabels,
  readXSessionChecked,
  writeAddedAccounts,
  writeFirstAccount,
  writeLabels,
  writeXSessionChecked,
} from './settings'
import { reloadPagesIn } from './view'

/**
 * Every network's accounts (TASK-023, TASK-049): the first in the network's own session, each added
 * one in `<prefix><id>`. Main makes the ids, so the renderer can never name a session of its own. A
 * login in progress has an id that is not stored yet: it is pending until the login window reports
 * who logged in.
 */
const pending = new Map<Network, Set<string>>(NETWORKS.map((network) => [network, new Set()]))

function pendingOf(network: Network): Set<string> {
  return pending.get(network) as Set<string>
}

/** A network's accounts, as the renderer sees them. */
export function readNetworkAccounts(network: Network): NetworkAccounts {
  const first = readFirstAccount(network)
  const added = readAddedAccounts(network)
  const names = [...(first ? [first] : []), ...added.map((account) => account.username)]
  const labels = Object.fromEntries(
    Object.entries(readLabels(network)).filter(([name]) => names.includes(name)),
  )

  return { first, added, labels }
}

/**
 * The label a network's page showed for one of XDeck's accounts (roadmap §11: a Facebook account's
 * name). Only for an account XDeck has. Returns the network's accounts.
 */
export function setAccountLabel(network: Network, name: unknown, label: unknown): NetworkAccounts {
  const known = readNetworkAccounts(network)
  const account = checkedName(network, name)
  const names = [...(known.first ? [known.first] : []), ...known.added.map((a) => a.username)]
  if (!names.includes(account) || !isValidLabel(label)) {
    throw new Error('not a label for one of the accounts XDeck has')
  }

  writeLabels(network, { ...known.labels, [account]: label.trim() })

  return readNetworkAccounts(network)
}

/** Whether a session id belongs to a network's added account or a login in progress. */
export function isKnownAccountId(network: Network, id: string): boolean {
  return (
    pendingOf(network).has(id) || readAddedAccounts(network).some((account) => account.id === id)
  )
}

/** A network's sessions: its first account's and each added account's. */
export function networkPartitions(network: Network): string[] {
  return [
    NETWORK_INFO[network].partition,
    ...readAddedAccounts(network).map((account) => addedPartition(network, account.id)),
  ]
}

function checkedName(network: Network, value: unknown): string {
  if (typeof value !== 'string' || !NETWORK_INFO[network].isValidName(value)) {
    throw new Error(`not a ${NETWORK_INFO[network].name} account name`)
  }

  return value
}

/**
 * A network's first account logged in, or its page showed who is logged in: its name is kept, so
 * the next launch opens straight to the columns.
 */
export function setFirstAccount(network: Network, value: unknown): string {
  const name = checkedName(network, value)
  writeFirstAccount(network, name)

  return name
}

/** Starts adding an account: a new, empty session for its login window. */
export function beginLogin(network: Network): string {
  if (readAddedAccounts(network).length + pendingOf(network).size >= MAX_ACCOUNTS) {
    throw new Error(
      `XDeck shows at most ${MAX_ACCOUNTS} added ${NETWORK_INFO[network].name} accounts`,
    )
  }

  const id = randomBytes(6).toString('hex')
  pendingOf(network).add(id)

  return id
}

/**
 * The login window of a pending account found who logged in. An account XDeck already has keeps
 * its old session and the new one is dropped. Returns the network's added accounts.
 */
export async function finishLogin(
  network: Network,
  id: unknown,
  value: unknown,
): Promise<Account[]> {
  if (!isAccountId(id) || !pendingOf(network).has(id)) {
    throw new Error('no login in progress with this id')
  }

  const name = checkedName(network, value)
  pendingOf(network).delete(id)
  const accounts = readAddedAccounts(network)
  const same = (other: string) => other.toLowerCase() === name.toLowerCase()
  const first = readFirstAccount(network)
  if ((first && same(first)) || accounts.some((account) => same(account.username))) {
    await clearSession(addedPartition(network, id))

    return accounts
  }

  const next = [...accounts, { id, username: name }]
  writeAddedAccounts(network, next)

  return next
}

/** The login window closed before the login finished: its session is thrown away. */
export async function cancelLogin(network: Network, id: unknown): Promise<void> {
  if (isAccountId(id) && pendingOf(network).delete(id)) {
    await clearSession(addedPartition(network, id))
  }
}

/**
 * Removes an account, the first (no id) or an added one: XDeck forgets it and its session's data
 * (cookies, cache), which logs it out. Its open pages reload, onto the login page. Returns the
 * network's accounts.
 */
export async function removeAccount(network: Network, id: unknown): Promise<NetworkAccounts> {
  const removed =
    id === null || id === undefined
      ? readFirstAccount(network)
      : readAddedAccounts(network).find((account) => account.id === id)?.username
  if (removed) {
    const { [removed]: _dropped, ...labels } = readLabels(network)
    writeLabels(network, labels)
  }

  if (id === null || id === undefined) {
    writeFirstAccount(network, null)
  } else if (isAccountId(id)) {
    writeAddedAccounts(
      network,
      readAddedAccounts(network).filter((account) => account.id !== id),
    )
  } else {
    throw new Error('not an account id')
  }

  await clearSession(accountSession(network, id ?? null))

  return readNetworkAccounts(network)
}

async function clearSession(partition: string): Promise<void> {
  const target = session.fromPartition(partition)
  await target.clearStorageData()
  await target.clearCache()
  reloadPagesIn(target)
}

/**
 * The Facebook user logged in to one of XDeck's Facebook sessions: the id in its c_user cookie, or
 * null (roadmap §11). Facebook's page is not asked: the cookie is the same in every language and
 * every page, including its checkpoint and two-factor steps. Only a session main made is read.
 */
export async function facebookSessionUser(partition: unknown): Promise<string | null> {
  if (typeof partition !== 'string' || networkOfPartition(partition) !== 'facebook') {
    throw new Error('not a Facebook session')
  }

  const id = accountIdOfPartition('facebook', partition)
  if (id !== null && !isKnownAccountId('facebook', id)) {
    throw new Error('not a Facebook session XDeck made')
  }

  const [cookie] = await session
    .fromPartition(partition)
    .cookies.get({ name: FACEBOOK_USER_COOKIE })
  const value = cookie?.value ?? ''

  return isValidFacebookId(value) ? value : null
}

/**
 * Whether persist:x holds an X login although no user name is kept: a profile from before XDeck kept
 * it (it had a login screen). The renderer then looks for the name, once per profile.
 */
export async function hasUnnamedXSession(): Promise<boolean> {
  if (readFirstAccount('x') !== null || readXSessionChecked()) {
    return false
  }

  const cookies = await session
    .fromPartition(NETWORK_INFO.x.partition)
    .cookies.get({ name: 'auth_token' })

  return cookies.length > 0
}

/** The search for an older profile's X login has run: found or not, it never runs again. */
export function markXSessionChecked(): void {
  writeXSessionChecked()
}
