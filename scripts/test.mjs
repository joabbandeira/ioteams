import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const requested = process.argv.slice(2)
if (requested.length > 1 || (requested[0] && !['unit', 'integration'].includes(requested[0]))) {
  console.error('Uso: npm test ou npm run test:unit/test:integration')
  process.exit(2)
}
async function hasTests(directory) {
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && await hasTests(`${directory}/${entry.name}`)) return true
      if (entry.isFile() && /\.test\.ts$/.test(entry.name)) return true
    }
    return false
  } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
const directories = []
for (const subset of requested.length ? requested : ['unit', 'integration']) {
  if (await hasTests(`${root}/tests/${subset}`)) directories.push(`tests/${subset}`)
  else console.error(`${subset}: indisponível (nenhum teste implementado).`)
}
if (!directories.length) process.exit(2)
const vitest = fileURLToPath(import.meta.resolve('vitest/vitest.mjs'))
const child = spawn(process.execPath, [vitest, 'run', ...directories], { cwd: root, stdio: 'inherit' })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
