import { type FormEvent, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type ColumnFilters, compactFilters, parseMutedWords } from '../../../shared/column-filters'
import type { Network } from '../../../shared/networks'

/** The on/off filters. */
type Switches = Pick<ColumnFilters, 'hideReposts' | 'mediaOnly' | 'hideReels'>

/** Each network's switches (TASK-046): X has reposts and media-only; on Instagram everything is media. */
const SWITCHES: Record<Network, { key: keyof Switches; id: string; label: string }[]> = {
  x: [
    { key: 'hideReposts', id: 'filter-reposts', label: 'Hide reposts' },
    { key: 'mediaOnly', id: 'filter-media', label: 'Only posts with photos or videos' },
  ],
  instagram: [{ key: 'hideReels', id: 'filter-reels', label: 'Hide Reels' }],
  facebook: [{ key: 'hideReels', id: 'filter-reels', label: 'Hide Reels' }],
}

type FiltersDialogProps = {
  /** The column being filtered: its network, title, and filters now. Null when closed. */
  column: {
    key: string
    network: Network
    title: string
    filters: ColumnFilters | undefined
  } | null
  onClose: () => void
  /** Saves the filters (undefined: none). Rejects when they could not be saved. */
  onSave: (filters: ColumnFilters | undefined) => Promise<void>
}

/** A column's filters (TASK-021), like TweetDeck's column filter panel. */
export function FiltersDialog({ column, onClose, onSave }: FiltersDialogProps) {
  // ─── State ───────────────────────────────────────────────────────────
  const [switches, setSwitches] = useState<Switches>({})
  const [words, setWords] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ─── Compute ─────────────────────────────────────────────────────────
  // The open column, by key: the column object is new on every render of the app.
  const openKey = column?.key ?? null

  // ─── Callbacks ───────────────────────────────────────────────────────
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Only the column's own network's switches are kept.
      const own = Object.fromEntries(
        SWITCHES[column?.network ?? 'x'].map(({ key }) => [key, switches[key] === true]),
      )
      await onSave(compactFilters({ ...own, mutedWords: parseMutedWords(words) }))
      onClose()
    } catch (reason) {
      setError(`The filters could not be saved: ${String(reason)}`)
    } finally {
      setSaving(false)
    }
  }

  // ─── Effects ─────────────────────────────────────────────────────────
  // Every opening starts from the column's saved filters.
  // biome-ignore lint/correctness/useExhaustiveDependencies: openKey stands for the column.
  useEffect(() => {
    if (column) {
      setSwitches({
        hideReposts: column.filters?.hideReposts === true,
        mediaOnly: column.filters?.mediaOnly === true,
        hideReels: column.filters?.hideReels === true,
      })
      setWords((column.filters?.mutedWords ?? []).join(', '))
      setError(null)
      setSaving(false)
    }
  }, [openKey])

  return (
    <Dialog open={column !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="filters-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Filter {column?.title}</DialogTitle>
          <DialogDescription>
            {column?.network !== 'x'
              ? 'Only this column is filtered.'
              : 'Only this column is filtered. A post you open in it shows its whole conversation.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {SWITCHES[column?.network ?? 'x'].map(({ key, id, label }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <Label htmlFor={id}>{label}</Label>
              <Switch
                id={id}
                data-testid={id}
                checked={switches[key] === true}
                onCheckedChange={(checked) => setSwitches((now) => ({ ...now, [key]: checked }))}
              />
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-words">Mute words</Label>
            <Input
              id="filter-words"
              data-testid="filter-words"
              value={words}
              placeholder="spoiler, giveaway"
              onChange={(event) => setWords(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Separate words with commas. Posts containing any of them are hidden.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="filters-save" disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
