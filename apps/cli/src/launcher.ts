import { createLocalServer } from '@ioteams/server'
import { publishReservedConnection } from './client.js'
import { loadProduct, reserve } from './state.js'
type Options = Parameters<typeof createLocalServer>[0]
type OwnedOptions = { options: Options; dispose(): Promise<void> }
/** Trusted launcher composition. The API retains jobs/controllers; callers retain Store/index/workspace lifetimes. */
export async function startCliServer(home: string, input: Options | (() => Promise<OwnedOptions>)) {
  await loadProduct(home)
  const release = await reserve(`${home}/.ioteams-product-owner.lock`)
  let server: ReturnType<typeof createLocalServer> | undefined, owned: OwnedOptions | undefined
  try {
    owned = typeof input === 'function' ? await input() : { options: input, async dispose() {} }
    server = createLocalServer(owned.options)
    const origin = await server.listen()
    const disconnect = await publishReservedConnection(home, origin, server.bootstrapSecret)
    let shutdown: Promise<void> | undefined
    return { origin, close(): Promise<void> {
      return shutdown ??= (async () => { await server!.close(); await owned!.dispose(); await disconnect(); await release() })()
    } }
  } catch (error) { await server?.close(); await owned?.dispose(); await release(); throw error }
}
