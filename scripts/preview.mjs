import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const file = new URL('../painel/dist/index.html', import.meta.url)
const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT inválida')
const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  if (path !== '/' && path !== '/index.html') { res.writeHead(404); res.end('Página não encontrada.'); return }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return }
  try {
    const html = await readFile(file)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length, 'Cache-Control': 'no-store' })
    res.end(req.method === 'HEAD' ? undefined : html)
  } catch { res.writeHead(503); res.end('Prévia indisponível. Execute npm run build na raiz.') }
})
server.on('error', error => { console.error(error.message); process.exitCode = 1 })
server.listen(port, '127.0.0.1', () => { console.log(`IOTEAMS_PREVIEW_URL=http://127.0.0.1:${server.address().port}`) })
