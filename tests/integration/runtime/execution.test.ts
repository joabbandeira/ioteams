import { afterEach, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canonicalJson, sha256 } from '../../../packages/runtime/src/policy.js'
import { executionFixture, FixtureExecutionService as ExecutionService } from './execution.fixture.js'
import type { ExecutionResult } from '@ioteams/runtime'
import type { StoreEvent } from '@ioteams/storage'
import { git } from '../../fixtures/runtime/repository.js'
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function setup(options: Parameters<typeof executionFixture>[0] = {}) {
  const creating = executionFixture(options)
  cleanups.unshift(creating.cleanup)
  return await creating
}

type ApprovalFailureSnapshot = {
  result?: ExecutionResult; resultSettled: boolean; nativeResponses: number; outcomes: string[]; events: StoreEvent[]
  approvals?: { version: number; id: string; requestId: string; status: string }[]
}
/** Test-only failure context: never replace the assertion or expose free text/argv. */
function rethrowApprovalFailure(error: unknown, collect: ApprovalFailureSnapshot | (() => ApprovalFailureSnapshot)): never {
  try {
    const snapshot = typeof collect === 'function' ? collect() : collect
    const code = (value: unknown) => typeof value === 'string' && /^[A-Z0-9_]{1,128}$/.test(value)
    const controls = new Set(['execution.status', 'execution.approval.intent', 'execution.check.intent', 'execution.check.result',
      'execution.session', 'execution.turn', 'execution.turn.result', 'execution.commit.intent', 'execution.commit.result',
      'execution.push.intent', 'execution.push.result'])
    const keys = ['status', 'requestId', 'decision', 'phase', 'taskId', 'attemptId', 'threadId', 'turnId',
      'exitCode', 'startedAt', 'finishedAt', 'contentHash', 'treeHash', 'testedTreeHash', 'sha']
    const events = snapshot.events.filter(event => controls.has(event.type)).slice(-40).map(event => {
      const data = event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data : {}
      const fields = Object.fromEntries(keys.filter(key => typeof data[key] === 'string' || typeof data[key] === 'number')
        .map(key => [key, typeof data[key] === 'string' ? data[key].slice(0, 256) : data[key]]))
      const command = data.command && typeof data.command === 'object' && !Array.isArray(data.command) ? data.command : undefined
      return { sequence: event.sequence, type: event.type, at: event.at, ...fields,
        ...(event.type === 'execution.status' && code(data.reason) ? { reason: data.reason } : {}),
        ...(command ? { command: { executable: typeof command.executable === 'string' ? command.executable.slice(0, 128) : undefined,
          timeoutMs: typeof command.timeoutMs === 'number' ? command.timeoutMs : undefined } } : {}) }
    })
    const result = snapshot.result && { id: snapshot.result.id, status: snapshot.result.status,
      ...(code(snapshot.result.reason) ? { reason: snapshot.result.reason } : {}) }
    if (error instanceof Error) error.message += `\nApproval failure diagnostics: ${JSON.stringify({ ...snapshot, result, events })}`
  } catch { /* Diagnostic collection/formatting must never replace the original failure. */ }
  throw error
}

it('runs real checks, independent review and exact commit/push before DONE; duplicate calls have no effects', async () => {
  const f = await setup(), service = new ExecutionService(f)
  const result = await service.start({ id: 'run-1' }, f.policy, f.workspace)
  expect(result.status).toBe('completed')
  expect(f.phases).toEqual(['implement', 'review'])
  expect(f.disposed).toEqual(f.phases)
  const task = f.store.get('task', 'task-1')!.data.state
  expect(task.status).toBe('DONE')
  expect(task.evidence).toHaveLength(1)
  expect(task.evidence[0].exitCode).toBe(0)
  expect(task.completion).toMatchObject({ mode: 'operational', commit: { sha: await git(f.workspaceRoot, 'rev-parse', 'HEAD') } })
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(await git(f.workspaceRoot, 'rev-parse', 'HEAD'))
  const counts = f.counts()
  expect(await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)).toEqual(result)
  expect(f.counts()).toEqual(counts)
}, 25_000)

it('rejects a failed real check despite agent success text, preserves history and corrects in a fresh turn', async () => {
  const f = await setup({ implement: async (request, input, count) => {
    await writeFile(join(request.policy.snapshot.workspaceRoot, 'src/main.ts'), `export const value = ${count === 1 ? 9 : 2}\n`)
    if (count === 2) expect(JSON.parse(input.objective).previousRejection).toContain('CHECK_FAILED')
  } }), service = new ExecutionService(f)
  expect((await service.start({ id: 'run-1' }, f.policy, f.workspace)).status).toBe('completed')
  const state = f.store.get('task', 'task-1')!.data.state
  expect(state.attempts.map(a => a.status)).toEqual(['REJECTED', 'DONE'])
  expect(state.history.map(e => e.to)).toEqual(['IN_PLANNING', 'READY', 'IN_PROGRESS', 'REJECTED', 'TODO', 'IN_PLANNING', 'READY', 'IN_PROGRESS', 'DONE'])
  expect(f.store.list('evidence').map(e => e.data.evidence.exitCode).sort()).toEqual([0, 1])
  expect(state.evidence).toHaveLength(1)
  expect(f.phases).toEqual(['implement', 'implement', 'review'])
}, 20_000)

it('returns review rejection to correction, with at most three attempts and no commit on exhaustion', async () => {
  const f = await setup({ review: value => ({ ...value, approved: false, reason: 'Acceptance missing', acceptanceMet: [], definitionOfDoneMet: [] }) })
  const result = await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)
  expect(result.status).toBe('blocked')
  expect(f.store.get('task', 'task-1')!.data.state.attempts).toHaveLength(3)
  expect(f.store.get('task', 'task-1')!.data.state.status).toBe('TODO')
  expect(await git(f.workspaceRoot, 'rev-parse', 'HEAD')).toBe(f.plan.baseSha)
}, 30_000)

it('executes dependent tasks sequentially and binds each evidence to its own attempt tree', async () => {
  const f = await setup({ tasks: 2 })
  expect((await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)).status).toBe('completed')
  expect(f.phases).toEqual(['implement', 'review', 'implement', 'review'])
  expect(f.store.list('task').map(t => t.data.state.status)).toEqual(['DONE', 'DONE'])
}, 30_000)

it('corrects a rejected review in a new session without reusing previous evidence', async () => {
  const f = await setup({ review: (value, count) => count === 1 ? { ...value, approved: false, reason: 'Missing edge case', acceptanceMet: [], definitionOfDoneMet: [] } : value })
  expect((await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)).status).toBe('completed')
  expect(f.phases).toEqual(['implement', 'review', 'implement', 'review'])
  expect(f.store.get('task', 'task-1')!.data.state.evidence).toHaveLength(1)
}, 25_000)

it('blocks out-of-scope writes before checks, commit or push', async () => {
  const f = await setup({ implement: async request => { await writeFile(join(request.policy.snapshot.workspaceRoot, 'docs/escape.md'), 'not authorized') } })
  expect(await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)).toMatchObject({ status: 'blocked', reason: 'OUT_OF_SCOPE' })
  expect(f.counts()).toEqual({ implementations: 1, reviews: 0, checks: 0 })
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(f.plan.baseSha)
})

for (const scope of ['inside', 'outside'] as const) {
  it(`refuses ${scope}-scope check artifacts even when the process exits zero`, async () => {
    const f = await setup({ check: `import fs from 'node:fs'; fs.writeFileSync('${scope === 'inside' ? 'src/check-output.txt' : 'docs/check-output.txt'}','changed');` })
    const result = await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)
    expect(result).toMatchObject({ status: 'blocked', reason: scope === 'inside' ? 'TREE_CHANGED' : 'OUT_OF_SCOPE' })
    expect(f.store.get('task', 'task-1')!.data.state.status).toBe('IN_PROGRESS')
    expect(await git(f.workspaceRoot, 'rev-parse', 'HEAD')).toBe(f.plan.baseSha)
  }, scope === 'inside' ? 20_000 : 10_000)
}

it('keeps host failures distinct from technical rejection and never automatically repeats a turn', async () => {
  const f = await setup({ events: events => [...events.slice(0, -1), { type: 'error', code: 'INFRA', message: 'transport failed', retryable: true }] })
  const service = new ExecutionService(f)
  expect(await service.start({ id: 'run-1' }, f.policy, f.workspace)).toMatchObject({ status: 'paused', reason: 'HOST_ERROR' })
  expect(f.store.get('task', 'task-1')!.data.state.attempts[0].status).toBe('IN_PROGRESS')
  const counts = f.counts()
  await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)
  expect(f.counts()).toEqual(counts)
})

it('binds approval to the active native request and preserves denial as a paused run', async () => {
  const f = await setup({ events: (events, phase) => phase === 'implement' ? [...events.slice(0, 2), {
    type: 'approval.requested', request: { id: 'approval-1', requestId: 'request-1', runId: 'run-1',
      threadId: 'execution-thread-1', turnId: 'execution-turn-1', kind: 'command', summary: 'Run approved tool', details: {}, status: 'pending' },
  }, ...events.slice(2)] : events })
  const service = new ExecutionService(f), running = service.start({ id: 'run-1' }, f.policy, f.workspace)
  await expect.poll(() => f.store.get('run', 'run-1')?.data.status, { timeout: 7000 }).toBe('awaiting_approval')
  await expect(service.respondToApproval('run-1', 'stale', 'decline')).rejects.toMatchObject({ code: 'STALE_APPROVAL' })
  await service.respondToApproval('run-1', 'request-1', 'decline')
  expect(await running).toMatchObject({ status: 'paused', reason: 'NATIVE_APPROVAL_DENIED' })
  expect(f.store.get('approval', 'approval-1')!.data.status).toBe('declined')
  expect(f.store.get('task', 'task-1')!.data.state.attempts).toHaveLength(1)
  expect(f.counts().checks).toBe(0)
})

it('aborts a stalled iterator even if the adapter ignores the signal', async () => {
  const f = await setup(), abort = new AbortController(); let disposed = false, interrupted = false
  const createHost: typeof f.createHost = async () => ({ host: {
    async *start() {
      yield { type: 'thread.started' as const, threadId: 'stalled-thread' }
      yield { type: 'turn.started' as const, threadId: 'stalled-thread', turnId: 'stalled-turn' }
      abort.abort()
      await new Promise(() => {})
    }, async respondToApproval() {}, async interrupt() { interrupted = true },
  }, async dispose() { disposed = true } })
  const result = await new ExecutionService({ ...f, createHost }).start({ id: 'run-1' }, f.policy, f.workspace, abort.signal)
  expect(result).toMatchObject({ status: 'interrupted' })
  expect(disposed).toBe(true); expect(interrupted).toBe(true)
  expect(f.store.get('task', 'task-1')!.data.state.attempts[0].status).toBe('IN_PROGRESS')
})

it('pauses a stalled check without starting a corrective model turn', async () => {
  const f = await setup({ check: 'setInterval(()=>{},1000)' })
  const result = await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)
  expect(result.status).toBe('paused')
  expect(f.counts().implementations).toBe(1)
  expect(f.store.get('task', 'task-1')!.data.state.attempts[0].status).toBe('IN_PROGRESS')
})

it('reconciles a completed push after its durable result was lost without creating another commit', async () => {
  const f = await setup(), append = f.store.appendEvent.bind(f.store); let injected = false
  f.store.appendEvent = event => {
    if (event.type === 'execution.push.result' && !injected) { injected = true; throw new Error('simulated crash before result') }
    return append(event)
  }
  const service = new ExecutionService(f)
  const stopped = await service.start({ id: 'run-1' }, f.policy, f.workspace)
  expect(stopped.status).not.toBe('completed')
  const sha = await git(f.workspaceRoot, 'rev-parse', 'HEAD'), counts = f.counts()
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(sha)
  expect(await new ExecutionService(f).reconcile({ id: 'run-1' }, f.policy, f.workspace)).toMatchObject({ status: 'completed' })
  expect(await git(f.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sha)
  expect(f.counts()).toEqual(counts)
}, 20_000)

it('recovers a commit whose result was lost and pushes only after explicit resume', async () => {
  const f = await setup(), append = f.store.appendEvent.bind(f.store); let injected = false
  f.store.appendEvent = event => {
    if (event.type === 'execution.commit.result' && !injected) { injected = true; throw new Error('crash after commit') }
    return append(event)
  }
  await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)
  const sha = await git(f.workspaceRoot, 'rev-parse', 'HEAD')
  const restarted = new ExecutionService(f)
  expect((await restarted.reconcile({ id: 'run-1' }, f.policy, f.workspace)).status).toBe('paused')
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(f.plan.baseSha)
  expect(await restarted.reconcile({ id: 'run-1', retryPush: true }, f.policy, f.workspace)).toMatchObject({ status: 'completed' })
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(sha)
  expect(f.counts()).toEqual({ implementations: 1, reviews: 1, checks: 1 })
}, 20_000)

it('does not duplicate a commit after push failure; read-only reconciliation observes unchanged remote', async () => {
  const f = await setup()
  const { chmod, mkdir } = await import('node:fs/promises')
  await mkdir(join(f.remote, 'hooks'), { recursive: true })
  const hook = join(f.remote, 'hooks/pre-receive')
  await writeFile(hook, '#!/bin/sh\nexit 1\n'); await chmod(hook, 0o700)
  const service = new ExecutionService(f)
  expect((await service.start({ id: 'run-1' }, f.policy, f.workspace)).status).toBe('paused')
  const sha = await git(f.workspaceRoot, 'rev-parse', 'HEAD')
  expect(await service.reconcile({ id: 'run-1' }, f.policy, f.workspace)).toMatchObject({ status: 'paused', reason: 'PUSH_NOT_CONFIRMED' })
  expect(await git(f.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sha)
  const { rm } = await import('node:fs/promises'); await rm(hook)
  expect((await service.reconcile({ id: 'run-1', retryPush: true }, f.policy, f.workspace)).status).toBe('completed')
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(sha)
}, 20_000)

it('refuses exact-DONE on remote advance, including an advance after the authorized push', async () => {
  const f = await setup(), append = f.store.appendEvent.bind(f.store); let injected = false
  f.store.appendEvent = event => {
    if (event.type === 'execution.push.result' && !injected) { injected = true; throw new Error('crash') }
    return append(event)
  }
  await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)
  const { mkdir } = await import('node:fs/promises'); const other = join(f.base, 'other')
  await mkdir(other)
  await git(f.base, 'clone', f.remote, other); await git(other, 'checkout', 'develop')
  await writeFile(join(other, 'src/remote-advance.ts'), 'unrelated advance')
  await git(other, 'add', 'src'); await git(other, 'commit', '-m', 'remote advance'); await git(other, 'push', 'origin', 'develop')
  expect(await new ExecutionService(f).reconcile({ id: 'run-1', retryPush: true }, f.policy, f.workspace)).toMatchObject({ status: 'paused', reason: 'REMOTE_DIVERGED' })
  expect(f.store.get('task', 'task-1')!.data.state.status).toBe('IN_PROGRESS')
}, 20_000)

it('resumes remaining tasks after reconciling delivery without repeating the completed task', async () => {
  const f = await setup({ tasks: 2 }), append = f.store.appendEvent.bind(f.store); let injected = false
  f.store.appendEvent = event => {
    if (event.type === 'execution.push.result' && !injected) { injected = true; throw new Error('crash task 1') }
    return append(event)
  }
  await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)
  const restarted = new ExecutionService(f)
  expect(await restarted.reconcile({ id: 'run-1' }, f.policy, f.workspace)).toMatchObject({ status: 'paused', reason: 'RECONCILED_REMAINING_TASKS' })
  expect((await restarted.resume({ id: 'run-1' }, f.policy, f.workspace)).status).toBe('completed')
  expect(f.counts()).toEqual({ implementations: 2, reviews: 2, checks: 2 })
}, 30_000)

it('honors cancellation arriving during reviewer disposal before any commit or push', async () => {
  const f = await setup(), abort = new AbortController()
  const createHost: typeof f.createHost = async request => {
    const session = await f.createHost(request)
    return { host: session.host, async dispose() { await session.dispose(); if (request.phase === 'review') abort.abort() } }
  }
  expect((await new ExecutionService({ ...f, createHost }).start({ id: 'run-1' }, f.policy, f.workspace, abort.signal)).status).toBe('interrupted')
  expect(await git(f.workspaceRoot, 'rev-parse', 'HEAD')).toBe(f.plan.baseSha)
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(f.plan.baseSha)
}, 20_000)

it('rejects model changes to the policy file and never uses changed paths/checks', async () => {
  const f = await setup(), { chmod, readFile } = await import('node:fs/promises')
  const original = await readFile(f.policy.file, 'utf8')
  const createHost: typeof f.createHost = async request => {
    const session = await f.createHost(request)
    return { host: session.host, async dispose() {
      await session.dispose()
      if (request.phase === 'implement') {
        const changed = JSON.parse(original); changed.plan.tasks[0].allowedPaths.push('docs')
        await chmod(f.policy.file, 0o600); await writeFile(f.policy.file, JSON.stringify(changed)); await chmod(f.policy.file, 0o400)
      }
    } }
  }
  const result = await new ExecutionService({ ...f, createHost }).start({ id: 'run-1' }, f.policy, f.workspace)
  expect(result).toMatchObject({ status: 'blocked', reason: 'POLICY_MISMATCH' })
  expect(f.counts().checks).toBe(0)
})

it('requires the read-only reviewer to leave the tested tree unchanged', async () => {
  const f = await setup()
  const createHost: typeof f.createHost = async request => {
    const session = await f.createHost(request)
    return { host: session.host, async dispose() {
      await session.dispose()
      if (request.phase === 'review') await writeFile(join(f.workspaceRoot, 'src/main.ts'), 'reviewer changed source')
    } }
  }
  expect(await new ExecutionService({ ...f, createHost }).start({ id: 'run-1' }, f.policy, f.workspace)).toMatchObject({ status: 'blocked', reason: 'TREE_CHANGED' })
  expect(await git(f.workspaceRoot, 'rev-parse', 'HEAD')).toBe(f.plan.baseSha)
})

it('does not create a second commit when the persisted intent exists but Git never ran', async () => {
  const f = await setup(), append = f.store.appendEvent.bind(f.store); let injected = false
  f.store.appendEvent = event => {
    const result = append(event)
    if (event.type === 'execution.commit.intent' && !injected) { injected = true; throw new Error('crash before git') }
    return result
  }
  await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)
  expect(await new ExecutionService(f).reconcile({ id: 'run-1', retryPush: true }, f.policy, f.workspace)).toMatchObject({ status: 'paused', reason: 'COMMIT_NOT_CONFIRMED' })
  expect(await git(f.workspaceRoot, 'rev-parse', 'HEAD')).toBe(f.plan.baseSha)
})

it('reconciles durable intent, evidence and projections after reopening its task-owned SQLite store', async () => {
  const f = await setup(), append = f.store.appendEvent.bind(f.store); let injected = false
  f.store.appendEvent = event => {
    if (event.type === 'execution.push.result' && !injected) { injected = true; throw new Error('crash') }
    return append(event)
  }
  await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)
  f.store.close()
  const { openStore } = await import('@ioteams/storage')
  const store = openStore({ directory: f.operations, checkoutRoots: [f.source, f.workspaceRoot] })
  try {
    expect((await new ExecutionService({ ...f, store }).reconcile({ id: 'run-1' }, f.policy, f.workspace)).status).toBe('completed')
    expect(store.list('evidence')).toHaveLength(1)
    expect(store.get('task', 'task-1')!.data.state.status).toBe('DONE')
    expect(f.counts()).toEqual({ implementations: 1, reviews: 1, checks: 1 })
  } finally { await f.lifetime.drain(); store.close() }
}, 20_000)

it('accepts one explicitly bound approval and rejects concurrent duplicate responses before native RPC', async () => {
  const f = await setup({ events: (events, phase) => phase === 'implement' ? [...events.slice(0, 2), {
    type: 'approval.requested', request: { id: 'approval-1', requestId: 'request-1', runId: 'run-1',
      threadId: 'execution-thread-1', turnId: 'execution-turn-1', kind: 'command', summary: 'Approved command', details: {}, status: 'pending' },
  }, ...events.slice(2)] : events })
  let responses = 0
  const createHost: typeof f.createHost = async request => {
    const session = await f.createHost(request), native = session.host.respondToApproval.bind(session.host)
    session.host.respondToApproval = async (id, decision) => { responses++; await native(id, decision) }
    return session
  }
  const service = new ExecutionService({ ...f, createHost }), running = service.start({ id: 'run-1' }, f.policy, f.workspace)
  await expect.poll(() => f.store.get('run', 'run-1')?.data.status, { timeout: 7000 }).toBe('awaiting_approval')
  const results = await Promise.allSettled([service.respondToApproval('run-1', 'request-1', 'accept'), service.respondToApproval('run-1', 'request-1', 'accept')])
  let finalResult: ExecutionResult | undefined
  try {
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(responses).toBe(1)
    finalResult = await running
    expect(finalResult.status).toBe('completed')
  } catch (error) {
    rethrowApprovalFailure(error, () => {
      const events: StoreEvent[] = []; let cursor = 0
      while (true) {
        const page = f.store.eventsAfter(cursor, { limit: 1000 }); events.push(...page.filter(event => event.runId === 'run-1'))
        if (page.length < 1000) break
        cursor = page.at(-1)!.sequence
      }
      return { result: finalResult ?? service.status('run-1'), resultSettled: finalResult !== undefined,
        nativeResponses: responses, outcomes: results.map(result => result.status), events,
        approvals: f.store.list('approval').filter(record => record.data.runId === 'run-1')
          .map(({ version, data }) => ({ version, id: data.id, requestId: data.requestId, status: data.status })) }
    })
  }
}, 20_000)

it('prevents another service from reconciling a still-active native turn', async () => {
  const f = await setup(), abort = new AbortController()
  const createHost: typeof f.createHost = async () => ({ host: {
    async *start() { yield { type: 'thread.started' as const, threadId: 'active-thread' }; yield { type: 'turn.started' as const, threadId: 'active-thread', turnId: 'active-turn' }; await new Promise(() => {}) },
    async respondToApproval() {}, async interrupt() {},
  }, async dispose() {} })
  const running = new ExecutionService({ ...f, createHost }).start({ id: 'run-1' }, f.policy, f.workspace, abort.signal)
  await expect.poll(() => f.store.get('run', 'run-1')?.data.turnId, { timeout: 7000 }).toBe('active-turn')
  await expect(new ExecutionService(f).reconcile({ id: 'run-1' }, f.policy, f.workspace)).rejects.toMatchObject({ code: 'EXECUTION_BUSY' })
  expect((await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)).status).toBe('running')
  abort.abort(); expect((await running).status).toBe('interrupted')
})

it('carries only the assigned Developer citations from the approved proposal as verified data', async () => {
  const { fixture } = await import('../knowledge/fixtures.js')
  const { openKnowledge, indexCatalog, searchKnowledge } = await import('@ioteams/knowledge')
  const corpus = await fixture(), index = openKnowledge({ memory: true })
  cleanups.push(async () => { index.close(); await corpus.cleanup() })
  await indexCatalog(index, { root: corpus.root, commitSha: corpus.sha })
  const sources = await searchKnowledge(index, { query: 'Referência', filters: { professionalId: 'bia-martins' }, topK: 2 })
  const f = await setup({ corpusRoots: [corpus.root] })
  const body = {
    demand: { id: 'demand-1' }, policy: JSON.parse(JSON.stringify(f.policy.snapshot)), roles: [{ role: 'Developer', professionalId: 'bia-martins', threadId: 'planning-dev-thread', turnId: 'planning-dev-turn',
      citations: sources.citations, output: { tasks: [f.plan.tasks[0]], citationIds: sources.citations.map(c => c.documentId) } }],
  }
  const hash = sha256(canonicalJson(body))
  const decoy = { ...body, roles: body.roles.map(role => ({ ...role, citations: role.citations.map(c => ({ ...c, commitSha: '0'.repeat(40) })) })) }
  f.store.appendEvent({ id: 'unapproved-same-demand', projectId: f.plan.projectId, type: 'planning.proposed', at: new Date().toISOString(), data: { ...decoy, hash: sha256(canonicalJson(decoy)) } })
  f.store.appendEvent({ id: 'approved-proposal-data', projectId: f.plan.projectId, type: 'planning.proposed', at: new Date().toISOString(), data: { ...body, hash } })
  f.store.appendEvent({ id: 'approval-binding', projectId: f.plan.projectId, type: 'planning.approved', at: new Date().toISOString(), data: {
    demandId: 'demand-1', proposalHash: hash, policyHash: f.policy.snapshot.plan.policyHash,
  } })
  expect((await new ExecutionService(f).start({ id: 'run-1' }, f.policy, f.workspace)).status).toBe('completed')
  expect(f.inputs[0].retrievedData).toEqual(sources.citations)
  expect(f.inputs[1].retrievedData).toEqual(sources.citations)
  expect(f.inputs[0].identity.threadId).toBeUndefined()
}, 20_000)

it('pauses immediately on an uncertain approval RPC and never retries the native decision', async () => {
  const f = await setup({ events: (events, phase) => phase === 'implement' ? [...events.slice(0, 2), {
    type: 'approval.requested', request: { id: 'approval-1', requestId: 'request-1', runId: 'run-1', threadId: 'execution-thread-1', turnId: 'execution-turn-1', kind: 'command', summary: 'Native request', details: {}, status: 'pending' },
  }, ...events.slice(2)] : events }), abort = new AbortController()
  let responses = 0
  const createHost: typeof f.createHost = async request => {
    const session = await f.createHost(request)
    session.host.respondToApproval = async () => { responses++; throw new Error('native transport result unknown') }
    return session
  }
  const service = new ExecutionService({ ...f, createHost }), running = service.start({ id: 'run-1' }, f.policy, f.workspace, abort.signal)
  try {
    await expect.poll(() => f.store.get('run', 'run-1')?.data.status, { timeout: 7000 }).toBe('awaiting_approval')
    await expect(service.respondToApproval('run-1', 'request-1', 'accept')).rejects.toThrow()
    await expect.poll(() => service.status('run-1').status, { timeout: 500 }).toBe('paused')
    expect((await running).reason).toBe('APPROVAL_UNCERTAIN')
    await expect(service.respondToApproval('run-1', 'request-1', 'accept')).rejects.toThrow()
    expect(responses).toBe(1)
    expect(f.counts().checks).toBe(0)
  } finally { abort.abort(); await running }
})

it('preserves approval assertion identity and pause reason without exposing event text or command arguments', () => {
  const assertion = new Error('expected completed')
  let caught: unknown
  try {
    rethrowApprovalFailure(assertion, {
      result: { id: 'run-1', status: 'paused', reason: 'EXECUTION_INTERRUPTED' }, resultSettled: true,
      nativeResponses: 1, outcomes: ['fulfilled', 'rejected'],
      events: [{ sequence: 7, id: 'event-7', projectId: 'project-1', runId: 'run-1', type: 'execution.check.intent', at: '2026-10-14T23:00:00.000Z', data: { taskId: 'task-1', command: { executable: 'node', args: ['sensitive-fixture-text'], timeoutMs: 1000 }, text: 'sensitive-fixture-text' } },
        { sequence: 8, id: 'event-8', projectId: 'project-1', runId: 'run-1', type: 'execution.status', at: '2026-10-14T23:00:01.000Z', data: { status: 'paused', reason: 'EXECUTION_INTERRUPTED', transcript: 'sensitive-fixture-text' } },
        { sequence: 9, id: 'event-9', projectId: 'project-1', runId: 'run-1', type: 'execution.check.intent', at: '2026-10-14T23:00:01.000Z', data: { command: { executable: { arbitrary: 'sensitive-fixture-text' }, timeoutMs: { arbitrary: 'sensitive-fixture-text' } } } },
        { sequence: 10, id: 'event-10', projectId: 'project-1', runId: 'run-1', type: 'execution.rejected', at: '2026-10-14T23:00:02.000Z', data: { reason: 'sensitive-fixture-text' } },
        { sequence: 11, id: 'event-11', projectId: 'project-1', runId: 'run-1', type: 'execution.status', at: '2026-10-14T23:00:03.000Z', data: { status: 'paused', reason: 'sensitive-fixture-text' } }],
    })
  } catch (error) { caught = error }
  expect(caught).toBe(assertion)
  expect(assertion.message).toContain('EXECUTION_INTERRUPTED')
  expect(assertion.message).toContain('execution.check.intent')
  expect(assertion.message).toContain('1000')
  expect(assertion.message).not.toContain('sensitive-fixture-text')
})

it('never replaces the original approval assertion when diagnostics cannot be collected or attached', () => {
  const snapshot: ApprovalFailureSnapshot = { result: { id: 'run-1', status: 'paused', reason: 'GIT_FAILED' }, resultSettled: true, nativeResponses: 1, outcomes: ['fulfilled', 'rejected'], events: [] }
  const frozen = Object.freeze(new Error('original frozen assertion'))
  let caught: unknown
  try { rethrowApprovalFailure(frozen, snapshot) } catch (error) { caught = error }
  expect(caught).toBe(frozen)
  const original = new Error('original assertion before failed collection')
  try { rethrowApprovalFailure(original, () => { throw new Error('diagnostic source unavailable') }) } catch (error) { caught = error }
  expect(caught).toBe(original)
})
