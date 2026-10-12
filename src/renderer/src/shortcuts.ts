import { shortcutFor } from '../../shared/shortcuts'
import { revealColumn } from './columns/reveal'
import { dataStore, postDefault } from './state/data'
import { overlayStore } from './state/overlay'

/**
 * XDeck's shortcuts (TASK-020), from a column page (its preload forwards them) or from the shell.
 * Only while the columns are shown and nothing is over them. The stores are read when the key
 * comes, so no listener ever holds a stale state.
 */
export function runShortcut(key: string): void {
  const shortcut = shortcutFor(key)
  const { config } = dataStore.get()
  if (!shortcut || !config?.ok || overlayStore.get() !== null) {
    return
  }

  switch (shortcut.kind) {
    case 'column': {
      const button = document.querySelectorAll<HTMLElement>('[data-testid="rail-column"]')[
        shortcut.index
      ]
      const columnKey = button?.dataset.columnKey
      const column = columnKey ? revealColumn(columnKey) : null
      // The page gets the keyboard, so X's own keys (j, k, l...) work in it.
      column?.querySelector<HTMLElement>('webview')?.focus()
      break
    }

    case 'compose':
      postDefault()
      break
    case 'search':
      overlayStore.actions.open({ kind: 'add-column', choice: 'search' })
      break
    case 'help':
      overlayStore.actions.open({ kind: 'help' })
      break
  }
}
