import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Only clean this package's generated directory, never a Host/worktree folder.
rmSync(fileURLToPath(new URL('../dist/', import.meta.url)), {
  force: true, recursive: true,
})
