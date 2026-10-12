import { ipcRenderer } from 'electron'
import { type ColumnScript, type ColumnSetup, parseColumnSetup } from '../shared/column-scripts'
import { shortcutKey } from '../shared/shortcuts'
import {
  findFacebookName,
  openFacebookNewPost,
  reportFacebookLogin,
  setFacebookBarsHidden,
} from './facebook'
import { setFilters } from './filters'
import { findUserName } from './find-user-name'
import { findInstagramUserName, openInstagramNewPost, setInstagramBarsHidden } from './instagram'
import { reportPageTheme } from './page-theme'
import {
  clickFollowingTab,
  clickForYouTab,
  setPostAreaHidden,
  setSideHeaderHidden,
} from './scripts'

// Preload for every column (<webview> guest). Forced by the main process (`will-attach-webview`).
// It runs in the guest's isolated world: it shares the DOM with the page but exposes nothing to the
// page's main world. It sends the embedder the ready message, the user name (login page) and
// XDeck's keyboard shortcuts.

/** One-shot actions: they run once per page load, even when the setup is sent again. */
const ACTIONS: Partial<Record<ColumnScript, () => void>> = {
  clickForYouTab,
  clickFollowingTab,
  findUserName,
  findInstagramUserName,
  openInstagramNewPost,
  reportPageTheme,
  reportFacebookLogin,
  findFacebookName,
  openFacebookNewPost,
}

/** Whether the DOM is ready for the scripts. Swift wrapOnLoad waits for DOMContentLoaded. */
let domReady = document.readyState !== 'loading'
/** A setup that arrived before DOMContentLoaded, run when it fires. */
let pendingSetup: ColumnSetup | null = null
/** This preload runs once per page load, so the actions run on the first setup only. */
let actionsDone = false
/**
 * Applies a setup. The renderer sends one on every page load and again when the column's role
 * changes (reordering moves the leftmost X column, TASK-014): styles follow the latest setup, and
 * actions such as tab clicks happen once, because clicking a selected tab scrolls X to the top.
 */
function runSetup(setup: ColumnSetup): void {
  setSideHeaderHidden(setup.scripts.includes('hideSideHeader'))
  setPostAreaHidden(setup.scripts.includes('hidePostArea'))
  setInstagramBarsHidden(setup.scripts.includes('hideInstagramBars'))
  setFacebookBarsHidden(setup.scripts.includes('hideFacebookBars'))
  if (!actionsDone) {
    actionsDone = true
    for (const name of setup.scripts) {
      ACTIONS[name]?.()
    }
  }

  setFilters(setup.filters)
}

document.addEventListener('DOMContentLoaded', () => {
  domReady = true
  if (pendingSetup) {
    const setup = pendingSetup
    pendingSetup = null
    runSetup(setup)
  }
})

// Sent on every page load, so the renderer answers with a setup for each one.
ipcRenderer.sendToHost('xdeck:preload-ready')

ipcRenderer.on('xdeck:column-setup', (_event, value: unknown) => {
  const setup = parseColumnSetup(value)
  if (!setup) {
    return
  }

  if (domReady) {
    runSetup(setup)
  } else {
    pendingSetup = setup
  }
})

// The column header was clicked (TweetDeck: a click on the header goes back to the newest posts).
ipcRenderer.on('xdeck:scroll-top', () => {
  // A jump, like TweetDeck: X adjusts the scroll position while it loads posts, which can stop a
  // smooth scroll part way.
  window.scrollTo({ top: 0, behavior: 'instant' })
})

// The shell is not told when the pointer moves from it into a page, so its tooltips are told here,
// once each time the pointer comes in. On the window: the preload runs before the page has <html>.
let pointerInPage = false
window.addEventListener('mouseover', () => {
  if (!pointerInPage) {
    pointerInPage = true
    ipcRenderer.sendToHost('xdeck:pointer-enter')
  }
})

window.addEventListener('mouseout', (event) => {
  if (event.relatedTarget === null) {
    pointerInPage = false
  }
})

// XDeck's shortcuts (1–9, N, /, ?) pressed inside a page go to the shell (TASK-020). Capture on the
// window runs before X's own key handlers, which would otherwise open X's versions in the column.
window.addEventListener(
  'keydown',
  (event) => {
    // Escape closes the Post popup (TASK-025). In columns it is passed on: X closes its own menus
    // with it. On X's compose page it is taken: X would close its editor and leave /compose, and the
    // popup would have to load the editor again before the next post (TASK-035).
    if (event.key === 'Escape') {
      if (window.location.pathname.startsWith('/compose')) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }

      ipcRenderer.sendToHost('xdeck:escape')

      return
    }

    const key = shortcutKey(event)
    if (key === null) {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    ipcRenderer.sendToHost('xdeck:shortcut', key)
  },
  true,
)
