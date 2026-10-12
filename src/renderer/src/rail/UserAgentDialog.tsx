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
import { cn } from '@/lib/utils'
import {
  claimsOtherEngine,
  customUserAgentProblem,
  USER_AGENT_PRESETS,
  type UserAgentChoice,
  type UserAgentPresetId,
  userAgentFor,
} from '../../../shared/user-agents'

type UserAgentDialogProps = {
  open: boolean
  /** The user agent the columns send now. */
  current: UserAgentChoice
  onClose: () => void
}

/** A preset's id, or the custom string's row. */
type Selection = UserAgentPresetId | 'custom'

const { chromeVersion, platform } = window.xdeck

/**
 * Settings → User Agent (TASK-039): which browser the columns say they are, from a list of popular
 * ones or the user's own string. Saving reloads every column with it.
 */
export function UserAgentDialog({ open, current, onClose }: UserAgentDialogProps) {
  // ─── State ───────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Selection>('chrome')
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ─── Compute ─────────────────────────────────────────────────────────
  const choice: UserAgentChoice =
    selected === 'custom'
      ? { kind: 'custom', value: custom.trim() }
      : { kind: 'preset', id: selected }
  const customProblem = selected === 'custom' ? customUserAgentProblem(custom) : null
  const otherEngine = customProblem === null && claimsOtherEngine(choice)
  const rows: { id: Selection; label: string; value: string | null }[] = [
    ...USER_AGENT_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      value: userAgentFor({ kind: 'preset', id: preset.id }, chromeVersion, platform),
    })),
    { id: 'custom', label: 'Custom', value: null },
  ]

  // ─── Callbacks ───────────────────────────────────────────────────────
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (customProblem) {
      setError(customProblem)

      return
    }

    setSaving(true)
    setError(null)
    try {
      await window.xdeck.setUserAgent(choice)
      onClose()
    } catch (reason) {
      setError(`The user agent could not be saved: ${String(reason)}`)
    } finally {
      setSaving(false)
    }
  }

  // ─── Effects ─────────────────────────────────────────────────────────
  // Every opening starts from the user agent in use.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new opening resets the form.
  useEffect(() => {
    if (open) {
      setSelected(current.kind === 'custom' ? 'custom' : current.id)
      setCustom(current.kind === 'custom' ? current.value : '')
      setError(null)
      setSaving(false)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="user-agent-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>User agent</DialogTitle>
          <DialogDescription>
            The browser the columns tell X they are. Saving reloads every column.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
          <fieldset className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            <legend className="sr-only">User agent</legend>
            {rows.map(({ id, label, value }) => (
              <label
                key={id}
                data-testid="user-agent-option"
                data-option={id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-md px-3 py-2 hover:bg-accent',
                  selected === id && 'bg-accent',
                )}
              >
                <input
                  type="radio"
                  name="user-agent"
                  value={id}
                  checked={selected === id}
                  onChange={() => setSelected(id)}
                  className="mt-1 accent-[rgb(29_155_240)]"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm">{label}</span>
                  {value && (
                    <span className="font-mono text-[11px] break-all text-muted-foreground">
                      {value}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          {selected === 'custom' && (
            <Input
              data-testid="user-agent-custom"
              aria-label="Custom user agent"
              value={custom}
              placeholder="Mozilla/5.0 (…)"
              onChange={(event) => setCustom(event.target.value)}
              className="font-mono text-xs"
            />
          )}
          {otherEngine && (
            <p data-testid="user-agent-warning" className="text-xs text-muted-foreground">
              XDeck runs on Chromium. Claiming another browser can make X show a different layout,
              ask you to log in again, or turn features off.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="user-agent-save" disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
