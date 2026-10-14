import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))
const dist = new URL('./dist/', import.meta.url)
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--demo')) throw new Error('Uso: node build.mjs [--demo]')
const demo = args.includes('--demo')
const title = demo ? 'LISA · Demonstração fictícia' : 'ioteams · Painel local'
const description = demo ? 'Demonstração fictícia do time LISA: pessoas, cadência e entrega.' : 'ioteams: pessoas, conhecimento, planejamento e entrega local.'
const output = new URL(demo ? '../docs/index.html' : './dist/index.html', import.meta.url)
const require = createRequire(import.meta.url)
const tailwind = join(dirname(require.resolve('@tailwindcss/cli/package.json')), 'dist/index.mjs')

await mkdir(dist, { recursive: true })
await mkdir(new URL('.', output), { recursive: true })
execFileSync(process.execPath, [
  tailwind,
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
  define: { 'process.env.NODE_ENV': '"production"', __IOTEAMS_DEMO__: String(args.includes('--demo')) },
  legalComments: 'inline',
})
const css = await readFile(new URL('style.css', dist), 'utf8')
const js = result.outputFiles[0].text.replaceAll('</script', '<\\/script')
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="${description}"><title>${title}</title><style>${css}</style></head><body><div id="root"></div><noscript>Ative JavaScript para explorar este protótipo interativo.</noscript><script>${js}</script></body></html>`

await writeFile(output, html)
console.log(`HTML pronto: ${relative(root, fileURLToPath(output))} (${Buffer.byteLength(html)} bytes).`)
