import { type ColumnFilters, hasFilters } from '../shared/column-filters'
import { FACEBOOK_POST, FACEBOOK_REEL_LINK } from '../shared/facebook-user'
import { INSTAGRAM_POST, REEL_LINK } from '../shared/instagram-user'
import { networkOfHost } from '../shared/networks'

// Column filters (TASK-021), like TweetDeck's. A hidden post's timeline cell gets an attribute, and
// one stylesheet hides those cells.

const CELL_SELECTOR = 'div[data-testid="cellInnerDiv"]'
const POST_SELECTOR = 'article[data-testid="tweet"]'
const HIDDEN_ATTRIBUTE = 'data-xdeck-filtered'
const STYLE_ID = 'xdeck-column-filters'
/** Photos, videos, GIFs and media cards. */
const MEDIA_SELECTOR =
  '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="card.layoutLarge.media"], [data-testid="card.layoutSmall.media"]'

let filters: ColumnFilters | null = null
let mutedWords: string[] = []
let observer: MutationObserver | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Instagram's and Facebook's posts (TASK-046, roadmap §11): each post is its own cell, and a Reel
 * links to it. X's cells are below.
 */
const POSTS = {
  instagram: { post: INSTAGRAM_POST, reel: REEL_LINK },
  facebook: { post: FACEBOOK_POST, reel: FACEBOOK_REEL_LINK },
}

const network = networkOfHost(location.hostname)
const posts = network === 'instagram' || network === 'facebook' ? POSTS[network] : null

/** Whether an Instagram or Facebook post is filtered out: a Reel, or a muted word anywhere in it. */
function isPostFilteredOut(post: Element, active: ColumnFilters): boolean {
  if (active.hideReels && posts && post.querySelector(posts.reel)) {
    return true
  }

  const text = (post.textContent ?? '').toLocaleLowerCase()

  return mutedWords.some((word) => text.includes(word))
}

/**
 * Whether a cell's post is filtered out. A repost carries X's social context line ("… reposted"),
 * which links to the person who reposted; a pinned post's context line is not a link.
 */
function isFilteredOut(cell: Element, active: ColumnFilters): boolean {
  const post = cell.querySelector(POST_SELECTOR)
  if (!post) {
    return false
  }

  if (active.hideReposts && post.querySelector('[data-testid="socialContext"]')?.closest('a')) {
    return true
  }

  if (active.mediaOnly && !post.querySelector(MEDIA_SELECTOR)) {
    return true
  }

  if (mutedWords.length > 0) {
    const text = (
      post.querySelector('[data-testid="tweetText"]')?.textContent ?? ''
    ).toLocaleLowerCase()
    if (mutedWords.some((word) => text.includes(word))) {
      return true
    }
  }

  return false
}

function apply(): void {
  // A post opened inside the column shows its whole conversation, as TweetDeck's detail view did.
  const active = filters && !/\/status\/\d+/.test(location.pathname) ? filters : null
  const filteredOut = posts ? isPostFilteredOut : isFilteredOut
  for (const cell of document.querySelectorAll(posts ? posts.post : CELL_SELECTOR)) {
    if (active && filteredOut(cell, active)) {
      cell.setAttribute(HIDDEN_ATTRIBUTE, '')
    } else {
      cell.removeAttribute(HIDDEN_ATTRIBUTE)
    }
  }
}

/** Applies a column's filters, or removes them all when it has none. */
export function setFilters(next: ColumnFilters | undefined): void {
  if (!hasFilters(next)) {
    filters = null
    mutedWords = []
    observer?.disconnect()
    observer = null
    clearTimeout(timer)
    document.getElementById(STYLE_ID)?.remove()
    apply()

    return
  }

  filters = next as ColumnFilters
  mutedWords = (filters.mutedWords ?? []).map((word) => word.toLocaleLowerCase())
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `[${HIDDEN_ATTRIBUTE}] { display: none !important; }`
    document.head.appendChild(style)
  }

  if (!observer) {
    // Debounced: X adds timeline cells in bursts.
    observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(apply, 100)
    })

    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  apply()
}
