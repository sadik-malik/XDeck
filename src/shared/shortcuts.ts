/**
 * XDeck's single-key shortcuts (TASK-020), like TweetDeck's: 1–9 go to that column, N posts, /
 * searches, ? lists the shortcuts. They work from the shell and from inside any column page (the
 * column preload forwards them), but never while typing, and never with Ctrl, Alt or ⌘ held, so X's
 * own keys (j, k, l, r...) and the menu accelerators keep working.
 */
export type Shortcut =
  | { kind: 'column'; index: number }
  | { kind: 'compose' }
  | { kind: 'search' }
  | { kind: 'help' }

/** The shortcut a key is, or null. `key` is KeyboardEvent.key. */
export function shortcutFor(key: string): Shortcut | null {
  if (/^[1-9]$/.test(key)) {
    return { kind: 'column', index: Number(key) - 1 }
  }

  switch (key) {
    case 'n':
    case 'N':
      return { kind: 'compose' }
    case '/':
      return { kind: 'search' }
    case '?':
      return { kind: 'help' }
    default:
      return null
  }
}

/** The parts of a keydown event the check needs (DOM KeyboardEvent). */
type KeyEventLike = {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  isComposing: boolean
  target: EventTarget | null
}

function isEditable(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') {
    return false
  }

  const element = target as HTMLElement

  return (
    element.isContentEditable ||
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT'
  )
}

/** The key of a keydown that is an XDeck shortcut, or null (typing, modifiers, other keys). */
export function shortcutKey(event: KeyEventLike): string | null {
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) {
    return null
  }

  if (isEditable(event.target)) {
    return null
  }

  return shortcutFor(event.key) ? event.key : null
}

/** The list the help dialog shows. */
export const SHORTCUT_HELP: { keys: string; action: string }[] = [
  { keys: '1 – 9', action: 'Go to that column' },
  { keys: 'N', action: 'New post' },
  { keys: '/', action: 'Search (add a search column)' },
  { keys: '?', action: 'Show these shortcuts' },
]
