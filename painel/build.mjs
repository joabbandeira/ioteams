import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const dist = new URL('./dist/', import.meta.url)
const output = new URL('../docs/index.html', import.meta.url)

await mkdir(dist, { recursive: true })
await mkdir(new URL('.', output), { recursive: true })
execFileSync(process.execPath, [
  'node_modules/@tailwindcss/cli/dist/index.mjs',
  '-i', 'src/styles.css', '-o', 'dist/style.css', '--minify',
], { cwd: root, stdio: 'inherit' })

const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/app.tsx'],
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'inline',
})
const css = await readFile(new URL('style.css', dist), 'utf8')
const js = result.outputFiles[0].text.replaceAll('</script', '<\\/script')
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="Protótipo interativo do time LISA: pessoas, Scrum e entrega. Todos os dados são fictícios."><title>LISA · Pessoas, cadência e entrega</title><style>${css}</style></head><body><div id="root"></div><noscript>Ative JavaScript para explorar este protótipo interativo.</noscript><script>${js}</script></body></html>`

await writeFile(output, html)
console.log(`HTML pronto: docs/index.html (${Buffer.byteLength(html)} bytes).`)
