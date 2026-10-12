import type { HTMLAttributes } from 'react'

/** Electron's <webview> tag, as far as the renderer uses it (roadmap §2). */
type WebviewAttributes = HTMLAttributes<HTMLElement> & {
  src?: string
  partition?: string
  allowpopups?: boolean
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: WebviewAttributes
    }
  }
}
