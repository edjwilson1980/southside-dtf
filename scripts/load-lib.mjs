import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Import a library module the way the app does.
 *
 * The verification scripts used to re-implement the cut geometry by hand and
 * check the copy. The copy drifted from the real code more than once, which
 * meant the checks passed while the shipped output was something else. This
 * bundles the actual module so the checks run against what really ships.
 */
export async function loadLib(entry) {
  const out = join(mkdtempSync(join(tmpdir(), 'verify-')), 'bundle.mjs')
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    alias: { '@': root },
    logLevel: 'error',
  })
  return import(pathToFileURL(out).href)
}
