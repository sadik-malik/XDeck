import { browser, expect } from '@wdio/globals'
import { guestOfColumn, guestViewport, readColumnBoxes, waitForLoggedInColumns } from '../helpers/x'

// TASK-005 without columnWidth: the strip right of the navigation rail is split evenly, base =
// strip / n (TASK-018; the Swift app gave the leftmost X column the rail's 68 px instead). Widths are
// rounded down to the device-pixel grid (widthGridStep), so the expected values use the same rule. Config: e2e/configs/real/fill.json (forYou, following, notifications).

function gridStep(ratio: number): number {
  for (let step = 1; step <= 8; step += 1) {
    if (Number.isInteger(Number((step * ratio).toFixed(6)))) {
      return step
    }
  }
  return 1
}

describe('column layout without columnWidth', () => {
  before(async () => {
    await waitForLoggedInColumns()
  })

  it('(a) the three columns split the strip evenly, on the device-pixel grid', async () => {
    const { strip, ratio } = await browser.execute(() => ({
      strip:
        document.querySelector('[data-testid="column-strip"]')?.getBoundingClientRect().width ?? 0,
      ratio: window.devicePixelRatio,
    }))
    const step = gridStep(ratio)
    const floor = (value: number) => Math.floor(value / step + 1e-9) * step
    const base = strip / 3
    const widths = (await readColumnBoxes()).map((box) => box.width)
    expect(widths).toEqual([floor(base), floor(base), floor(base)])
    const total = widths.reduce((sum, width) => sum + width, 0)
    expect(total).toBeLessThanOrEqual(strip)
    expect(strip - total).toBeLessThan(3 * step + 1)
  })

  it('(b) every page fits its column', async () => {
    for (const box of await readColumnBoxes()) {
      const viewport = await guestViewport(await guestOfColumn(box.id))
      expect(viewport.width).toBe(box.width)
      expect(viewport.height).toBeLessThanOrEqual(Math.floor(box.webviewHeight))
    }
  })
})
