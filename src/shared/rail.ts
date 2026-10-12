/** App-menu items the rail's settings menu can run (menu:run). Ids from src/main/menu.ts. */
export const RAIL_MENU_ITEMS = [
  'dark-mode',
  'notifications',
  'zoom-in',
  'zoom-out',
  'reset-zoom',
  'reset-layout',
  // Everything else the hidden menu bar had (TASK-024).
  'reload-columns',
  'fit-window',
  'keyboard-shortcuts',
  'check-updates',
  'github',
] as const

export type RailMenuItem = (typeof RAIL_MENU_ITEMS)[number]
