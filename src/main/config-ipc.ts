import { type IpcMainInvokeEvent, ipcMain, shell } from 'electron'
import type { AppConfig } from '../shared/app-config'
import { customColumnOrigins } from '../shared/columns'
import type { ConfigResult } from '../shared/config-result'
import { allColumns, configDecks, deckKeys } from '../shared/decks'
import { saveDecks } from './config'
import { isAllowedAppUrl } from './security'
import { pruneDeckLayouts } from './settings'
import { setCustomGuestOrigins } from './webview'

/**
 * True only for the shell window's main frame, loaded from the app itself. Column guests are
 * webview contents (getType() 'webview'), and subframes are not the main frame, so both are refused.
 */
export function isShellMainFrame(event: IpcMainInvokeEvent): boolean {
  const contents = event.sender
  const frame = event.senderFrame

  return (
    contents.getType() === 'window' &&
    frame !== null &&
    frame === contents.mainFrame &&
    isAllowedAppUrl(frame.url)
  )
}

function requireShellMainFrame(event: IpcMainInvokeEvent): void {
  if (!isShellMainFrame(event)) {
    throw new Error('config IPC is only available to the XDeck shell window')
  }
}

/**
 * Registers the config channels. `startup` is the startup load; config:get returns the latest
 * config, which config:set-decks replaces. Every call from a sender other than the shell main
 * frame rejects (roadmap §2 "security baseline").
 */
export function registerConfigIpc(startup: ConfigResult<AppConfig>, configDir: string): void {
  let result = startup
  ipcMain.handle('config:get', (event) => {
    requireShellMainFrame(event)

    return result
  })
  // Columns and decks changed in the app. Only a config that loaded can be changed this way. The
  // custom-column allow-list follows the saved columns before the renderer shows them, and saved
  // layouts of decks that are gone are dropped.
  ipcMain.handle('config:set-decks', async (event, decks: unknown) => {
    requireShellMainFrame(event)
    if (!result.ok) {
      throw new Error('settings.json did not load')
    }

    const config = await saveDecks(configDir, decks)
    setCustomGuestOrigins(customColumnOrigins(allColumns(config)))
    pruneDeckLayouts(deckKeys(configDecks(config)))
    result = { ok: true, config }

    return config
  })

  ipcMain.handle('config:open-folder', async (event) => {
    requireShellMainFrame(event)
    const error = await shell.openPath(configDir)
    if (error) {
      throw new Error(error)
    }
  })
}
