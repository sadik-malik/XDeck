import type { ConfigFailure } from '../../../shared/config-result'

type ConfigErrorProps = {
  failure: ConfigFailure
}

/** Full-window screen shown instead of the column strip when the settings file cannot be used. */
export function ConfigError({ failure }: ConfigErrorProps) {
  const openFolder = () => {
    void window.xdeck.openConfigFolder().catch(() => {
      // The folder could not be opened (shell.openPath reported an error). The page stays readable.
    })
  }

  return (
    <main
      data-testid="config-error"
      data-kind={failure.kind}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto bg-app-bg p-8 text-app-text"
    >
      {/* No file name or path on screen (TASK-032): the folder button leads to the file. */}
      <h1
        data-testid="config-error-path"
        data-file={failure.path}
        className="text-xl font-semibold"
      >
        XDeck couldn&apos;t load your settings
      </h1>
      <ul data-testid="config-error-issues" className="list-disc space-y-1 pl-5 text-sm">
        {failure.issues.map((issue, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: issues are a static list for one render
          <li key={index} data-testid="config-error-issue" data-path={issue.path}>
            <span className="font-mono">{issue.path}</span>: {issue.message}
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-start gap-3">
        <button
          type="button"
          data-testid="config-open-folder"
          onClick={openFolder}
          className="rounded-md border border-app-border px-3 py-1.5 text-sm hover:bg-black/5"
        >
          Open settings folder
        </button>
        <p className="text-sm text-app-text">
          Fix the settings file in that folder and restart XDeck.
        </p>
      </div>
    </main>
  )
}
