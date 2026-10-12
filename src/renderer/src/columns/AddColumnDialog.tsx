import { type FormEvent, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { accountLabel, accountNames, type KnownAccounts } from '../../../shared/accounts'
import type { ColumnConfig } from '../../../shared/app-config'
import {
  buildColumn,
  COLUMN_CHOICES,
  type ColumnChoice,
  type ColumnChoiceId,
  type ColumnInput,
  type ColumnNetwork,
} from '../../../shared/column-kinds'
import { NETWORK_INFO, NETWORKS } from '../../../shared/networks'
import { ColumnIcon } from './ColumnIcon'

const INPUTS: Record<ColumnInput, { label: string; placeholder: string }> = {
  query: { label: 'Search for', placeholder: 'electron OR #webdev' },
  handle: { label: 'User name', placeholder: '@XDevelopers' },
  list: { label: 'List link or number', placeholder: 'https://x.com/i/lists/…' },
  igHandle: { label: 'Instagram user name', placeholder: '@instagram' },
  igTag: { label: 'Hashtag', placeholder: '#photography' },
  fbGroup: { label: 'Group link or number', placeholder: 'https://www.facebook.com/groups/…' },
  fbPage: { label: 'Page or profile link', placeholder: 'https://www.facebook.com/meta' },
}

/** Each network's first account, the one a new column shows unless another is chosen. */
function firstChoices(accounts: KnownAccounts): Record<ColumnNetwork, string | null> {
  return Object.fromEntries(
    NETWORKS.map((network) => [network, accountNames(accounts[network])[0] ?? null]),
  ) as Record<ColumnNetwork, string | null>
}

/** Choices that need an account of their network: hidden while it has none. */
const NEEDS_ACCOUNT = new Set<ColumnChoiceId>(['igProfile', 'igSaved', 'fbProfile'])

/** The picker's sections, in the order shown: one per network. */
const SECTIONS = NETWORKS.map((network) => ({ network, title: NETWORK_INFO[network].name }))

type AddColumnDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Saves the column. Rejects with a message to show when it could not be saved. */
  onAdd: (column: ColumnConfig) => Promise<void>
  /** The choice to start on (the rail's Search button starts on Search). */
  initialChoice?: ColumnChoiceId
  /**
   * Every network's accounts (TASK-023, TASK-049). A column of the first account names no account;
   * any other gets `account`.
   */
  accounts: KnownAccounts
}

/**
 * The add-column picker (TweetDeck "Add column"). A choice without a field is added at once; one
 * with a field (search, user, list, hashtag) asks for it first. Web pages are added in settings.json
 * only, as custom columns.
 */
export function AddColumnDialog({
  open,
  onOpenChange,
  onAdd,
  initialChoice,
  accounts,
}: AddColumnDialogProps) {
  // ─── State ───────────────────────────────────────────────────────────
  const [choice, setChoice] = useState<ColumnChoice | null>(null)
  // The account each network's new column shows, by name; null while the network has none.
  const [chosen, setChosen] = useState(() => firstChoices(accounts))
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ─── Callbacks ───────────────────────────────────────────────────────
  async function add(selected: ColumnChoice, text: string) {
    const account = chosen[selected.network]
    const built = buildColumn(selected.id, text, account)
    if (!built.ok) {
      setError(built.message)

      return
    }

    setSaving(true)
    setError(null)
    try {
      // A network's first account is the default, so its columns name no account.
      const withAccount = account !== null && account !== accounts[selected.network].first
      await onAdd(withAccount ? { ...built.column, account } : built.column)
      onOpenChange(false)
    } catch (reason) {
      setError(`The column could not be saved: ${String(reason)}`)
    } finally {
      setSaving(false)
    }
  }

  function pick(selected: ColumnChoice) {
    setError(null)
    if (selected.input === null) {
      void add(selected, '')
    } else {
      setChoice(selected)
      setValue('')
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (choice) {
      void add(choice, value)
    }
  }

  const field = choice?.input ? INPUTS[choice.input] : null

  // ─── Effects ─────────────────────────────────────────────────────────
  // Every opening starts fresh. The accounts are read as it opens, not followed while it is open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: accounts are read on opening only
  useEffect(() => {
    if (open) {
      setChoice(COLUMN_CHOICES.find((item) => item.id === initialChoice) ?? null)
      setChosen(firstChoices(accounts))
      setValue('')
      setError(null)
      setSaving(false)
    }
  }, [open, initialChoice])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="add-column-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add column</DialogTitle>
          <DialogDescription>Choose what the new column shows.</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 flex max-h-[min(60vh,32rem)] flex-col gap-3 overflow-y-auto px-1">
          {SECTIONS.map((section) => (
            <section
              key={section.network}
              data-testid="add-column-section"
              data-network={section.network}
              aria-label={section.title}
              className="flex flex-col gap-1.5"
            >
              <h3 className="text-xs font-medium text-muted-foreground">{section.title}</h3>
              {/* With more than one account on the network, its columns ask which one. */}
              {accountNames(accounts[section.network]).length > 1 && (
                <fieldset
                  data-testid="add-column-accounts"
                  data-network={section.network}
                  className="flex flex-wrap gap-1.5"
                >
                  <legend className="sr-only">{section.title} account</legend>
                  {accountNames(accounts[section.network]).map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={chosen[section.network] === name}
                      data-testid="add-column-account"
                      data-account={name}
                      onClick={() => setChosen((now) => ({ ...now, [section.network]: name }))}
                      className={cn(
                        'rounded-full border border-border px-3 py-1 text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                        chosen[section.network] === name && 'border-ring bg-accent',
                      )}
                    >
                      {accountLabel(section.network, name, accounts[section.network].labels)}
                    </button>
                  ))}
                </fieldset>
              )}
              <div className="grid grid-cols-3 gap-2">
                {COLUMN_CHOICES.filter(
                  (item) =>
                    item.network === section.network &&
                    (!NEEDS_ACCOUNT.has(item.id) || chosen[item.network] !== null),
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid="add-column-choice"
                    data-choice={item.id}
                    aria-pressed={choice?.id === item.id}
                    disabled={saving}
                    onClick={() => pick(item)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-md border border-border px-2 py-3 text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                      choice?.id === item.id && 'border-ring bg-accent',
                    )}
                  >
                    <ColumnIcon kind={item.id} className="size-5" />
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        {choice && field && (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <Label htmlFor="add-column-value">{field.label}</Label>
            <div className="flex gap-2">
              <Input
                id="add-column-value"
                data-testid="add-column-input"
                autoFocus
                value={value}
                placeholder={field.placeholder}
                aria-invalid={error !== null}
                onChange={(event) => {
                  setValue(event.target.value)
                  setError(null)
                }}
              />
              <Button
                type="submit"
                data-testid="add-column-submit"
                disabled={saving || !value.trim()}
              >
                Add
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p data-testid="add-column-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
