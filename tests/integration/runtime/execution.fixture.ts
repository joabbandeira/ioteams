import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FakeHostAdapter } from '@ioteams/codex'
import { openStore } from '@ioteams/storage'
import { createTask, type HostAdapter, type HostEvent, type HostTurnInput } from '@ioteams/core'
import { approvePolicy, createWorkspace, inspectRepository, preparePolicy, type ExecutionHostRequest, type CheckSandbox } from '@ioteams/runtime'
import { sha256 } from '../../../packages/runtime/src/policy.js'
import { git, repository } from '../../fixtures/runtime/repository.js'
const exec = promisify(execFile)
export async function executionFixture(options: { implement?: (request: ExecutionHostRequest, input: HostTurnInput, count: number) => Promise<void>; review?: (value: Record<string, unknown>, count: number) => unknown; events?: (events: HostEvent[], phase: string) => HostEvent[]; check?: string; tasks?: number; corpusRoots?: string[] } = {}) {
  const f = await repository()
  await writeFile(join(f.source, 'src/check.mjs'), options.check ?? `import fs from 'node:fs'; process.exit(fs.readFileSync('src/main.ts','utf8').includes('value = 2') ? 0 : 1)`)
  await git(f.source, 'add', 'src'); await git(f.source, 'commit', '-m', 'check')
  await git(f.source, 'push', 'origin', 'develop')
  f.plan.baseSha = await git(f.source, 'rev-parse', 'HEAD')
  f.plan.tasks[0].checks = [{ executable: 'node', args: ['src/check.mjs', '; literal argument'], timeoutMs: 1000 }]
  for (let i = 2; i <= (options.tasks ?? 1); i++) f.plan.tasks.push({ ...f.plan.tasks[0], id: `task-${i}`, dependsOn: [`task-${i-1}`] })
  const snapshot = await preparePolicy({ plan: f.plan, repository: await inspectRepository(f.source, 'origin'), workspaceRoot: f.workspaceRoot, trustedInstructions: [], corpusRoots: options.corpusRoots ?? [] })
  const policy = await approvePolicy(snapshot, snapshot.plan.policyHash, f.state)
  const workspace = await createWorkspace(policy)
  const operations = join(f.base, 'operations'); await mkdir(operations, { mode: 0o700 })
  const store = openStore({ directory: operations, checkoutRoots: [f.source, f.workspaceRoot] })
  store.create('project', { id: f.plan.projectId, name: 'Fixture', repositoryPath: f.source })
  store.create('demand', { id: 'demand-1', projectId: f.plan.projectId, goal: f.plan.goal })
  store.create('approvedPlan', { id: f.plan.id, projectId: f.plan.projectId, demandId: 'demand-1', plan: policy.snapshot.plan, approvedAt: new Date().toISOString() })
  for (const task of policy.snapshot.plan.tasks) {
    const state = createTask({ mode: 'operational', task,
      professional: { version: 1, kind: 'professional', id: task.professionalId, name: 'Fixture Developer', fictitious: true, professionIds: ['development'], stackIds: ['git'] },
      team: { version: 1, kind: 'team', id: 'lisa', name: 'Fixture Team', members: [{ professionalId: 'po', role: 'Product Owner' }, { professionalId: 'sm', role: 'Scrum Master' }, { professionalId: task.professionalId, role: 'Developer' }] },
      requirements: { professionIds: ['development'], stackIds: ['git'] }, definitionOfDone: f.plan.definitionOfDone,
      delivery: { pushRequired: true, branch: f.plan.branch, remote: f.plan.remote } })
    store.create('task', { id: task.id, projectId: f.plan.projectId, planId: f.plan.id, state })
  }
  const inputs: HostTurnInput[] = [], phases: string[] = [], disposed: string[] = []
  let counter = 0, implementations = 0, reviews = 0, checks = 0
  const createHost = async (request: ExecutionHostRequest) => {
    const number = ++counter; phases.push(request.phase)
    let fake: FakeHostAdapter
    const host: HostAdapter = {
      async *start(input, signal) {
        inputs.push(structuredClone(input))
        let value: unknown = 'checks passed in my text (never evidence)'
        if (request.phase === 'implement') {
          implementations++
          if (options.implement) await options.implement(request, input, implementations)
          else await writeFile(join(f.workspaceRoot, 'src/main.ts'), `export const value = 2 // ${implementations}\n`)
        } else {
          reviews++
          const context = JSON.parse(input.objective)
          const review = { taskId: request.taskId, attemptId: context.attemptId, testedTreeHash: context.testedTreeHash, approved: true,
            acceptanceMet: policy.snapshot.plan.tasks.find(t => t.id === request.taskId)!.acceptanceCriteria,
            definitionOfDoneMet: f.plan.definitionOfDone }
          value = options.review ? options.review(review, reviews) : review
        }
        const events: HostEvent[] = [
          { type: 'thread.started', threadId: `execution-thread-${number}` },
          { type: 'turn.started', threadId: `execution-thread-${number}`, turnId: `execution-turn-${number}` },
          { type: 'content.delta', turnId: `execution-turn-${number}`, text: typeof value === 'string' ? value : JSON.stringify(value) },
          { type: 'turn.completed', turnId: `execution-turn-${number}`, status: 'completed' },
        ]
        fake = new FakeHostAdapter(options.events ? options.events(events, request.phase) : events)
        yield* fake.start(input, signal)
      },
      async respondToApproval(id, decision) { await fake.respondToApproval(id, decision) },
      async interrupt(id) { await fake.interrupt(id) },
    }
    return { host, async dispose() { disposed.push(request.phase) } }
  }
  // Deliberately simulated sandbox boundary in CI. The approved argv is executed
  // in a disposable fixture, with no credential/model/network; production uses native sandbox.
  const createCheckSandbox = async (): Promise<CheckSandbox> => ({
    async execute(command, signal) {
      checks++
      try {
        const result = await exec(command.executable, command.args, { cwd: command.cwd, env: { PATH: process.env.PATH, HOME: f.base }, timeout: command.timeoutMs, signal, maxBuffer: 65536 })
        return { exitCode: 0, contentHash: sha256(result.stdout + result.stderr) }
      } catch (error) {
        const e = error as { code?: number; killed?: boolean; stdout?: string; stderr?: string }
        if (e.killed || typeof e.code !== 'number') throw error
        return { exitCode: e.code, contentHash: sha256((e.stdout ?? '') + (e.stderr ?? '')) }
      }
    }, async dispose() {},
  })
  return { ...f, policy, workspace, store, operations, inputs, phases, disposed, createHost, createCheckSandbox,
    counts: () => ({ implementations, reviews, checks }),
    async cleanup() { store.close(); await workspace.release(); await rm(f.base, { recursive: true, force: true }) } }
}
