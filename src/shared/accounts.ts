import type { ColumnConfig } from './app-config'
import { columnNetwork } from './columns'
import {
  accountSession,
  isAccountId,
  NETWORK_INFO,
  NETWORKS,
  type Network,
  type UnreadKey,
  unreadKey,
} from './networks'

/**
 * Accounts (TASK-023, TASK-049), like TweetDeck's: each column can show any logged-in account. A
 * network's first account is in its own session (persist:x, persist:ig; TASK-043: there is no login
 * screen). Every other account has its own session, `<prefix><id>`, so their cookies never mix.
 * Accounts are kept in store.json; a column names its account by name in settings.json
 * (`"account": "name"`).
 */
export type Account = { id: string; username: string }

export const MAX_ACCOUNTS = 10

/**
 * Accounts from IPC or disk, checked against the network's name rule. Malformed entries are
 * dropped.
 */
export function parseAccounts(value: unknown, network: Network): Account[] {
  if (!Array.isArray(value)) {
    return []
  }

  const { isValidName } = NETWORK_INFO[network]

  return value
    .filter(
      (entry): entry is Account =>
        typeof entry === 'object' &&
        entry !== null &&
        isAccountId((entry as Account).id) &&
        typeof (entry as Account).username === 'string' &&
        isValidName((entry as Account).username),
    )
    .slice(0, MAX_ACCOUNTS)
    .map(({ id, username }) => ({ id, username }))
}

/**
 * A network's accounts: its first account's name (or null), its added accounts, and the labels its
 * pages showed for them, by account name. Only Facebook's have labels: its account names are user
 * ids, and the label is the account's name on Facebook (roadmap §11).
 */
export type NetworkAccounts = {
  first: string | null
  added: Account[]
  labels: Record<string, string>
}

/** A label from a page: printable, one line, at most 100 characters. */
export function isValidLabel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 100 &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
}

/**
 * How the UI names an account: its label when its network's page showed one, otherwise @name. A
 * Facebook account without a label yet is "Facebook account": its name is only a number.
 */
export function accountLabel(
  network: Network,
  name: string,
  labels: Record<string, string> = {},
): string {
  return labels[name] ?? (network === 'facebook' ? 'Facebook account' : `@${name}`)
}

/** Every account XDeck knows, by network. */
export type KnownAccounts = Record<Network, NetworkAccounts>

/** No accounts on any network. */
export const NO_ACCOUNTS = Object.fromEntries(
  NETWORKS.map((network) => [network, { first: null, added: [], labels: {} }]),
) as unknown as KnownAccounts

/** A network's accounts from IPC, checked. */
export function parseNetworkAccounts(value: unknown, network: Network): NetworkAccounts {
  const { first, added, labels } = (
    typeof value === 'object' && value !== null ? value : {}
  ) as Record<string, unknown>

  return {
    first: typeof first === 'string' && NETWORK_INFO[network].isValidName(first) ? first : null,
    added: parseAccounts(added, network),
    labels: parseLabels(labels, network),
  }
}

/** Labels from IPC or disk, by account name. Malformed entries are dropped. */
export function parseLabels(value: unknown, network: Network): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([name, label]) => NETWORK_INFO[network].isValidName(name) && isValidLabel(label),
    ),
  ) as Record<string, string>
}

/** Every network's accounts from IPC, checked. */
export function parseKnownAccounts(value: unknown): KnownAccounts {
  const all = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>

  return Object.fromEntries(
    NETWORKS.map((network) => [network, parseNetworkAccounts(all[network], network)]),
  ) as unknown as KnownAccounts
}

/** Each account's name, the first one first. */
export function accountNames({ first, added }: NetworkAccounts): string[] {
  return [...(first ? [first] : []), ...added.map((account) => account.username)]
}

function sameName(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase()
}

/**
 * Which session a column shows, and as whom. `missing`: the account it names is not in XDeck.
 * `none`: it shows the network's first account, and none is logged in (TASK-043).
 */
export type ColumnAccount =
  | {
      kind: 'ready'
      network: Network
      partition: string
      username: string
      accountId: string | null
    }
  | { kind: 'missing'; network: Network; username: string }
  | { kind: 'none'; network: Network }

/**
 * The account of a column. A network's column names its account by name (`account`); none, or the
 * first account's name, is that first account; any other name must be an added account of that
 * network (TASK-023, TASK-049). Other web columns have no account.
 */
export function columnAccount(column: ColumnConfig, known: KnownAccounts): ColumnAccount {
  const network = columnNetwork(column)
  if (!network) {
    return {
      kind: 'ready',
      network: 'x',
      partition: NETWORK_INFO.x.partition,
      username: '',
      accountId: null,
    }
  }

  const { first, added } = known[network]
  const name = column.account
  if (name === undefined || (first !== null && sameName(name, first))) {
    return first === null
      ? { kind: 'none', network }
      : {
          kind: 'ready',
          network,
          partition: accountSession(network, null),
          username: first,
          accountId: null,
        }
  }

  const account = added.find((candidate) => sameName(candidate.username, name))

  return account
    ? {
        kind: 'ready',
        network,
        partition: accountSession(network, account.id),
        username: account.username,
        accountId: account.id,
      }
    : { kind: 'missing', network, username: name }
}

/** The unread-count key of a column's account; undefined for a column without one. */
export function unreadKeyOf(account: ColumnAccount): UnreadKey | undefined {
  return account.kind === 'ready' ? unreadKey(account.network, account.accountId) : undefined
}
