import appIcon from '../../../xdeck-icon.svg'
import { MAC_TRAFFIC_LIGHTS_WIDTH, TITLE_BAR_HEIGHT } from '../../shared/window'

const isMac = window.xdeck.platform === 'darwin'

/**
 * XDeck's title bar (TASK-024), in place of the system one: the app's icon and name, and the open
 * deck's name once there is more than one deck to tell apart. The whole bar drags the window and a
 * double click maximizes it. On Windows and Linux the window buttons are drawn over its right end
 * (the titlebar-area env() values leave room for them); on macOS the traffic lights sit at its left
 * end, so the icon is left out there.
 */
export function TitleBar({ deckName }: { deckName?: string }) {
  return (
    <header
      data-testid="title-bar"
      className="app-drag flex shrink-0 items-center gap-2 border-b border-app-border bg-app-bg text-sm text-app-text select-none"
      style={{
        height: TITLE_BAR_HEIGHT,
        paddingLeft: isMac ? MAC_TRAFFIC_LIGHTS_WIDTH : 10,
        paddingRight: isMac
          ? 14
          : 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 14px)',
      }}
    >
      {!isMac && (
        <img
          data-testid="title-bar-icon"
          src={appIcon}
          alt=""
          draggable={false}
          className="size-5 shrink-0 rounded-[5px]"
        />
      )}
      <span className="font-semibold text-foreground">XDeck</span>
      {deckName && (
        <>
          <span aria-hidden>·</span>
          <span data-testid="title-bar-deck" className="truncate">
            {deckName}
          </span>
        </>
      )}
    </header>
  )
}
