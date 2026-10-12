import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Serialize rebuilds: a change during an active build gets exactly one later
 * build, rather than letting clean-build remove another build's output.
 * This queue is independent of fs.watch so it can be regression-tested.
 */
export function createRebuildScheduler({ run, onError = console.error, debounceMs = 180 }) {
  if (typeof run !== 'function' || !Number.isFinite(debounceMs) || debounceMs < 0) {
    throw new TypeError('run and a nonnegative debounceMs are required')
  }
  let timer
  let active = false
  let dirty = false
  let closed = false

  const drain = async () => {
    if (closed || active || !dirty) return
    dirty = false
    active = true
    try {
      await run()
    } catch (error) {
      try { onError(error) } catch { /* diagnostic callback cannot break the watcher */ }
    } finally {
      active = false
      if (!closed && dirty && timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined
          void drain()
        }, 0)
      }
    }
  }

  return {
    request() {
      if (closed) return
      dirty = true
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void drain()
      }, debounceMs)
    },
    close() {
      closed = true
      dirty = false
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    },
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function buildOnce(getChild) {
  return new Promise((resolveBuild, rejectBuild) => {
    const isWindows = process.platform === 'win32'
    const command = isWindows ? 'cmd.exe' : 'npm'
    const args = isWindows ? ['/d', '/s', '/c', 'npm', 'run', 'build'] : ['run', 'build']
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
    getChild(child)
    child.once('error', rejectBuild)
    child.once('close', (code, signal) => {
      getChild(undefined)
      if (code === 0) resolveBuild()
      else rejectBuild(new Error(`Build exited ${signal ?? code}`))
    })
  })
}

function main() {
  const watches = []
  let child
  let exiting = false
  let sequence = 0
  const scheduler = createRebuildScheduler({
    async run() {
      const n = ++sequence
      const begin = performance.now()
      console.log(`[dev:watch] build #${n} started`)
      await buildOnce(value => { child = value })
      console.log(`[dev:watch] build #${n} ready in ${Math.round(performance.now() - begin)}ms`)
      console.log('[dev:watch] Browser reload is NOT automatic; DSH client HMR is not enabled.')
    },
    onError(error) {
      console.error('[dev:watch] build failed (watching for next change):', error)
    },
  })

  const observe = (dir, recursive, relevant) => {
    watches.push(watch(join(root, dir), { recursive }, (_event, filename) => {
      if (!filename || relevant(String(filename))) scheduler.request()
    }))
  }
  // Only source, builder and compiler config; never watch dist (our own output).
  try {
    observe('src', true, () => true)
    observe('scripts', false, filename => /^(?:build-dsh-client|clean-build)\.mjs$/.test(filename))
    observe('.', false, filename => /^(?:package\.json|tsconfig(?:\.build)?\.json)$/.test(filename))
  } catch (error) {
    for (const watcher of watches) watcher.close()
    throw error
  }
  const stop = () => {
    if (exiting) return
    exiting = true
    scheduler.close()
    for (const watcher of watches) watcher.close()
    child?.kill('SIGTERM')
    process.exitCode = 0
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  scheduler.request() // Initial build, including the browser factory contract check.
  console.log('[dev:watch] Watching src/, build scripts and compiler config. Ctrl+C to stop.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
