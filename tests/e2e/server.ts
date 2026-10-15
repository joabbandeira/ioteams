import { readFile, writeFile, unlink, lstat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createLocalServer, createDomainServices } from '@ioteams/server'
import { PlanningService, ExecutionService, preparePolicy, approvePolicy, loadPolicy, createWorkspace, type ExecutionHostRequest, type CheckSandbox } from '@ioteams/runtime'
import { FakeHostAdapter } from '@ioteams/codex'
import type { HostAdapter, HostEvent } from '@ioteams/core'
import { fixtureExecFile } from '../fixtures/runtime/repository.js'
import { sha256 } from '../../packages/runtime/src/policy.js'
import { planningFixture } from '../integration/runtime/planning.fixture.js'
const fixture = await planningFixture()
const policies = join(fixture.base, 'panel-policies'); await mkdir(policies, { mode: 0o700 })
const { version: _version, ...envelope } = fixture.policy.snapshot
const snapshot = await preparePolicy({ ...envelope, plan: { ...envelope.plan, tasks: envelope.plan.tasks.map(task => ({ ...task, checks: [{ executable: 'node', args: ['src/e2e-check.mjs'], timeoutMs: 1000 }] })) } })
const initialPolicy = await approvePolicy(snapshot, snapshot.plan.policyHash, fixture.state)
let hostNumber = 0, implementations = 0
const createHost = async (request: ExecutionHostRequest) => {
  const number = ++hostNumber, threadId = `e2e-thread-${number}`, turnId = `e2e-turn-${number}`
  let fake: FakeHostAdapter
  const host: HostAdapter = {
    async *start(input, signal) {
      let text: string
      const events: HostEvent[] = [{ type: 'thread.started', threadId }, { type: 'turn.started', threadId, turnId }]
      if (request.phase === 'implement') {
        implementations++
        await fixture.lifetime.run(async () => {
          await writeFile(join(request.policy.snapshot.workspaceRoot, 'src/main.ts'), `export const value = ${implementations === 1 ? 1 : 2} // attempt ${implementations}\n`)
          await writeFile(join(request.policy.snapshot.workspaceRoot, 'src/e2e-check.mjs'), "import fs from 'node:fs'; process.exit(fs.readFileSync('src/main.ts','utf8').includes('value = 2') ? 0 : 1)\n")
        })
        text = 'Simulated implementation; host checks provide evidence.'
        if (implementations === 1) events.push({ type: 'approval.requested', request: { id: 'e2e-approval-1', runId: request.runId, requestId: 'e2e-request-1', threadId, turnId,
          kind: 'command', summary: 'Autorizar check simulado', details: { command: 'node src/e2e-check.mjs', availableDecisions: ['accept', 'decline', 'cancel'] }, status: 'pending' } })
      } else {
        const context = JSON.parse(input.objective), task = request.policy.snapshot.plan.tasks.find(item => item.id === request.taskId)!
        text = JSON.stringify({ taskId: task.id, attemptId: request.attemptId, testedTreeHash: context.testedTreeHash, approved: true, acceptanceMet: task.acceptanceCriteria, definitionOfDoneMet: request.policy.snapshot.plan.definitionOfDone })
      }
      events.push({ type: 'content.delta', turnId, text }, { type: 'turn.completed', turnId, status: 'completed' })
      fake = new FakeHostAdapter(events); yield* fake.start(input, signal)
    },
    async respondToApproval(id, decision) { await fake.respondToApproval(id, decision) },
    async interrupt(id) { await fake.interrupt(id) },
  }
  return { host, async dispose() {} }
}
const createCheckSandbox = async (): Promise<CheckSandbox> => ({
  async execute(command, signal) {
    try {
      const result = await fixtureExecFile(command.executable, command.args, { encoding: 'utf8', cwd: command.cwd, env: { PATH: process.env.PATH, HOME: fixture.base }, timeout: command.timeoutMs, signal, maxBuffer: 65536 })
      return { exitCode: 0, contentHash: sha256(result.stdout + result.stderr) }
    } catch (error) {
      const result = error as { code?: number; stdout?: string; stderr?: string }
      if (typeof result.code !== 'number') throw error
      return { exitCode: result.code, contentHash: sha256((result.stdout ?? '') + (result.stderr ?? '')) }
    }
  }, async dispose() {},
})
const services = createDomainServices({ ...fixture.options, planning: new PlanningService(fixture.options), planningPolicy: async () => initialPolicy,
  execution: new ExecutionService({ store: fixture.store, createHost, createCheckSandbox }),
  executionContext: async planId => {
    const plan = fixture.store.get('approvedPlan', planId)!.data
    const policy = await loadPolicy(join(policies, `${plan.plan.policyHash}.policy.json`), plan.plan.policyHash)
    const workspace = await createWorkspace(policy); fixture.lifetime.defer(() => workspace.release())
    return { policy, workspace }
  },
  planningBindings: () => [fixture.demand.id, 'demand-stale'].map(demandId => ({ demandId, repositoryPath: initialPolicy.snapshot.repository.root, plan: initialPolicy.snapshot.plan })), policyDirectory: policies })
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
console.log('Simulated panel ready on loopback')
