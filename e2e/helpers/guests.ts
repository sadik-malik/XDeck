import { browser } from '@wdio/globals'

// Helpers for the column-script specs (TASK-006). They read the guests of the page columns: the
// renderer gives each column's guest id, and the main process runs code in the guest's main world.

/** A page column's container id (col-N) and the guest webContents id of its <webview>. */
export type PageGuest = { id: string; guestId: number }

/** Every page column (not placeholders) and its guest, read in the renderer. */
export function listPageGuests(): Promise<PageGuest[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-column-kind="page"]')).map(
      (container) => ({
        id: container.dataset.column ?? '',
        guestId: (
          container.querySelector('webview') as unknown as { getWebContentsId(): number }
        ).getWebContentsId(),
      }),
    ),
  )
}

/** The guest of one column. Throws when the column is not a page column. */
export async function guestOf(id: string): Promise<number> {
  const guest = (await listPageGuests()).find((g) => g.id === id)
  if (!guest) {
    throw new Error(`no page guest for ${id}`)
  }
  return guest.guestId
}

/** Runs code in a guest's main world (the page's own JavaScript world), via its webContents. */
export async function guestEval<T>(guestId: number, script: string): Promise<T> {
  const value = await browser.electron.execute(
    async (electron, id: number, code: string) =>
      electron.webContents.fromId(id)?.executeJavaScript(code),
    guestId,
    script,
  )
  return value as T
}

/** The session partition a guest (webContents id) uses, among `candidates`, or 'other'. */
export function partitionOf(guestId: number, candidates: string[]): Promise<string> {
  return browser.electron.execute(
    (electron, id: number, names: string[]) => {
      const contents = electron.webContents.fromId(id)

      return (
        names.find((name) => electron.session.fromPartition(name) === contents?.session) ?? 'other'
      )
    },
    guestId,
    candidates,
  )
}

/** The guest of the first `<webview>` matching `selector` in the shell, once it is attached. */
export async function guestOfWebview(selector: string): Promise<number> {
  let guestId = 0
  await browser.waitUntil(
    async () => {
      guestId = await browser.execute((css: string) => {
        try {
          return (
            (
              document.querySelector(css) as unknown as { getWebContentsId?: () => number } | null
            )?.getWebContentsId?.() ?? 0
          )
        } catch {
          // Not attached yet.
          return 0
        }
      }, selector)

      return guestId > 0
    },
    { timeout: 20_000, interval: 250, timeoutMsg: `no attached <webview> at ${selector}` },
  )

  return guestId
}
