// How Facebook shows the logged-in user and its pages (roadmap §11), in one place for the column
// preload, the login window and main: Facebook's page changes often, and all of them must follow it
// together. Its class names are generated and its text follows the account's language, so
// everything here goes by roles, attributes, links and cookies.

/**
 * A Facebook account in XDeck is its numeric user id: many accounts have no user name
 * (profile.php?id=…). Main reads it from the session's c_user cookie, never from the page.
 */
const FACEBOOK_ID = /^[1-9][0-9]{4,19}$/

export function isValidFacebookId(value: string): boolean {
  return FACEBOOK_ID.test(value)
}

/** The cookie that holds the logged-in user's id. */
export const FACEBOOK_USER_COOKIE = 'c_user'

/** Facebook's login form: a logged-out session sees it on any page (TASK-043). */
export const FACEBOOK_LOGIN_FORM = 'form input[name="pass"], form input[type="password"]'

/** Facebook's Messenger dock: the floating container with the new-message button's pencil icon. */
export const MESSENGER_DOCK =
  'div[data-visualcompletion="ignore"] > div:has(div[role="button"] path[d^="M17.99.93a1.75"])'

/**
 * Facebook's top bar (role=banner) hidden in a column: XDeck's rail is the navigation. The page below
 * it is shifted down to make room (a wrapper with top: 56px, beside the bar), so the shift goes too.
 * Facebook leaves out its side columns at a column's width; wider, they are hidden as well. Its
 * Messenger dock (the floating new-message button, and chats opened from it) goes too: XDeck has no
 * Messenger (roadmap §11). The dock has no hook but its label, which is in the account's language,
 * so it is found by its pencil icon's path. Found on facebook.com at 380 px, 2026-10-12.
 */
export const HIDE_FACEBOOK_BARS_CSS = `div[role="banner"] { display: none !important; }
div:has(> div[role="banner"]) > div:has(div[role="main"]) > div > div { top: 0 !important; }
div[role="navigation"]:has(a[href*="/friends"]), div[role="complementary"] { display: none !important; }
${MESSENGER_DOCK} { display: none !important; }`

/** One post in Facebook's feed: each has its position in the feed. */
export const FACEBOOK_POST = '[aria-posinset]'

/** A post that is a Reel links to it. */
export const FACEBOOK_REEL_LINK = 'a[href*="/reel/"]'

/**
 * Facebook's own post box on the feed, which opens its create-post dialog: the first button in the
 * "Create a post" region (found by role, not by its label, which is in the account's language).
 */
export const FACEBOOK_POST_BOX = 'div[role="main"] div[role="region"] div[role="button"]'

/** Facebook's dialogs: its create-post dialog among them. */
export const FACEBOOK_DIALOG = 'div[role="dialog"]'

/**
 * The logged-in user's id and name as Facebook's page data has them (`CurrentUserInitialData`), the
 * same in every language. The account's name is only a label: the id comes from the cookie.
 */
export function facebookUserInPageData(text: string): { id: string; name: string } | null {
  const data = /"CurrentUserInitialData",\[\],(\{[^}]*\})/.exec(text)?.[1]
  if (!data) {
    return null
  }

  try {
    const { USER_ID: id, NAME: name } = JSON.parse(data) as Record<string, unknown>

    return typeof id === 'string' && isValidFacebookId(id) && typeof name === 'string'
      ? { id, name }
      : null
  } catch {
    return null
  }
}

/** Hosts of Facebook's link shim, which every outbound link goes through. */
const LINK_SHIM_HOSTS = ['l.facebook.com', 'lm.facebook.com']

/**
 * The real address of a link that goes through Facebook's link shim (`l.facebook.com/l.php?u=…`),
 * or the URL itself. The shim's host is not one XDeck's columns load, so its link goes to the
 * browser, which should get the page the user clicked, not Facebook's redirect.
 */
export function unwrapLinkShim(raw: string): string {
  try {
    const url = new URL(raw)
    if (!LINK_SHIM_HOSTS.includes(url.hostname) || url.pathname !== '/l.php') {
      return raw
    }

    const target = new URL(url.searchParams.get('u') ?? '')

    return target.protocol === 'https:' || target.protocol === 'http:' ? target.href : raw
  } catch {
    return raw
  }
}
