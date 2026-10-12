import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { defaultTheme, LIGHT_BG, normalizeThemeColor, themeFor } from '../../../shared/theme'

/** Swift findThemeColor waited for the colour to stop changing before reporting it. */
const SETTLE_MS = 500

/**
 * The app chrome's theme (TASK-008, Swift ContentView). It follows the theme colour X reports for
 * its pages, and shows the default colour for the dark-mode setting until X has reported one.
 * Returns the callback the login page and the leftmost X column report X's theme colour to.
 */
export function useAppTheme(
  darkMode: boolean | undefined,
  darkBg: string | undefined,
): (color: unknown) => void {
  // ─── State ───────────────────────────────────────────────────────────
  const [reported, setReported] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ─── Compute ─────────────────────────────────────────────────────────
  const theme = reported ? themeFor(reported) : defaultTheme(darkMode ?? false, darkBg)

  // ─── Callbacks ───────────────────────────────────────────────────────
  const reportColor = useCallback((raw: unknown) => {
    const color = normalizeThemeColor(raw)
    if (!color) {
      return
    }

    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setReported(color)
      // The main process updates the dark-mode setting from it and re-enables View → Dark Mode.
      window.xdeck.reportThemeColor(color).catch(() => undefined)
    }, SETTLE_MS)
  }, [])

  // ─── Effects ─────────────────────────────────────────────────────────
  // View → Dark Mode switched modes: show the new mode's default until the reloaded X pages report
  // their colour (Swift set backgroundColor = defaultBackgroundColor(isDarkMode) on toggle). When
  // the change came from X's own report, the reported colour already matches and is kept.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a change of darkMode resets it.
  useEffect(() => {
    if (darkMode !== undefined && reported !== null && (reported !== LIGHT_BG) !== darkMode) {
      setReported(null)
    }
  }, [darkMode])

  useLayoutEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--app-bg', theme.bg)
    root.style.setProperty('--app-border', theme.border)
    root.style.setProperty('--app-text', theme.text)
    root.dataset.theme = theme.dark ? 'dark' : 'light'
    // Native parts (the strip's scrollbar) follow too.
    root.style.colorScheme = theme.dark ? 'dark' : 'light'
    // And the window buttons over the title bar, on Windows and Linux (TASK-024).
    window.xdeck.setTitleBarColors(theme.bg, theme.text).catch(() => undefined)
  }, [theme.bg, theme.border, theme.text, theme.dark])

  useEffect(() => () => clearTimeout(timer.current), [])

  return reportColor
}
