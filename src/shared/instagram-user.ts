// How Instagram shows the logged-in user and its navigation (roadmap §9), in one place for the column
// preload and the account dialogs: Instagram's page changes, and both must follow it together.
// Instagram's class names are generated, so everything here goes by links, labels and alt texts.

/**
 * An Instagram user name: 1 to 30 letters, digits, periods or underscores, not starting or ending
 * with a period.
 */
const INSTAGRAM_USER_NAME = /^(?!\.)[A-Za-z0-9._]{1,30}(?<!\.)$/

export function isValidInstagramUsername(value: string): boolean {
  return INSTAGRAM_USER_NAME.test(value)
}

/** The Messages link, in Instagram's bottom tab bar (narrow) and its side navigation (wide). */
export const INBOX_LINK = 'a[href="/direct/inbox/"]'

/** The logged-in user's avatar in that navigation, alt "<name>'s profile picture". */
export const OWN_AVATAR = 'img[alt$="profile picture"]'

/**
 * Instagram's own navigation in a column, hidden: the rail is the navigation. The top bar (logo,
 * Search, Notifications) sits in a <nav> that also keeps its place; the bottom tab bar is the
 * element holding the Explore, Reels and Messages links, and its wrappers up to the page (never
 * anything that holds the feed itself, <main>). Found on real instagram.com (2026-10-12).
 */
export const HIDE_INSTAGRAM_BARS_CSS = `nav:has(header svg[aria-label="Instagram"]) { display: none !important; }
div:has(a[href="/explore/"]):has(a[href="/reels/"]):has(${INBOX_LINK}):not(:has(main)) { display: none !important; }`

/** Instagram's login form: a logged-out session sees it on any page (TASK-043). */
export const LOGIN_FORM = 'form input[name="password"], form input[type="password"]'

/** Instagram's New post button: it opens the create dialog over the page (there is no URL for it). */
export const NEW_POST_LINK = 'a:has(svg[aria-label="New post"])'

/** Instagram's dialogs: the create dialog among them. */
export const DIALOG = '[role="dialog"]'

/** One post in Instagram's feed. */
export const INSTAGRAM_POST = 'article'

/** A post that is a Reel links to it (/reel/… or /reels/…, not a Reel's audio page). */
export const REEL_LINK = 'a[href^="/reel/"], a[href^="/reels/"]:not([href^="/reels/audio/"])'
