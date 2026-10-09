/**
 * Private local Node-backed storage for explicitly authorized fictional rights
 * preferences and union negotiations. There is no network, Host RPC or transcript
 * reader here. Host selects an existing trusted state root (e.g. DSH_HOME).
 */
import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import type { RightsConsentStore, RightsConsentV1 } from '../../product/rights-consent.ts'
import type { LaborStateV1, LaborStore } from '../../product/union-desk.ts'

const MAX_FILE_BYTES = 32 * 1024
const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700

function ensurePrivateDirectory(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: DIRECTORY_MODE })
  const stat = lstatSync(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe rights storage directory')
  // Never silently chmod a directory shared with other Host features.
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    throw new Error('Rights storage directory is not private')
  }
}

function readObject(path: string): unknown {
  if (!existsSync(path)) return undefined
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) {
    throw new Error('Invalid rights storage file')
  }
  const contents = readFileSync(path, 'utf8')
  return JSON.parse(contents) as unknown
}

function atomicJson(dir: string, name: string, value: unknown, verify?: (current: unknown) => void): void {
  ensurePrivateDirectory(dir)
  const finalPath = join(dir, name)
  // Reject symbolic links and unrecognized destinations; never follow them.
  const token = randomBytes(12).toString('hex')
  const mutex = join(dir, name + '.lock')
  const temp = join(dir, name + '.' + token + '.tmp')
  let lockFd: number | undefined
  let fd: number | undefined
  try {
    lockFd = openSync(mutex, 'wx', FILE_MODE)
    verify?.(readObject(finalPath))
    const serialized = JSON.stringify(value)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_FILE_BYTES) {
      throw new Error('Rights storage record exceeds limit')
    }
    fd = openSync(temp, 'wx', FILE_MODE)
    writeFileSync(fd, serialized + '\n', 'utf8')
    fsyncSync(fd)
    closeSync(fd); fd = undefined
    renameSync(temp, finalPath)
    // Best effort: directory fsync behavior is platform/filesystem specific.
    try {
      const dirFd = openSync(dir, 'r')
      try { fsyncSync(dirFd) } finally { closeSync(dirFd) }
    } catch { /* no claim of universal power-loss guarantee */ }
  } finally {
    if (fd !== undefined) closeSync(fd)
    rmSync(temp, { force: true })
    if (lockFd !== undefined) {
      closeSync(lockFd)
      rmSync(mutex, { force: true })
    }
  }
}

export function createNodeRightsStores(trustedHostHome: string): {
  readonly rights: RightsConsentStore
  readonly laborFor: (agentId: string, sessionId: string) => LaborStore
} {
  if (typeof trustedHostHome !== 'string' || !trustedHostHome.trim()) {
    throw new Error('Trusted Host home required')
  }
  const root = join(resolve(trustedHostHome), 'agent-picket', 'rights-v1')
  const rights: RightsConsentStore = {
    load: () => readObject(join(root, 'consent.json')),
    save: (record: RightsConsentV1) => {
      // Consent validation and opt-in are owned by the caller's controller.
      atomicJson(root, 'consent.json', record)
    },
  }
  const laborFor = (agentId: string, sessionId: string): LaborStore => {
    if (!agentId || !sessionId) throw new Error('Agent and Session must be known')
    // Hide literal identifiers from filenames; do not use user-supplied paths.
    const digest = createHash('sha256')
      .update(JSON.stringify([agentId, sessionId]), 'utf8').digest('hex')
    const directory = join(root, 'sessions')
    const path = join(directory, digest + '.json')
    return {
      load: () => readObject(path),
      save: (next: LaborStateV1) => {
        atomicJson(directory, digest + '.json', next, existing => {
          if (existing === undefined) {
            if (next.revision !== 1) throw new Error('Invalid initial union revision')
          } else {
            if (typeof existing !== 'object' || existing === null
              || (existing as { revision?: unknown }).revision !== next.revision - 1) {
              throw new Error('Stale or invalid union revision')
            }
          }
        })
      },
    }
  }
  return { rights, laborFor }
}
