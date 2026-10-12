// Runs WebdriverIO with a hard overall limit, and sweeps every process the run started.
//
// The run's processes are wdio's launcher, its workers, chromedriver and Electron. Any of them can
// outlive its parent (a failed session leaves the app running), so the sweep cannot rely on the
// parent tree alone. While the run goes, the descendants are polled and remembered by PID and start
// time. When the run ends, for any reason (pass, fail, timeout or Ctrl+C), every remembered process
// that is still alive is killed as a tree, and the sweep is checked again before the script exits.
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// A full real-X run takes 8 to 12 minutes (15 sessions); the limit leaves room for a slow X.
const limitMs = Number(process.env.E2E_TIMEOUT_MS ?? 20 * 60_000)
const POLL_MS = 2_000
// @wdio/cli does not export its package.json, so the bin is addressed by path (pnpm links it here).
const wdioBin = fileURLToPath(new URL('../node_modules/@wdio/cli/bin/wdio.js', import.meta.url))
const configPath = fileURLToPath(new URL('./wdio.conf.ts', import.meta.url))
const isWindows = process.platform === 'win32'

/** Every live process: Map<pid, { ppid, start }>. `start` identifies a PID across reuse. Null on error. */
function snapshot() {
  if (isWindows) {
    const script =
      'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.ToUniversalTime().Ticks)" }'
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
        timeout: 30_000,
        windowsHide: true,
      },
    )
    if (result.status !== 0) {
      return null
    }
    const procs = new Map()
    for (const line of result.stdout.split(/\r?\n/)) {
      const [pid, ppid, start] = line.trim().split(' ')
      if (pid && ppid && start) {
        procs.set(Number(pid), { ppid: Number(ppid), start })
      }
    }
    return procs
  }
  const result = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,lstart='], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.status !== 0) {
    return null
  }
  const procs = new Map()
  for (const line of result.stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line)
    if (match) {
      procs.set(Number(match[1]), { ppid: Number(match[2]), start: match[3] })
    }
  }
  return procs
}

// Remembered processes, keyed by `${pid}:${start}`. Kept after they die, so an orphan can still be
// identified by its own key.
const known = new Map()

// Every process that existed before the run. Windows reuses PIDs, so an older process can have a
// parent PID that now belongs to one of the run's processes. Those are never adopted or killed.
const preexisting = new Set()
{
  const before = snapshot()
  if (!before) {
    console.error('E2E: could not list processes before the run')
    process.exit(1)
  }
  for (const [pid, info] of before) {
    preexisting.add(`${pid}:${info.start}`)
  }
}

function isAlive(procs, entry) {
  const now = procs.get(entry.pid)
  return now !== undefined && now.start === entry.start
}

/** Adds every process under the run to `known`. Children of a live known process are adopted. */
function recordDescendants(procs) {
  const rootInfo = procs.get(rootPid)
  if (rootInfo && !known.has(`${rootPid}:${rootInfo.start}`)) {
    known.set(`${rootPid}:${rootInfo.start}`, { pid: rootPid, start: rootInfo.start })
  }
  let added = true
  while (added) {
    added = false
    const aliveKnownPids = new Set()
    for (const entry of known.values()) {
      if (isAlive(procs, entry)) {
        aliveKnownPids.add(entry.pid)
      }
    }
    for (const [pid, info] of procs) {
      const key = `${pid}:${info.start}`
      if (!known.has(key) && !preexisting.has(key) && aliveKnownPids.has(info.ppid)) {
        known.set(key, { pid, start: info.start })
        added = true
      }
    }
  }
}

/** The remembered processes that are still alive, as they are now. */
function aliveKnown(procs) {
  return [...known.values()].filter((entry) => isAlive(procs, entry))
}

let pollTimer
let polling = true
function poll() {
  if (!polling) {
    return
  }
  const procs = snapshot()
  if (procs) {
    recordDescendants(procs)
  }
  pollTimer = setTimeout(poll, POLL_MS)
}

// Extra arguments go to wdio, so one spec can run alone: node e2e/run.mjs --spec ./specs/smoke.e2e.ts
const child = spawn(process.execPath, [wdioBin, 'run', configPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: true,
  // A process group on POSIX, so the whole tree can be signalled at once.
  detached: !isWindows,
})

const rootPid = child.pid

function killPid(pid) {
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
  } else {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
}

/**
 * Kills every remembered process still alive, then checks again. Returns the survivors (empty when
 * the sweep is clean). Newly spawned processes are caught by the next round's recording.
 */
function sweep() {
  for (let round = 0; round < 5; round += 1) {
    const procs = snapshot()
    if (!procs) {
      return [{ pid: -1, start: 'snapshot failed' }]
    }
    recordDescendants(procs)
    const alive = aliveKnown(procs)
    if (alive.length === 0) {
      return []
    }
    for (const entry of alive) {
      killPid(entry.pid)
    }
  }
  const procs = snapshot()
  if (!procs) {
    return [{ pid: -1, start: 'snapshot failed' }]
  }
  return aliveKnown(procs)
}

let finished = false
function finish(code, reason) {
  if (finished) {
    return
  }
  finished = true
  polling = false
  clearTimeout(pollTimer)
  if (child.exitCode === null && child.signalCode === null) {
    killPid(child.pid)
  }
  const survivors = sweep()
  console.error(
    `E2E: ${reason}; processes swept: ${known.size}; still alive after the sweep: ${survivors.length}`,
  )
  if (survivors.length > 0) {
    console.error(`E2E: survivors ${JSON.stringify(survivors)}`)
  }
  process.exitCode = survivors.length > 0 ? 1 : code
}

const timer = setTimeout(() => {
  finish(1, `exceeded ${limitMs} ms`)
}, limitMs)

// Forward Ctrl+C to the tree too, since the detached child is not in the terminal's group.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    finish(130, `received ${signal}`)
    process.exit(process.exitCode)
  })
}

poll()

child.on('exit', (code) => {
  clearTimeout(timer)
  finish(code ?? 1, `wdio exited with ${code ?? 'a signal'}`)
})
