import { readFile, writeFile, unlink, lstat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createLocalServer, createDomainServices } from '@ioteams/server'
import { PlanningService } from '@ioteams/runtime'
import { planningFixture } from '../integration/runtime/planning.fixture.js'
const fixture = await planningFixture()
const policies = join(fixture.base, 'panel-policies'); await mkdir(policies, { mode: 0o700 })
const services = createDomainServices({ ...fixture.options, planning: new PlanningService(fixture.options), planningPolicy: async () => fixture.policy,
  planningBindings: () => [{ demandId: fixture.demand.id, repositoryPath: fixture.policy.snapshot.repository.root, plan: fixture.policy.snapshot.plan }], policyDirectory: policies })
const server = createLocalServer({ store: fixture.store, services, port: 4173, pollMs: 25,
  panelHtml: await readFile(new URL('../../painel/dist/index.html', import.meta.url), 'utf8') })
const origin = await server.listen()
await fetch(origin + '/api/v1/session/bootstrap', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: server.bootstrapSecret }) })
const file = new URL(`../../painel/dist/e2e-access-${process.env.IOTEAMS_E2E_NONCE}.json`, import.meta.url)
await writeFile(file, JSON.stringify({ secret: server.browserBootstrapSecret }), { mode: 0o600, flag: 'wx' })
const identity = await lstat(file)
let shutdown: Promise<void> | undefined
function close() { return shutdown ??= (async () => { await server.close(); await fixture.cleanup(); const current = await lstat(file); if (current.ino === identity.ino && current.dev === identity.dev && !current.isSymbolicLink()) await unlink(file) })() }
process.once('SIGINT', () => { void close().catch(() => { process.exitCode = 1 }) })
process.once('SIGTERM', () => { void close().catch(() => { process.exitCode = 1 }) })
console.log('T16 simulated panel ready on loopback')
