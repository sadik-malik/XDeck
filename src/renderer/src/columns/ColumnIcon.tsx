import {
  AtSign,
  Bell,
  Bookmark,
  CalendarDays,
  Camera,
  CircleUserRound,
  Clapperboard,
  Compass,
  Globe,
  Hash,
  Heart,
  House,
  List,
  type LucideIcon,
  Mail,
  Newspaper,
  Search,
  Send,
  Sparkles,
  Store,
  Telescope,
  ThumbsUp,
  Tv,
  User,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react'
import type { ColumnChoiceId, ColumnKind } from '../../../shared/column-kinds'

const ICONS: Record<ColumnKind | ColumnChoiceId, LucideIcon> = {
  forYou: Sparkles,
  following: Users,
  notifications: Bell,
  profile: User,
  home: House,
  search: Search,
  list: List,
  user: UserRound,
  bookmarks: Bookmark,
  messages: Mail,
  explore: Compass,
  mentions: AtSign,
  community: UsersRound,
  xPage: Hash,
  // Instagram (roadmap §9): generic symbols, never Instagram's logo.
  igFeed: Camera,
  igReels: Clapperboard,
  igExplore: Telescope,
  igNotifications: Heart,
  igMessages: Send,
  igUser: CircleUserRound,
  igTag: Hash,
  igProfile: User,
  igSaved: Bookmark,
  igPage: Camera,
  // Facebook (roadmap §11): generic symbols, never Facebook's logo.
  fbFeed: Newspaper,
  fbNotifications: Bell,
  fbVideo: Tv,
  fbReels: Clapperboard,
  fbGroups: UsersRound,
  fbGroup: UsersRound,
  fbPage: CircleUserRound,
  fbMarketplace: Store,
  fbEvents: CalendarDays,
  fbSaved: Bookmark,
  fbSearch: Search,
  fbTag: Hash,
  fbOther: ThumbsUp,
  fbProfile: User,
  web: Globe,
}

/** The icon of a column kind or of an add-column choice (TweetDeck showed one in every header). */
export function ColumnIcon({
  kind,
  className,
}: {
  kind: ColumnKind | ColumnChoiceId
  className?: string
}) {
  const Icon = ICONS[kind]

  return <Icon className={className} aria-hidden />
}
