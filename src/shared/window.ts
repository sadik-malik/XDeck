/**
 * Height of XDeck's own title bar, CSS px (TASK-024). The system title bar is hidden; on Windows and
 * Linux the window buttons are drawn over the right end of this bar, in the app's colours.
 */
export const TITLE_BAR_HEIGHT = 32
/**
 * The height of the window buttons Windows and Linux draw over the title bar: 1 px short of it, so
 * the bar's bottom border runs under them too.
 */
export const TITLE_BAR_OVERLAY_HEIGHT = TITLE_BAR_HEIGHT - 1

/** Room for the macOS traffic lights at the left end of the title bar. */
export const MAC_TRAFFIC_LIGHTS_WIDTH = 76
