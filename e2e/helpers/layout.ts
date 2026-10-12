import { $, browser } from '@wdio/globals'
import { guestEval } from './guests'

// Helpers for the column layout specs (TASK-013/014): real pointer drags, read-back of what is on
// screen, and a page-load fingerprint to prove a drag did not reload any column.

/** Drags from the centre of `selector` by (dx, 0), in small steps like a real mouse. */
export async function dragBy(selector: string, dx: number, steps = 12): Promise<void> {
  const element = await $(selector)
  let action = browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ origin: element, x: 0, y: 0 })
    .down({ button: 0 })
    .pause(80)
  for (let step = 0; step < steps; step += 1) {
    action = action.move({ origin: 'pointer', x: Math.round(dx / steps), y: 0, duration: 25 })
  }
  await action.pause(80).up({ button: 0 }).perform()
  await browser.pause(400)
}

export type ShownColumn = { id: string; title: string; left: number; width: number }

/** Columns as they appear on screen, left to right. */
export function shownColumns(): Promise<ShownColumn[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-column]'))
      .map((container) => {
        const rect = container.getBoundingClientRect()
        return {
          id: container.dataset.column ?? '',
          title: container.querySelector('[data-testid="column-header"]')?.textContent ?? '',
          left: rect.left,
          width: rect.width,
        }
      })
      .sort((a, b) => a.left - b.left),
  )
}

/** Each column's page-load time origin: it changes when a column's page reloads. */
export async function pageLoads(guestIds: Record<string, number>): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  for (const [id, guestId] of Object.entries(guestIds)) {
    result[id] = await guestEval<number>(guestId, 'performance.timeOrigin')
  }
  return result
}
