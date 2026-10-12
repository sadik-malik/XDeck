import { type IpcMainInvokeEvent, ipcMain } from 'electron'
import { isShellMainFrame } from './config-ipc'
import { flushXCookies } from './webview'

function requireShellMainFrame(event: IpcMainInvokeEvent): void {
  if (!isShellMainFrame(event)) {
    throw new Error('session IPC is only available to the XDeck shell window')
  }
}

/**
 * Registers the session channel. The login screen calls it once a user name is accepted, so the
 * login cookie reaches disk before the app can be killed (TASK-007 persistence).
 */
export function registerSessionIpc(): void {
  ipcMain.handle('session:flush-x-cookies', async (event): Promise<void> => {
    requireShellMainFrame(event)
    await flushXCookies()
  })
}
