import { Button } from '@/components/ui/button'
import { NETWORK_INFO, NETWORKS } from '../../../shared/networks'
import { NETWORK_ICONS } from '../network-icons'
import { addAccount } from '../state/data'

/** The welcome screen's choices: one login window per network (TASK-043). */
const CHOICES = NETWORKS.map((network) => ({
  id: `welcome-add-${network}`,
  icon: NETWORK_ICONS[network],
  label: `Add ${NETWORK_INFO[network].name} account`,
  onClick: () => void addAccount(network),
}))

/**
 * Shown in place of the columns while XDeck has no account at all (TASK-043): there is no login
 * screen, so this is where the first account comes in. The rail stays usable beside it.
 */
export function Welcome() {
  return (
    <div
      data-testid="welcome"
      className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-6 text-center"
    >
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="text-xl font-bold text-foreground">Welcome to XDeck</h1>
        <p className="text-sm text-app-text">
          Add an account to fill your columns. You can add more accounts at any time from the
          accounts menu (…) in the left bar.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {CHOICES.map(({ id, icon: Icon, label, onClick }) => (
          <Button key={id} data-testid={id} size="lg" onClick={onClick}>
            <Icon /> {label}
          </Button>
        ))}
      </div>
    </div>
  )
}
