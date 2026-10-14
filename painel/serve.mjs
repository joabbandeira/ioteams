import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const file = new URL('../docs/index.html', import.meta.url)
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT deve ser um número inteiro entre 0 e 65535.')
  process.exit(1)
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  if (pathname !== '/' && pathname !== '/index.html') {
    res.writeHead(404)
    res.end('Página não encontrada.')
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end('Método não permitido.')
    return
  }
  try {
    const html = await readFile(file)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.length,
      'Cache-Control': 'no-store',
    })
    res.end(req.method === 'HEAD' ? undefined : html)
  } catch {
    res.writeHead(500)
    res.end('Não foi possível abrir docs/index.html. Execute npm run build em painel/.')
  }
})

server.on('error', error => {
  console.error(`Não foi possível iniciar o painel: ${error.message}`)
  process.exit(1)
})
server.listen(port, host, () => {
  console.log(`LISA_PREVIEW_URL=http://${host}:${server.address().port}`)
})
