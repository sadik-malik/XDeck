import { useSelector } from '@tanstack/react-store'
import { useEffect, useState } from 'react'
import type { ColumnConfig } from '../../shared/app-config'
import { describeColumn } from '../../shared/column-kinds'
import { columnKeys } from '../../shared/column-layout'
import { columnNetwork } from '../../shared/columns'
import { accountSession } from '../../shared/networks'
import { AddColumnDialog } from './columns/AddColumnDialog'
import { FiltersDialog } from './columns/FiltersDialog'
import { AccountNotice, LoginWindow, RemoveAccount } from './rail/AccountDialogs'
import { ComposePopup } from './rail/ComposePopup'
import { DeckDialogs } from './rail/DeckDialogs'
import { NetworkPostPopup } from './rail/NetworkPostPopup'
import { PagePopup } from './rail/PagePopup'
import { ShortcutsDialog } from './rail/ShortcutsDialog'
import { UserAgentDialog } from './rail/UserAgentDialog'
import {
  addColumn,
  cancelLogin,
  createDeck,
  dataStore,
  deleteDeck,
  loggedIn,
  logIn,
  removeAccount,
  renameDeck,
  saveFilters,
} from './state/data'
import { useLoaded } from './state/loaded'
import { type OverlayKind, overlayOf, overlayStore } from './state/overlay'

/** A dialog closed: the overlay goes, unless another kind has replaced it. */
function close(kind: OverlayKind) {
  overlayStore.actions.close(kind)
}

function closePopup() {
  close('popup')
}

function closeCompose() {
  close('compose')
}

/**
 * Adds a column, then offers to log in when its network has no account yet (TASK-043): the column
 * would only show a login button.
 */
async function addColumnAndLogIn(column: ColumnConfig, afterKey?: string): Promise<void> {
  await addColumn(column, afterKey)
  const network = columnNetwork(column)
  const accounts = dataStore.get().accounts
  if (network && accounts && accounts[network].first === null && !accounts[network].added.length) {
    logIn({ network, account: 'first' })
  }
}

/**
 * Every dialog and popup over the columns (TASK-040 step 4). The overlay store says which one is
 * open: at most one at a time.
 */
export function Overlays() {
  // ─── State ───────────────────────────────────────────────────────────
  const overlay = useSelector(overlayStore)
  const { deck, username, accounts, settings } = useLoaded()
  // The main account's Post editor loads in the background once the columns are up (TASK-025).
  const [composeReady, setComposeReady] = useState(false)

  // ─── Compute ─────────────────────────────────────────────────────────
  // Each dialog's part of the overlay, or null when another (or none) is showing.
  const adding = overlayOf(overlay, 'add-column')
  const filtering = overlayOf(overlay, 'filters')
  const composing = overlayOf(overlay, 'compose')
  const loggingIn = overlayOf(overlay, 'login')
  const removing = overlayOf(overlay, 'remove-account')
  const notice = overlayOf(overlay, 'notice')
  const deckDialog = overlayOf(overlay, 'deck')?.dialog ?? null
  const popup = overlayOf(overlay, 'popup')?.page ?? null

  const keys = columnKeys(deck.columns)
  const filtersIndex = filtering ? keys.indexOf(filtering.columnKey) : -1
  const filtersColumn =
    filtersIndex < 0
      ? null
      : {
          key: keys[filtersIndex],
          network: columnNetwork(deck.columns[filtersIndex]) ?? 'x',
          title: describeColumn(deck.columns[filtersIndex], username).title,
          filters: deck.columns[filtersIndex].filters,
        }
  const deckName = deck.decks[deck.index].name

  // ─── Effects ─────────────────────────────────────────────────────────
  // The main account's Post editor loads a few seconds after the columns, so it does not compete
  // with them, and is ready when Post is clicked (TASK-025).
  useEffect(() => {
    const timer = setTimeout(() => setComposeReady(true), 4_000)

    return () => clearTimeout(timer)
  }, [])

  // View → Add Column… (also Ctrl/Cmd+T).
  useEffect(
    () => window.xdeck.onAddColumnRequest(() => overlayStore.actions.open({ kind: 'add-column' })),
    [],
  )

  return (
    <>
      <AddColumnDialog
        open={adding !== null}
        onOpenChange={(open) => !open && close('add-column')}
        onAdd={(column) => addColumnAndLogIn(column, adding?.after)}
        initialChoice={adding?.choice}
        accounts={accounts}
      />
      <LoginWindow
        target={loggingIn?.target ?? null}
        onUserName={loggedIn}
        onCancel={cancelLogin}
      />
      <AccountNotice message={notice?.text ?? null} onClose={() => close('notice')} />
      <RemoveAccount
        account={removing?.account ?? null}
        onClose={() => close('remove-account')}
        onRemove={() => (removing ? removeAccount(removing.account) : Promise.resolve())}
      />
      <PagePopup page={popup} onClose={closePopup} />
      <ComposePopup
        partition={accountSession('x', null)}
        open={composing !== null && composing.account === null}
        // Only with a first X account: its session has no one to post as otherwise.
        keepLoaded={composeReady && username !== null}
        onClose={closeCompose}
      />
      {composing?.account && (
        <ComposePopup
          key={composing.account}
          partition={accountSession('x', composing.account)}
          open
          keepLoaded={false}
          onClose={closeCompose}
        />
      )}
      <NetworkPostPopup
        post={overlayOf(overlay, 'network-post')}
        onClose={() => close('network-post')}
      />
      <ShortcutsDialog
        open={overlay?.kind === 'help'}
        onOpenChange={(open) =>
          open ? overlayStore.actions.open({ kind: 'help' }) : close('help')
        }
      />
      <UserAgentDialog
        open={overlay?.kind === 'user-agent'}
        current={settings.userAgent}
        onClose={() => close('user-agent')}
      />
      <FiltersDialog
        column={filtersColumn}
        onClose={() => close('filters')}
        onSave={(filters) =>
          filtersColumn ? saveFilters(filtersColumn.key, filters) : Promise.resolve()
        }
      />
      <DeckDialogs
        state={deckDialog}
        deckName={deckName}
        otherNames={deck.decks.filter((_, i) => i !== deck.index).map((other) => other.name)}
        allNames={deck.decks.map((other) => other.name)}
        onClose={() => close('deck')}
        onCreate={createDeck}
        onRename={renameDeck}
        onDelete={deleteDeck}
      />
    </>
  )
}
