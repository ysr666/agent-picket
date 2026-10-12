/** Development-only atomic artifact publisher for DSH's independent HMR poll. */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const CLIENT = join('adapters', 'dsh', 'client.js')

async function fileList(dir) {
  const files = []
  async function visit(folder) {
    for (const row of await readdir(folder, { withFileTypes: true })) {
      const current = join(folder, row.name)
      if (row.isDirectory()) await visit(current)
      else if (row.isFile()) files.push(relative(dir, current))
      else throw new Error('Unexpected build artifact type')
    }
  }
  await visit(dir)
  return files.sort()
}

async function atomicCopy(source, destination) {
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.hmr-${process.pid}-${randomUUID()}`
  try { await copyFile(source, temporary); await rename(temporary, destination) }
  finally { await rm(temporary, { force: true }) }
}

export async function publishVerifiedBuild(stage, destination, { afterFile } = {}) {
  const all = await fileList(stage)
  if (!all.includes(CLIENT) || !all.includes(join('adapters', 'dsh', 'plugin.js'))) {
    throw new Error('Incomplete staged Agent Picket artifact tree')
  }
  const client = await readFile(join(stage, CLIENT), 'utf8')
  if (!client.includes('window.__ModuleLoader__.load(') || !client.includes('id: "agent-picket"')) {
    throw new Error('Staged DSH Client factory is invalid')
  }
  // No content is published while TypeScript or factory assembly can fail.
  // All siblings must be on disk before HMR sees its entry revision change.
  for (const name of all.filter(file => file !== CLIENT)) {
    await atomicCopy(join(stage, name), join(destination, name))
    await afterFile?.(name)
  }
  const current = await fileList(destination).catch(err => {
    if (err.code === 'ENOENT') return []
    throw err
  })
  const keep = new Set(all)
  for (const name of current) if (!keep.has(name)) await rm(join(destination, name), { force: true })
  await atomicCopy(join(stage, CLIENT), join(destination, CLIENT))
  await afterFile?.(CLIENT)
}

function runNode(script, args, cwd = ROOT) {
  return new Promise((done, fail) => {
    const p = spawn(process.execPath, [script, ...args], { cwd, stdio: 'inherit' })
    p.once('error', fail)
    p.once('close', (code, signal) => code === 0 ? done() : fail(new Error(`${script} failed (${signal ?? code})`)))
  })
}

export async function stagedBuild(root = ROOT, build = runNode) {
  const stage = await mkdtemp(join(root, '.picket-hmr-stage-'))
  try {
    await build(require.resolve('typescript/bin/tsc'), ['-p', 'tsconfig.build.json', '--outDir', stage], root)
    await build('scripts/build-dsh-client.mjs', ['--out-dir', stage], root)
    await publishVerifiedBuild(stage, join(root, 'dist'))
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await stagedBuild()
}
