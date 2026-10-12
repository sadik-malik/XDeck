import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import type { AppConfig } from '../shared/app-config'
import { MAX_MUTED_WORD_LENGTH, MAX_MUTED_WORDS } from '../shared/column-filters'
import type { ConfigFailure, ConfigIssue, ConfigResult } from '../shared/config-result'
import {
  DEFAULT_DECK_NAME,
  type DeckConfig,
  MAX_DECK_NAME_LENGTH,
  MAX_DECKS,
} from '../shared/decks'

/**
 * Mirrors resources/config/schema.json exactly. The E2E parity test (e2e/specs/config.e2e.ts)
 * checks every fixture in e2e/configs/ against Ajv on that file, so the two cannot drift silently.
 */
const filtersSchema = z.strictObject({
  hideReposts: z.boolean().optional(),
  mediaOnly: z.boolean().optional(),
  hideReels: z.boolean().optional(),
  mutedWords: z.array(z.string().max(MAX_MUTED_WORD_LENGTH)).max(MAX_MUTED_WORDS).optional(),
})

/** An X or Instagram user name (TASK-023, TASK-049): the account a column shows. */
const accountSchema = z.string().regex(/^[A-Za-z0-9._]{1,30}$/)

const plainColumn = (type: 'forYou' | 'following' | 'notifications' | 'profile') =>
  z.strictObject({
    type: z.literal(type),
    filters: filtersSchema.optional(),
    account: accountSchema.optional(),
  })

const columnSchema = z.discriminatedUnion('type', [
  plainColumn('forYou'),
  plainColumn('following'),
  plainColumn('notifications'),
  plainColumn('profile'),
  z.strictObject({
    type: z.literal('custom'),
    url: z.string(),
    filters: filtersSchema.optional(),
    account: accountSchema.optional(),
  }),
])

const deckSchema = z.strictObject({
  name: z.string().min(1).max(MAX_DECK_NAME_LENGTH),
  columns: z.array(columnSchema),
})

/** Most columns per deck the app can save. A hand-written settings.json has no limit. */
const MAX_SAVED_COLUMNS = 50

/** Decks sent by the renderer to be saved (config:set-decks). */
export const savedDecksSchema = z
  .array(
    z.strictObject({
      name: z.string().trim().min(1).max(MAX_DECK_NAME_LENGTH),
      columns: z.array(columnSchema).max(MAX_SAVED_COLUMNS),
    }),
  )
  .min(1)
  .max(MAX_DECKS)

/** `columns` (one deck) or `decks` (TASK-022): exactly one of them. */
export const appConfigSchema = z
  .strictObject({
    $schema: z.string().optional(),
    columnWidth: z.int().optional(),
    columns: z.array(columnSchema).optional(),
    decks: z.array(deckSchema).min(1).max(MAX_DECKS).optional(),
  })
  .superRefine((config, context) => {
    if (config.columns === undefined && config.decks === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['columns'],
        message: 'add "columns" or "decks"',
      })
    } else if (config.columns !== undefined && config.decks !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['decks'],
        message: 'use "columns" or "decks", not both',
      })
    }
  })

/**
 * `~/.config/XDeck` on every OS (roadmap §2). The XDECK_CONFIG_DIR test hook (roadmap §5.1) only
 * applies to unpackaged builds, so a release build always reads the real location.
 */
export function configDirectory(): string {
  const override = app.isPackaged ? undefined : process.env.XDECK_CONFIG_DIR

  return override || join(homedir(), '.config', 'XDeck')
}

/** The defaults shipped with the app: resources/config in dev and out/, the packaged resources dir otherwise. */
export function bundledConfigDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'config')
    : join(__dirname, '../../resources/config')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readFailure(path: string, error: unknown): ConfigFailure {
  return {
    ok: false,
    path,
    kind: 'read',
    issues: [{ path: '(file)', message: errorMessage(error) }],
  }
}

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.length > 0 ? path.map(String).join('.') : '(root)'
}

/** Zod reports unknown keys on their parent. Each one is listed at its own path instead. */
function toIssues(issue: z.core.$ZodIssue): ConfigIssue[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({
      path: formatPath([...issue.path, key]),
      message: issue.message,
    }))
  }

  return [{ path: formatPath(issue.path), message: issue.message }]
}

/**
 * Parses and validates settings.json text. A leading UTF-8 BOM (Notepad writes one) is ignored.
 */
export function parseConfig(path: string, text: string): ConfigResult<AppConfig> {
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch (error) {
    return {
      ok: false,
      path,
      kind: 'json',
      issues: [{ path: '(file)', message: errorMessage(error) }],
    }
  }

  const parsed = appConfigSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, path, kind: 'schema', issues: parsed.error.issues.flatMap(toIssues) }
  }

  return { ok: true, config: parsed.data }
}

/**
 * Same steps as the Swift createConfigFileIfNotExist + loadConfig: create the directory, create
 * settings.json from the bundled default only when it is missing, always overwrite schema.json,
 * then read and validate settings.json. Never resolves to a thrown error.
 */
export async function loadConfig(
  configDir: string,
  bundledDir: string,
): Promise<ConfigResult<AppConfig>> {
  const settingsPath = join(configDir, 'settings.json')
  const schemaPath = join(configDir, 'schema.json')
  try {
    await mkdir(configDir, { recursive: true })
  } catch (error) {
    return readFailure(configDir, error)
  }

  try {
    // COPYFILE_EXCL: an existing settings.json is never overwritten.
    await copyFile(join(bundledDir, 'settings.json'), settingsPath, constants.COPYFILE_EXCL)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      return readFailure(settingsPath, error)
    }
  }

  try {
    await copyFile(join(bundledDir, 'schema.json'), schemaPath)
  } catch (error) {
    return readFailure(schemaPath, error)
  }

  let text: string
  try {
    text = await readFile(settingsPath, 'utf8')
  } catch (error) {
    return readFailure(settingsPath, error)
  }

  return parseConfig(settingsPath, text)
}

/**
 * Saves the decks to settings.json (adding, removing or filtering columns, and the deck changes).
 * The file is read again first, so `$schema`, columnWidth and anything else in it are kept as they
 * are on disk. A file that has `columns` keeps that form while it is one deck still called Main;
 * otherwise `decks` is written. Rejects when the decks are not valid, or when settings.json itself
 * no longer is. Written to a temporary file and renamed over the old one, so a failed write never
 * leaves half a file.
 */
export async function saveDecks(configDir: string, value: unknown): Promise<AppConfig> {
  const decks: DeckConfig[] = savedDecksSchema.parse(value)
  const settingsPath = join(configDir, 'settings.json')
  const current = parseConfig(settingsPath, await readFile(settingsPath, 'utf8'))
  if (!current.ok) {
    throw new Error('settings.json is not valid any more; fix it and restart XDeck')
  }

  const { columns: _columns, decks: _decks, ...rest } = current.config
  const keepColumnsForm =
    current.config.columns !== undefined &&
    decks.length === 1 &&
    decks[0].name === DEFAULT_DECK_NAME
  const next: AppConfig = keepColumnsForm
    ? { ...rest, columns: decks[0].columns }
    : { ...rest, decks }
  const temporary = `${settingsPath}.tmp`
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  await rename(temporary, settingsPath)

  return next
}
