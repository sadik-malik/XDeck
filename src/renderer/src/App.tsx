import { useSelector } from '@tanstack/react-store'
import { type ReactNode, useEffect } from 'react'
import { accountNames } from '../../shared/accounts'
import { NETWORKS } from '../../shared/networks'
import { shortcutKey } from '../../shared/shortcuts'
import { ColumnStrip } from './columns/ColumnStrip'
import { ConfigError } from './config/ConfigError'
import { Welcome } from './login/Welcome'
import { XSessionProbe } from './login/XSessionProbe'
import { Overlays } from './Overlays'
import { NavRail } from './rail/NavRail'
import { runShortcut } from './shortcuts'
import { dataStore, openDeckStore, startDataLoad } from './state/data'
import { overlayStore } from './state/overlay'
import { settingsStore, startSettingsSync } from './state/settings'
import { TitleBar } from './TitleBar'
import { useAppTheme } from './theme/useAppTheme'

/** Every screen sits under XDeck's own title bar (TASK-024). */
function Shell({ deckName, children }: { deckName?: string; children?: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-app-bg text-app-text">
      <TitleBar deckName={deckName} />
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  )
}

/**
 * The screens: loading, the settings error, then the rail and the columns with the dialogs over them.
 * There is no login screen (TASK-043): with no account at all, a welcome screen takes the columns'
 * place, and every login happens in a login window. The state is in src/state (TASK-040); the components read it themselves.
 */
export function App() {
  // ─── State ───────────────────────────────────────────────────────────
  const config = useSelector(dataStore, (data) => data.config)
  const accounts = useSelector(dataStore, (data) => data.accounts)
  const unnamedXSession = useSelector(dataStore, (data) => data.unnamedXSession)
  const current = useSelector(openDeckStore)
  const settings = useSelector(settingsStore)

  // ─── Compute ─────────────────────────────────────────────────────────
  // The chrome follows X's theme colour (TASK-008).
  const onThemeColor = useAppTheme(settings?.darkMode, settings?.darkBg)

  // ─── Effects ─────────────────────────────────────────────────────────
  // Startup: the data and the settings, loaded and kept in step with main (src/state).
  useEffect(() => {
    const stopDataLoad = startDataLoad()
    const stopSettingsSync = startSettingsSync()

    return () => {
      stopDataLoad()
      stopSettingsSync()
    }
  }, [])

  // A desktop notification was clicked: show that network's first Notifications (or Mentions)
  // column, at the top (its header click scrolls it up).
  useEffect(
    () =>
      window.xdeck.onRevealNotifications((network) => {
        const kinds = network === 'instagram' ? ['igNotifications'] : ['notifications', 'mentions']
        const column = kinds
          .map((kind) =>
            document.querySelector(`[data-column][data-column-kind="page"][data-kind="${kind}"]`),
          )
          .find(Boolean)
        column?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
        column?.querySelector<HTMLElement>('[data-testid="column-header"]')?.click()
      }),
    [],
  )

  // XDeck's shortcut keys pressed in the shell (TASK-020), and Help → Keyboard Shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = shortcutKey(event)
      if (key !== null) {
        event.preventDefault()
        runShortcut(key)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    const unsubscribe = window.xdeck.onShowShortcuts(() =>
      overlayStore.actions.open({ kind: 'help' }),
    )

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      unsubscribe()
    }
  }, [])

  if (config === null || settings === null || accounts === null || unnamedXSession === undefined) {
    return <Shell />
  }

  if (!config.ok) {
    return (
      <Shell>
        <ConfigError failure={config} />
      </Shell>
    )
  }

  // A profile from the login-screen days: its X account is found once, before the columns show.
  if (unnamedXSession) {
    return (
      <Shell>
        <XSessionProbe />
      </Shell>
    )
  }

  // The layouts and the open deck are still loading.
  if (!current) {
    return <Shell />
  }

  return (
    <Shell deckName={current.decks.length > 1 ? current.decks[current.index].name : undefined}>
      <NavRail />
      {NETWORKS.every((network) => accountNames(accounts[network]).length === 0) ? (
        <Welcome />
      ) : (
        // Keyed by deck: switching decks unloads the old deck's pages and loads the new deck's.
        <ColumnStrip key={current.key} onThemeColor={onThemeColor} />
      )}
      <Overlays />
    </Shell>
  )
}
