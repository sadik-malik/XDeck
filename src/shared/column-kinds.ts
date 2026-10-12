import type { ColumnConfig } from './app-config'
import { INSTAGRAM_ORIGIN, X_ORIGIN } from './columns'
import { isValidInstagramUsername } from './instagram-user'
import { NETWORK_INFO, type Network, networkOfHost } from './networks'
import { isValidUsername } from './username'

/**
 * What a column shows, for its header icon and title. The four built-in types map one to one.
 * A custom column on an X host is recognised from its URL (search, list, user, bookmarks...), so
 * the add-column picker can store those as plain `custom` URLs and settings.json keeps its format.
 * Instagram columns (roadmap §9) and Facebook columns (roadmap §11) are stored the same way, as
 * their network's URLs.
 */
export type ColumnKind =
  | 'forYou'
  | 'following'
  | 'notifications'
  | 'profile'
  | 'home'
  | 'search'
  | 'list'
  | 'user'
  | 'bookmarks'
  | 'messages'
  | 'explore'
  | 'mentions'
  | 'community'
  | 'xPage'
  | 'igFeed'
  | 'igReels'
  | 'igExplore'
  | 'igNotifications'
  | 'igMessages'
  | 'igUser'
  | 'igTag'
  | 'igSaved'
  | 'igPage'
  | 'fbFeed'
  | 'fbNotifications'
  | 'fbVideo'
  | 'fbReels'
  | 'fbGroups'
  | 'fbGroup'
  | 'fbPage'
  | 'fbMarketplace'
  | 'fbEvents'
  | 'fbSaved'
  | 'fbSearch'
  | 'fbTag'
  | 'fbOther'
  | 'web'

export type ColumnDescription = {
  kind: ColumnKind
  title: string
  /** The title is only a stand-in: the header shows the page's own title once it has one. */
  usePageTitle: boolean
}

/** First path segments of X that are app pages, never a user name. */
const RESERVED_PATHS = new Set([
  'home',
  'explore',
  'search',
  'notifications',
  'messages',
  'i',
  'settings',
  'compose',
  'login',
  'logout',
  'signup',
  'tos',
  'privacy',
  'jobs',
])

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function isXUrl(url: URL): boolean {
  return networkOfHost(url.hostname) === 'x'
}

function isInstagramUrl(url: URL): boolean {
  return networkOfHost(url.hostname) === 'instagram'
}

/** An Instagram hashtag: letters (any script), digits and underscores. */
const INSTAGRAM_TAG = /^[\p{L}\p{N}_]{1,100}$/u

/** First path segments of Instagram that are app pages, never a user name. */
const INSTAGRAM_RESERVED = new Set([
  'accounts',
  'direct',
  'explore',
  'reels',
  'reel',
  'p',
  'stories',
  'tv',
  'about',
  'legal',
  'developer',
  'web',
  'challenge',
  'emails',
  'session',
  'notifications',
  'popular',
])

/**
 * First path segments of Facebook that are its own pages, never a Page's or person's name. Messages
 * is among them: XDeck has no Messenger columns (roadmap §11).
 */
const FACEBOOK_RESERVED = new Set([
  'groups',
  'watch',
  'reel',
  'reels',
  'marketplace',
  'events',
  'saved',
  'search',
  'hashtag',
  'notifications',
  'messages',
  'gaming',
  'friends',
  'memories',
  'settings',
  'help',
  'login',
  'login.php',
  'checkpoint',
  'recover',
  'pages',
  'photo',
  'photo.php',
  'permalink.php',
  'story.php',
  'stories',
  'share',
  'sharer',
  'privacy',
  'policies',
  'bookmarks',
  'ads',
  'business',
  'fundraisers',
  'live',
  'news',
  'feeds',
  'profile.php',
  'me',
  'home.php',
  'l.php',
  'dialog',
  'plugins',
  'video',
  'videos',
  'places',
  'games',
  'offers',
  'jobs',
  'two_step_verification',
])

/** A Facebook Page's or person's user name: at least 5 letters, digits or periods. */
const FACEBOOK_NAME = /^[A-Za-z0-9.]{5,50}$/

/** A Facebook group's address: its number or its own name. */
const FACEBOOK_GROUP = /^[A-Za-z0-9._-]{1,100}$/

/** A Facebook hashtag: letters (any script), digits and underscores. */
const FACEBOOK_TAG = /^[\p{L}\p{N}_]{1,100}$/u

/** Header icon kind and title of a column. `username` is the first X account's name, if any. */
export function describeColumn(column: ColumnConfig, username: string | null): ColumnDescription {
  switch (column.type) {
    case 'forYou':
      return { kind: 'forYou', title: 'For you', usePageTitle: false }
    case 'following':
      return { kind: 'following', title: 'Following', usePageTitle: false }
    case 'notifications':
      return { kind: 'notifications', title: 'Notifications', usePageTitle: false }
    case 'profile':
      return {
        kind: 'profile',
        title: column.account || username ? `@${column.account ?? username}` : 'Your profile',
        usePageTitle: false,
      }
    case 'custom':
      return describeCustomUrl(column.url)
  }
}

function describeCustomUrl(raw: string): ColumnDescription {
  const url = parseUrl(raw)
  if (!url) {
    return { kind: 'web', title: raw, usePageTitle: false }
  }

  if (isInstagramUrl(url)) {
    return describeInstagramUrl(url)
  }

  if (networkOfHost(url.hostname) === 'facebook') {
    return describeFacebookUrl(url)
  }

  if (!isXUrl(url)) {
    return { kind: 'web', title: url.host, usePageTitle: false }
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const [first = '', second = ''] = segments
  if (first === 'search') {
    const query = url.searchParams.get('q')?.trim()

    return { kind: 'search', title: query ? `Search: ${query}` : 'Search', usePageTitle: false }
  }

  if (first === 'home') {
    return { kind: 'home', title: 'Home', usePageTitle: false }
  }

  if (first === 'explore') {
    return { kind: 'explore', title: 'Explore', usePageTitle: false }
  }

  if (first === 'messages') {
    return { kind: 'messages', title: 'Messages', usePageTitle: false }
  }

  if (first === 'notifications') {
    return second === 'mentions'
      ? { kind: 'mentions', title: 'Mentions', usePageTitle: false }
      : { kind: 'notifications', title: 'Notifications', usePageTitle: false }
  }

  if (first === 'i' && second === 'bookmarks') {
    return { kind: 'bookmarks', title: 'Bookmarks', usePageTitle: false }
  }
  // List and community names are only known to the page.
  if (first === 'i' && second === 'lists') {
    return { kind: 'list', title: 'List', usePageTitle: true }
  }

  if (first === 'i' && second === 'communities') {
    return { kind: 'community', title: 'Community', usePageTitle: true }
  }

  if (segments.length >= 1 && !RESERVED_PATHS.has(first.toLowerCase()) && isValidUsername(first)) {
    return { kind: 'user', title: `@${first}`, usePageTitle: false }
  }

  return { kind: 'xPage', title: 'X', usePageTitle: true }
}

/** An Instagram column, from its URL. */
function describeInstagramUrl(url: URL): ColumnDescription {
  const [first = '', second = '', third = ''] = url.pathname.split('/').filter(Boolean)
  const described = (kind: ColumnKind, title: string): ColumnDescription => ({
    kind,
    title,
    usePageTitle: false,
  })
  if (first === '') {
    return described('igFeed', 'Instagram')
  }

  if (first === 'reels') {
    return described('igReels', 'Instagram Reels')
  }

  if (first === 'explore' && second === 'tags' && INSTAGRAM_TAG.test(decodeURIComponent(third))) {
    return described('igTag', `#${decodeURIComponent(third)}`)
  }

  if (first === 'explore' && second === '') {
    return described('igExplore', 'Instagram Explore')
  }

  if (first === 'notifications' || (first === 'accounts' && second === 'activity')) {
    return described('igNotifications', 'Instagram Notifications')
  }

  if (first === 'direct') {
    return described('igMessages', 'Instagram Messages')
  }

  if (!INSTAGRAM_RESERVED.has(first.toLowerCase()) && isValidInstagramUsername(first)) {
    // An account's saved posts: only its own session can see them (TASK-049).
    return second === 'saved'
      ? described('igSaved', `@${first} · Saved`)
      : described('igUser', `@${first}`)
  }

  return described('igPage', 'Instagram')
}

/** A Facebook column, from its URL (roadmap §11). Names of groups and people are the page's. */
function describeFacebookUrl(url: URL): ColumnDescription {
  const [first = '', second = ''] = url.pathname.split('/').filter(Boolean)
  const described = (kind: ColumnKind, title: string, usePageTitle = false): ColumnDescription => ({
    kind,
    title,
    usePageTitle,
  })
  switch (first) {
    case '':
      return described('fbFeed', 'Facebook')
    case 'notifications':
      return described('fbNotifications', 'Facebook Notifications')
    case 'watch':
      return described('fbVideo', 'Facebook Video')
    case 'reel':
    case 'reels':
      return described('fbReels', 'Facebook Reels')
    case 'marketplace':
      return described('fbMarketplace', 'Marketplace')
    case 'events':
      return described('fbEvents', 'Facebook Events')
    case 'saved':
      return described('fbSaved', 'Facebook Saved')
    case 'groups':
      return second === '' || second === 'feed'
        ? described('fbGroups', 'Facebook Groups')
        : described('fbGroup', 'Group', true)
    case 'search': {
      const query = url.searchParams.get('q')?.trim()

      return described('fbSearch', query ? `Search: ${query}` : 'Facebook Search')
    }

    case 'hashtag': {
      const tag = decodeURIComponent(second)

      return FACEBOOK_TAG.test(tag)
        ? described('fbTag', `#${tag}`)
        : described('fbOther', 'Facebook', true)
    }

    case 'profile.php':
      return described('fbPage', 'Facebook profile', true)
  }

  if (!FACEBOOK_RESERVED.has(first.toLowerCase()) && FACEBOOK_NAME.test(first)) {
    return described('fbPage', first, true)
  }

  return described('fbOther', 'Facebook', true)
}

/**
 * X's document title without its decorations: "(3) Bookmarks / X" → "Bookmarks". Empty when
 * nothing is left, or when the page has not set a real title yet ("X").
 */
export function cleanPageTitle(raw: string): string {
  const title = raw
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(/\s*\/\s*X$/, '')
    .replace(/\s*\|\s*Facebook$/, '')
    .trim()
  return title === 'X' || title === 'Facebook' ? '' : title
}

/**
 * X's unread notification count from a page title: "(3) Home / X" → 3, "(20+) Home / X" → 20, no
 * prefix → 0 (TASK-019).
 */
export function unreadCount(title: string): number {
  const match = /^\((\d{1,4})\+?\)/.exec(title)

  return match ? Number(match[1]) : 0
}

/** The picker's sections: one per network (src/shared/networks.ts). */
export type ColumnNetwork = Network

/** Choices in the add-column picker, in the order shown, by section. */
export const COLUMN_CHOICES = [
  { id: 'forYou', label: 'For you', input: null, network: 'x' },
  { id: 'following', label: 'Following', input: null, network: 'x' },
  { id: 'notifications', label: 'Notifications', input: null, network: 'x' },
  { id: 'mentions', label: 'Mentions', input: null, network: 'x' },
  { id: 'profile', label: 'Your profile', input: null, network: 'x' },
  { id: 'search', label: 'Search', input: 'query', network: 'x' },
  { id: 'user', label: 'User', input: 'handle', network: 'x' },
  { id: 'list', label: 'List', input: 'list', network: 'x' },
  { id: 'bookmarks', label: 'Bookmarks', input: null, network: 'x' },
  { id: 'messages', label: 'Messages', input: null, network: 'x' },
  { id: 'explore', label: 'Explore', input: null, network: 'x' },
  { id: 'igFeed', label: 'Feed', input: null, network: 'instagram' },
  { id: 'igReels', label: 'Reels', input: null, network: 'instagram' },
  { id: 'igExplore', label: 'Explore', input: null, network: 'instagram' },
  { id: 'igNotifications', label: 'Notifications', input: null, network: 'instagram' },
  { id: 'igMessages', label: 'Messages', input: null, network: 'instagram' },
  // The chosen Instagram account's own pages (TASK-049): shown only with an Instagram account.
  { id: 'igProfile', label: 'Your profile', input: null, network: 'instagram' },
  { id: 'igSaved', label: 'Saved', input: null, network: 'instagram' },
  { id: 'igUser', label: 'User', input: 'igHandle', network: 'instagram' },
  { id: 'igTag', label: 'Hashtag', input: 'igTag', network: 'instagram' },
  { id: 'fbFeed', label: 'Feed', input: null, network: 'facebook' },
  { id: 'fbNotifications', label: 'Notifications', input: null, network: 'facebook' },
  { id: 'fbVideo', label: 'Video', input: null, network: 'facebook' },
  { id: 'fbGroups', label: 'Groups', input: null, network: 'facebook' },
  { id: 'fbGroup', label: 'Group', input: 'fbGroup', network: 'facebook' },
  { id: 'fbPage', label: 'Page or person', input: 'fbPage', network: 'facebook' },
  { id: 'fbMarketplace', label: 'Marketplace', input: null, network: 'facebook' },
  { id: 'fbEvents', label: 'Events', input: null, network: 'facebook' },
  // The chosen Facebook account's own pages: shown only with a Facebook account.
  { id: 'fbProfile', label: 'Your profile', input: null, network: 'facebook' },
  { id: 'fbSaved', label: 'Saved', input: null, network: 'facebook' },
] as const

export type ColumnChoice = (typeof COLUMN_CHOICES)[number]
export type ColumnChoiceId = ColumnChoice['id']
export type ColumnInput = NonNullable<ColumnChoice['input']>

export type BuildResult = { ok: true; column: ColumnConfig } | { ok: false; message: string }

const MAX_QUERY_LENGTH = 500

/**
 * Builds the settings.json entry for a picker choice. `value` is the text field, when it has one;
 * `account` is the account chosen for the choice's network, for its own pages (Instagram's profile
 * and saved posts, Facebook's profile).
 */
export function buildColumn(
  id: ColumnChoiceId,
  value = '',
  account: string | null = null,
): BuildResult {
  const text = value.trim()
  switch (id) {
    case 'forYou':
    case 'following':
    case 'notifications':
    case 'profile':
      return { ok: true, column: { type: id } }
    case 'mentions':
      return xColumn('/notifications/mentions')
    case 'bookmarks':
      return xColumn('/i/bookmarks')
    case 'messages':
      return xColumn('/messages')
    case 'explore':
      return xColumn('/explore')
    case 'search': {
      if (!text) {
        return { ok: false, message: 'Enter something to search for.' }
      }

      if (text.length > MAX_QUERY_LENGTH) {
        return { ok: false, message: 'The search is too long.' }
      }
      // Latest posts first, like a TweetDeck search column.
      return xColumn(`/search?q=${encodeURIComponent(text)}&f=live`)
    }

    case 'user': {
      const handle = text.replace(/^@/, '')
      if (!isValidUsername(handle) || RESERVED_PATHS.has(handle.toLowerCase())) {
        return { ok: false, message: 'Enter a user name, like @XDevelopers.' }
      }

      return xColumn(`/${handle}`)
    }

    case 'list': {
      const listId = parseListId(text)
      if (!listId) {
        return { ok: false, message: 'Enter a list link (x.com/i/lists/…) or its number.' }
      }

      return xColumn(`/i/lists/${listId}`)
    }

    case 'igFeed':
      return instagramColumn('/')
    case 'igReels':
      return instagramColumn('/reels/')
    case 'igExplore':
      return instagramColumn('/explore/')
    case 'igNotifications':
      return instagramColumn('/notifications/')
    case 'igMessages':
      return instagramColumn('/direct/inbox/')
    case 'igProfile':
    case 'igSaved': {
      if (!account || !isValidInstagramUsername(account)) {
        return { ok: false, message: 'Add an Instagram account first.' }
      }

      return instagramColumn(id === 'igSaved' ? `/${account}/saved/` : `/${account}/`)
    }

    case 'igUser': {
      const handle = text.replace(/^@/, '')
      if (!isValidInstagramUsername(handle) || INSTAGRAM_RESERVED.has(handle.toLowerCase())) {
        return { ok: false, message: 'Enter an Instagram user name, like @instagram.' }
      }

      return instagramColumn(`/${handle}/`)
    }

    case 'igTag': {
      const tag = text.replace(/^#/, '')
      if (!INSTAGRAM_TAG.test(tag)) {
        return { ok: false, message: 'Enter a hashtag, like #photography.' }
      }

      return instagramColumn(`/explore/tags/${encodeURIComponent(tag)}/`)
    }

    case 'fbFeed':
      return facebookColumn('/')
    case 'fbNotifications':
      return facebookColumn('/notifications')
    case 'fbVideo':
      return facebookColumn('/watch')
    case 'fbGroups':
      return facebookColumn('/groups/feed/')
    case 'fbMarketplace':
      return facebookColumn('/marketplace')
    case 'fbEvents':
      return facebookColumn('/events')
    case 'fbSaved':
      return facebookColumn('/saved')
    case 'fbProfile':
      return account && NETWORK_INFO.facebook.isValidName(account)
        ? facebookColumn(`/profile.php?id=${account}`)
        : { ok: false, message: 'Add a Facebook account first.' }
    case 'fbGroup': {
      const group = facebookPathPart(text, /^\/groups\/([^/]+)\/?/) ?? text
      if (!FACEBOOK_GROUP.test(group) || group === 'feed') {
        return { ok: false, message: 'Enter a group link (facebook.com/groups/…) or its number.' }
      }

      return facebookColumn(`/groups/${group}/`)
    }

    case 'fbPage': {
      const profileId = facebookProfileId(text)
      if (profileId) {
        return facebookColumn(`/profile.php?id=${profileId}`)
      }

      const name = facebookPathPart(text, /^\/([^/]+)\/?$/) ?? text.replace(/^@/, '')
      if (!FACEBOOK_NAME.test(name) || FACEBOOK_RESERVED.has(name.toLowerCase())) {
        return { ok: false, message: 'Enter a Page or profile link, like facebook.com/meta.' }
      }

      return facebookColumn(`/${name}`)
    }
  }
}

function facebookColumn(path: string): BuildResult {
  return { ok: true, column: { type: 'custom', url: `${NETWORK_INFO.facebook.origin}${path}` } }
}

/** A Facebook link typed into the picker, or null when the text is not one. */
function facebookLink(text: string): URL | null {
  const url = parseUrl(/^https?:/i.test(text) ? text : `https://${text}`)

  return url && networkOfHost(url.hostname) === 'facebook' ? url : null
}

/** The part of a Facebook link's path that `pattern` captures, or null. */
function facebookPathPart(text: string, pattern: RegExp): string | null {
  const url = text.includes('facebook.com') ? facebookLink(text) : null

  return url ? (pattern.exec(url.pathname)?.[1] ?? null) : null
}

/** The user id of a profile.php link, or null. */
function facebookProfileId(text: string): string | null {
  const url = text.includes('facebook.com') ? facebookLink(text) : null
  const id = url?.pathname === '/profile.php' ? url.searchParams.get('id') : null

  return id && NETWORK_INFO.facebook.isValidName(id) ? id : null
}

function xColumn(path: string): BuildResult {
  return { ok: true, column: { type: 'custom', url: `${X_ORIGIN}${path}` } }
}

function instagramColumn(path: string): BuildResult {
  return { ok: true, column: { type: 'custom', url: `${INSTAGRAM_ORIGIN}${path}` } }
}

/** A list's number from its link or from the number itself. */
function parseListId(text: string): string | null {
  if (/^\d{1,25}$/.test(text)) {
    return text
  }

  const url = parseUrl(/^https?:/i.test(text) ? text : `https://${text}`)
  if (!url || !isXUrl(url)) {
    return null
  }

  const match = /^\/i\/lists\/(\d{1,25})\/?$/.exec(url.pathname)

  return match ? match[1] : null
}
