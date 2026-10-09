#!/usr/bin/env node
import { createHookOutput, type HookHost } from './evaluate.ts'

/**
 * Claude Code/Codex manual-install command hook.
 * stdin is ephemeral, never logged; stdout is either valid safe JSON or empty.
 * Malformed input and local failures are allowed through with exit code zero.
 */
const host: HookHost | undefined = process.argv[2] === '--claude-code'
  ? 'claude-code' : process.argv[2] === '--codex' ? 'codex' : undefined

async function main(): Promise<void> {
  if (!host) return
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 128_000) return
    chunks.push(bytes)
  }
  try {
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const result = createHookOutput(host, input)
    if (result) process.stdout.write(JSON.stringify(result) + '\n')
  } catch {
    // Fail open. No secrets or user prompt bytes in stderr or stdout.
  }
}

await main().catch(() => {})
