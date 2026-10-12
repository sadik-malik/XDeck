// How the logged-in user shows on x.com (TASK-007, TASK-029), in one place for the column preload
// and the Add X Account dialog: X's page changes, and both must follow it together.

/** The profile link in X's side navigation. X leaves it out narrower than about 700 px. */
export const PROFILE_LINK = "a[aria-label='Profile'], a[data-testid='AppTabBar_Profile_Link']"

/** The avatar in X's account button, at the foot of its side navigation, at every width. */
export const ACCOUNT_AVATAR =
  '[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="UserAvatar-Container-"]'

/** The account avatar's test id is this prefix followed by the user name. */
export const AVATAR_PREFIX = 'UserAvatar-Container-'

/**
 * Pages X shows a logged-out session (TASK-043): its landing page, the login and sign-up flows, and
 * the log-out page. A column that lands on one offers to log in instead of showing X's form.
 */
const LOGGED_OUT_PATHS = [
  '/login',
  '/logout',
  '/i/flow/login',
  '/i/flow/signup',
  '/i/jf/onboarding',
]

export function isXLoggedOutPath(pathname: string): boolean {
  return pathname === '/' || LOGGED_OUT_PATHS.some((path) => pathname.startsWith(path))
}
