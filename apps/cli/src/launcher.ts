import { lstat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createLocalServer } from '@ioteams/server'
import { publishReservedConnection } from './client.js'
import { loadProduct, reserve } from './state.js'
type Options = Parameters<typeof createLocalServer>[0]
type OwnedOptions = { options: Options; dispose(): Promise<void> }
/** Trusted launcher composition. The API retains jobs/controllers; callers retain Store/index/workspace lifetimes. */
export async function startCliServer(home: string, input: Options | (() => Promise<OwnedOptions>)) {
  await loadProduct(home)
  const release = await reserve(`${home}/.ioteams-product-owner.lock`)
  let disconnect: (() => Promise<void>) | undefined, removeHandoff: (() => Promise<void>) | undefined
  let server: ReturnType<typeof createLocalServer> | undefined, owned: OwnedOptions | undefined
  try {
    owned = typeof input === 'function' ? await input() : { options: input, async dispose() {} }
    server = createLocalServer(owned.options)
    const origin = await server.listen()
    disconnect = await publishReservedConnection(home, origin, server.bootstrapSecret)
    removeHandoff = await publishBrowserHandoff(home, origin, server.browserBootstrapSecret)
    let shutdown: Promise<void> | undefined
    return { origin, close(): Promise<void> {
      return shutdown ??= (async () => { await server!.close(); await owned!.dispose(); await removeHandoff!(); await disconnect!(); await release() })()
    } }
  } catch (error) { await server?.close(); await owned?.dispose(); await removeHandoff?.(); await disconnect?.(); await release(); throw error }
}

/** Private capability handoff: the operator copies it into the same-origin panel by explicit interaction. */
async function publishBrowserHandoff(home: string, origin: string, secret: string): Promise<() => Promise<void>> {
  const file = join(home, 'browser-access.html')
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acesso privado · ioteams</title><style>body{font:18px system-ui;max-width:40rem;margin:3rem auto;padding:1rem}input{width:100%;font:16px monospace}button,a{margin:1rem 0;display:inline-block}</style><h1>Acesso privado ao painel</h1><p>Abra o painel local e cole o código no campo de acesso. Uso único; expira em até dois minutos após iniciar o servidor. Este arquivo é privado: não o compartilhe.</p><p><a href="${origin}" target="_blank" rel="noreferrer">Abrir painel local</a></p><label for="code">Código de acesso</label><input id="code" type="password" readonly autocomplete="off" value="${secret}"><button type="button" aria-controls="code" aria-pressed="false" onclick="const input=document.getElementById('code');const show=input.type==='password';input.type=show?'text':'password';this.textContent=show?'Ocultar código':'Mostrar código';this.setAttribute('aria-pressed',String(show))">Mostrar código</button><p>Copie o código com o teclado. A conexão da CLI permanece independente.</p></html>`
  await writeFile(file, html, { flag: 'wx', mode: 0o600 })
  const identity = await lstat(file)
  return async () => {
    const current = await lstat(file)
    if (current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error('BROWSER_HANDOFF_CHANGED')
    await unlink(file)
  }
}
