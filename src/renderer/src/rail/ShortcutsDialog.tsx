import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SHORTCUT_HELP } from '../../../shared/shortcuts'

const X_KEYS: { keys: string; action: string }[] = [
  { keys: 'j / k', action: 'Next / previous post' },
  { keys: 'l', action: 'Like' },
  { keys: 'r', action: 'Reply' },
  { keys: 't', action: 'Repost' },
  { keys: 'Enter', action: 'Open the post' },
]

function KeyList({ items }: { items: { keys: string; action: string }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map((item) => (
        <div key={item.keys} className="contents">
          <dt>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
              {item.keys}
            </kbd>
          </dt>
          <dd className="text-foreground">{item.action}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The keyboard shortcuts (?, or Help → Keyboard Shortcuts). TASK-020. */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="shortcuts-dialog" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>They work anywhere in XDeck, except while you type.</DialogDescription>
        </DialogHeader>
        <KeyList items={SHORTCUT_HELP} />
        <p className="text-sm font-medium text-foreground">In a column (X's own keys)</p>
        <KeyList items={X_KEYS} />
      </DialogContent>
    </Dialog>
  )
}
