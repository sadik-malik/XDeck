// Renders xdeck-icon.svg to build/icon.png (1024 px), the window icon resources/icon.png (256 px)
// and the landing page's public/assets/icon.png (256 px). electron-builder makes the .icns, .ico and
// Linux sizes from build/icon.png. Run with `pnpm icon` after changing the SVG; the PNGs are committed.
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const svg = readFileSync(new URL('../xdeck-icon.svg', import.meta.url))
for (const [path, size] of [
  ['../build/icon.png', 1024],
  ['../resources/icon.png', 256],
  ['../public/assets/icon.png', 256],
]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(new URL(path, import.meta.url), png)
  console.log(`${path.slice(3)}: ${size} px, ${png.length} bytes`)
}
