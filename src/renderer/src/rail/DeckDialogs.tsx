import { type FormEvent, useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { deckNameProblem } from '../../../shared/decks'

export type DeckDialogState = { kind: 'new' } | { kind: 'rename' } | { kind: 'delete' } | null

type DeckDialogsProps = {
  state: DeckDialogState
  /** The open deck's name. */
  deckName: string
  /** The other decks' names (a renamed deck may keep its own name). */
  otherNames: string[]
  /** Every deck's name (a new deck must not repeat any). */
  allNames: string[]
  onClose: () => void
  onCreate: (name: string) => Promise<void>
  onRename: (name: string) => Promise<void>
  onDelete: () => Promise<void>
}

/** New Deck, Rename Deck and Delete Deck (TASK-022). */
export function DeckDialogs({
  state,
  deckName,
  otherNames,
  allNames,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: DeckDialogsProps) {
  // ─── State ───────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ─── Compute ─────────────────────────────────────────────────────────
  const naming = state?.kind === 'new' || state?.kind === 'rename'

  // ─── Callbacks ───────────────────────────────────────────────────────
  async function run(action: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await action()
      onClose()
    } catch (reason) {
      setError(`The deck could not be saved: ${String(reason)}`)
    } finally {
      setSaving(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const problem = deckNameProblem(name, state?.kind === 'rename' ? otherNames : allNames)
    if (problem) {
      setError(problem)

      return
    }

    const trimmed = name.trim()
    void run(() => (state?.kind === 'rename' ? onRename(trimmed) : onCreate(trimmed)))
  }

  // ─── Effects ─────────────────────────────────────────────────────────
  // Every opening starts fresh: empty for a new deck, the current name for a rename.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new opening resets the field.
  useEffect(() => {
    setName(state?.kind === 'rename' ? deckName : '')
    setError(null)
    setSaving(false)
  }, [state?.kind])

  return (
    <>
      <Dialog open={naming} onOpenChange={(open) => !open && onClose()}>
        <DialogContent data-testid="deck-name-dialog" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{state?.kind === 'rename' ? 'Rename deck' : 'New deck'}</DialogTitle>
            <DialogDescription>
              {state?.kind === 'rename'
                ? 'The deck keeps its columns and layout.'
                : 'A deck is a set of columns. Only the open deck is loaded.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Label htmlFor="deck-name">Name</Label>
            <Input
              id="deck-name"
              data-testid="deck-name-input"
              autoFocus
              value={name}
              placeholder="News"
              aria-invalid={error !== null}
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
            />
            {error && (
              <p data-testid="deck-name-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" data-testid="deck-name-save" disabled={saving}>
                {state?.kind === 'rename' ? 'Rename' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={state?.kind === 'delete'} onOpenChange={(open) => !open && onClose()}>
        <AlertDialogContent data-testid="deck-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the {deckName} deck?</AlertDialogTitle>
            <AlertDialogDescription>
              Its columns are removed with it. Your X account is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="deck-delete-confirm"
              disabled={saving}
              onClick={(event) => {
                // Stays open until the deck is deleted, so a failure can be shown.
                event.preventDefault()
                void run(onDelete)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
