// Theme rules ported from Swift ContentView (TASK-008). The app's chrome (column headers, login
// padding, error screen) follows the theme colour X reports for its own pages.

/** X's light background. Any other theme colour counts as dark (Swift: `color != Color.white`). */
export const LIGHT_BG = '#ffffff'
/** Swift defaultBackgroundColor(isDarkMode: true), shown until X reports its colour. */
export const DARK_DEFAULT_BG = '#17202a'

export type AppTheme = { bg: string; border: string; text: string; dark: boolean }

/** Swift borderColor(for:) and textColor(for:): light values on white, dark values otherwise. */
export function themeFor(bg: string): AppTheme {
  const dark = bg !== LIGHT_BG

  return dark
    ? { bg, border: '#38444d', text: '#8b98a5', dark }
    : { bg, border: '#eff3f4', text: '#536471', dark }
}

/** X's Lights out background; its other dark theme is Dim. */
export const LIGHTS_OUT_BG = '#000000'

/**
 * The theme shown for a dark-mode setting before X reports a colour. Dark uses the dark colour X
 * showed last (Dim or Lights out), so a switch to dark paints the colour X is about to show.
 */
export function defaultTheme(darkMode: boolean, darkBg: string = DARK_DEFAULT_BG): AppTheme {
  return themeFor(darkMode ? darkBg : LIGHT_BG)
}

/**
 * X's night_mode cookie for a theme (TASK-028): 0 light, 1 Dim, 2 Lights out. Asking for the dark
 * theme X showed last keeps X from switching from Dim to Lights out after the reload.
 */
export function nightModeCookie(darkMode: boolean, darkBg: string): '0' | '1' | '2' {
  if (!darkMode) {
    return '0'
  }

  return darkBg === LIGHTS_OUT_BG ? '2' : '1'
}

/** A stored dark background, or the default: only a dark #rrggbb colour is kept. */
export function parseDarkBg(value: unknown): string {
  const color = normalizeThemeColor(value)

  return color && color !== LIGHT_BG ? color : DARK_DEFAULT_BG
}

/**
 * A theme colour from a page (X's `<meta name="theme-color">`) as #rrggbb, lower case. Anything
 * else is null: the value comes from a web page, so only plain hex colours are accepted.
 */
export function normalizeThemeColor(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }

  const value = raw.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value)
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  }

  return /^#[0-9a-f]{6}$/.test(value) ? value : null
}
