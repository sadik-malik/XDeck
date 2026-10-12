import { Camera, type LucideIcon, ThumbsUp, UserPlus } from 'lucide-react'
import type { Network } from '../../shared/networks'

/**
 * Each network's generic icon, for login buttons, the login window and account badges. No network's
 * logo: XDeck is not affiliated with any of them (roadmap §9 branding).
 */
export const NETWORK_ICONS: Record<Network, LucideIcon> = {
  x: UserPlus,
  instagram: Camera,
  facebook: ThumbsUp,
}
