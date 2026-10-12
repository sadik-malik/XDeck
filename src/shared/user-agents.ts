// The user agent the columns send (TASK-039): a preset from a list of popular browsers, or the
// user's own string. Shared by the main process, which applies it to every column session, and the
// settings dialog, which shows each choice's exact string.

/** The presets, in the order the dialog lists them. `chrome` (this computer's Chrome) is the default. */
export const USER_AGENT_PRESETS = [
  { id: 'chrome', label: 'Chrome on this computer', chromium: true },
  { id: 'chrome-windows', label: 'Chrome on Windows', chromium: true },
  { id: 'chrome-macos', label: 'Chrome on macOS', chromium: true },
  { id: 'chrome-linux', label: 'Chrome on Linux', chromium: true },
  { id: 'edge-windows', label: 'Edge on Windows', chromium: true },
  { id: 'firefox-windows', label: 'Firefox on Windows', chromium: false },
  { id: 'firefox-macos', label: 'Firefox on macOS', chromium: false },
  { id: 'safari-macos', label: 'Safari on macOS', chromium: false },
] as const

export type UserAgentPresetId = (typeof USER_AGENT_PRESETS)[number]['id']

/** A preset by id, or the user's own string. */
export type UserAgentChoice =
  | { kind: 'preset'; id: UserAgentPresetId }
  | { kind: 'custom'; value: string }

export const DEFAULT_USER_AGENT: UserAgentChoice = { kind: 'preset', id: 'chrome' }

/** The longest custom user agent accepted. Real ones are under 300 characters. */
export const MAX_USER_AGENT_LENGTH = 512

/**
 * Firefox and Safari can't be derived from the bundled Chromium, so their versions are fixed here
 * and refreshed with XDeck releases. Chrome and Edge follow the bundled Chromium.
 */
const FIREFOX_VERSION = '150.0'
const SAFARI_VERSION = '26.0'

const PLATFORM_TOKENS = {
  windows: 'Windows NT 10.0; Win64; x64',
  macos: 'Macintosh; Intel Mac OS X 10_15_7',
  linux: 'X11; Linux x86_64',
} as const

function platformOf(nodePlatform: string): keyof typeof PLATFORM_TOKENS {
  if (nodePlatform === 'win32') {
    return 'windows'
  }

  return nodePlatform === 'darwin' ? 'macos' : 'linux'
}

/** Chrome's user agent, reduced as Chrome sends it: the major version followed by .0.0.0. */
function chrome(platform: keyof typeof PLATFORM_TOKENS, major: string): string {
  return `Mozilla/5.0 (${PLATFORM_TOKENS[platform]}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

/**
 * The string a choice sends. `chromeVersion` is the bundled Chromium (process.versions.chrome) and
 * `nodePlatform` this computer's process.platform.
 */
export function userAgentFor(
  choice: UserAgentChoice,
  chromeVersion: string,
  nodePlatform: string,
): string {
  if (choice.kind === 'custom') {
    return choice.value
  }

  const major = chromeVersion.split('.')[0]
  switch (choice.id) {
    case 'chrome':
      return chrome(platformOf(nodePlatform), major)
    case 'chrome-windows':
      return chrome('windows', major)
    case 'chrome-macos':
      return chrome('macos', major)
    case 'chrome-linux':
      return chrome('linux', major)
    case 'edge-windows':
      return `${chrome('windows', major)} Edg/${major}.0.0.0`
    case 'firefox-windows':
      return `Mozilla/5.0 (${PLATFORM_TOKENS.windows}; rv:${FIREFOX_VERSION}) Gecko/20100101 Firefox/${FIREFOX_VERSION}`
    case 'firefox-macos':
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${FIREFOX_VERSION}) Gecko/20100101 Firefox/${FIREFOX_VERSION}`
    case 'safari-macos':
      return `Mozilla/5.0 (${PLATFORM_TOKENS.macos}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${SAFARI_VERSION} Safari/605.1.15`
  }
}

/**
 * Why a custom user agent can't be used, or null. Only printable ASCII: the string goes into every
 * request's User-Agent header, so a line break or control character must never reach it.
 */
export function customUserAgentProblem(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return 'Enter a user agent.'
  }

  if (trimmed.length > MAX_USER_AGENT_LENGTH) {
    return `A user agent can be at most ${MAX_USER_AGENT_LENGTH} characters.`
  }

  if (!/^[\x20-\x7E]+$/.test(trimmed)) {
    return 'A user agent can only use plain printable characters (no line breaks or symbols outside ASCII).'
  }

  return null
}

/** A choice that arrived over IPC or from store.json, checked. Anything malformed is null. */
export function parseUserAgentChoice(value: unknown): UserAgentChoice | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const { kind, id, value: custom } = value as Record<string, unknown>
  if (kind === 'preset') {
    const preset = USER_AGENT_PRESETS.find((candidate) => candidate.id === id)

    return preset ? { kind: 'preset', id: preset.id } : null
  }

  if (kind === 'custom' && typeof custom === 'string' && customUserAgentProblem(custom) === null) {
    return { kind: 'custom', value: custom.trim() }
  }

  return null
}

/** Whether a choice claims a browser that isn't Chromium (X may then serve different code). */
export function claimsOtherEngine(choice: UserAgentChoice): boolean {
  if (choice.kind === 'custom') {
    return !/Chrome\/\d/.test(choice.value)
  }

  return !USER_AGENT_PRESETS.find((preset) => preset.id === choice.id)?.chromium
}
