/**
 * An X user name: 1 to 15 letters, digits or underscores. The login screen reports one (TASK-007),
 * and the renderer uses it to build the profile URL, so anything else must never get that far.
 */
const USER_NAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/

export function isValidUsername(value: string): boolean {
  return USER_NAME_PATTERN.test(value)
}
