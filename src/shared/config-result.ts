/** One problem found in settings.json. `path` is dotted (e.g. `columns.0.type`), or `(root)`/`(file)`. */
export type ConfigIssue = {
  path: string
  message: string
}

/**
 * Why settings.json could not be used. `read`: a file could not be read or written. `json`: the
 * file is not valid JSON. `schema`: the JSON does not match schema.json.
 */
export type ConfigFailureKind = 'read' | 'json' | 'schema'

export type ConfigSuccess<T> = { ok: true; config: T }

export type ConfigFailure = {
  ok: false
  /** The file the problem is in, absolute. */
  path: string
  kind: ConfigFailureKind
  issues: ConfigIssue[]
}

/** The outcome of loading settings.json at startup. Only plain data, so it crosses IPC as is. */
export type ConfigResult<T = unknown> = ConfigSuccess<T> | ConfigFailure
