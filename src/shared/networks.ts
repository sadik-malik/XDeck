import { isValidFacebookId } from './facebook-user'
import { isValidInstagramUsername } from './instagram-user'
import { isValidUsername } from './username'

/**
 * The networks XDeck has accounts on (roadmap §9, §11), each in one place: its hosts, the origin its
 * columns load from, its sessions and its account names. Code that differs by network reads this
 * table instead of asking "X or Instagram?".
 */
export type Network = 'x' | 'instagram' | 'facebook'

/** Every network, in the order the UI lists them. */
export const NETWORKS: readonly Network[] = ['x', 'instagram', 'facebook']

export type NetworkInfo = {
  /** The network's name, as the UI writes it. */
  name: string
  /** Hosts that count as the network. Exact names only: a lookalike host must not match. */
  hosts: readonly string[]
  /** The origin its columns and login page load from. */
  origin: string
  /** The first account's session (TASK-043). */
  partition: string
  /** An added account's session is this prefix and the account's id (TASK-023, TASK-049). */
  addedPrefix: string
  /** Whether a name is one of the network's account names: a user name, or Facebook's user id. */
  isValidName: (name: string) => boolean
}

export const NETWORK_INFO: Record<Network, NetworkInfo> = {
  x: {
    name: 'X',
    hosts: [
      'x.com',
      'www.x.com',
      'mobile.x.com',
      'twitter.com',
      'www.twitter.com',
      'mobile.twitter.com',
    ],
    origin: 'https://x.com',
    partition: 'persist:x',
    addedPrefix: 'persist:x-',
    isValidName: isValidUsername,
  },
  instagram: {
    name: 'Instagram',
    hosts: ['instagram.com', 'www.instagram.com'],
    origin: 'https://www.instagram.com',
    partition: 'persist:ig',
    addedPrefix: 'persist:ig-',
    isValidName: isValidInstagramUsername,
  },
  facebook: {
    name: 'Facebook',
    hosts: ['facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com'],
    origin: 'https://www.facebook.com',
    partition: 'persist:fb',
    addedPrefix: 'persist:fb-',
    isValidName: isValidFacebookId,
  },
}

export function isNetwork(value: unknown): value is Network {
  return typeof value === 'string' && (NETWORKS as readonly string[]).includes(value)
}

/** The network a host belongs to, or null. */
export function networkOfHost(host: string): Network | null {
  return NETWORKS.find((network) => NETWORK_INFO[network].hosts.includes(host)) ?? null
}

/** The network of an https origin, or null (X and Instagram load over https only). */
export function networkOfOrigin(origin: string): Network | null {
  return origin.startsWith('https://') ? networkOfHost(origin.slice('https://'.length)) : null
}

/** An added account's session id: 12 hex digits, made by main. */
const ACCOUNT_ID = /^[0-9a-f]{12}$/

export function isAccountId(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_ID.test(value)
}

/** The session of a network's added account. */
export function addedPartition(network: Network, id: string): string {
  return `${NETWORK_INFO[network].addedPrefix}${id}`
}

/** The id of a network's added-account session, or null for any other session name. */
export function accountIdOfPartition(network: Network, partition: string): string | null {
  const { addedPrefix } = NETWORK_INFO[network]
  const id = partition.startsWith(addedPrefix) ? partition.slice(addedPrefix.length) : ''

  return isAccountId(id) ? id : null
}

/** The network whose session this is, first or added, or null. */
export function networkOfPartition(partition: string): Network | null {
  return (
    NETWORKS.find(
      (network) =>
        partition === NETWORK_INFO[network].partition ||
        accountIdOfPartition(network, partition) !== null,
    ) ?? null
  )
}

/** The session of a network's account: its first (no id) or an added one. */
export function accountSession(network: Network, id: string | null): string {
  return id === null ? NETWORK_INFO[network].partition : addedPartition(network, id)
}

/**
 * An account's key among the unread counts (TASK-019, TASK-045). X's accounts keep their own: the
 * added account's id, or null for the first. Other networks' are `<network>` for the first account
 * and `<network>:<id>` for an added one.
 */
export type UnreadKey = string | null

export function unreadKey(network: Network, id: string | null): UnreadKey {
  if (network === 'x') {
    return id
  }

  return id === null ? network : `${network}:${id}`
}

/** The account an unread key names, or null when it names none. */
export function parseUnreadKey(value: unknown): { network: Network; id: string | null } | null {
  if (value === null) {
    return { network: 'x', id: null }
  }

  if (isAccountId(value)) {
    return { network: 'x', id: value }
  }

  if (typeof value !== 'string') {
    return null
  }

  const [network, id, ...rest] = value.split(':')
  if (network === 'x' || !isNetwork(network) || rest.length > 0) {
    return null
  }

  if (id === undefined) {
    return { network, id: null }
  }

  return isAccountId(id) ? { network, id } : null
}
