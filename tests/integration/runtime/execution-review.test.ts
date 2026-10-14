import { afterEach, expect, it } from 'vitest'
import { readFile, writeFile, chmod, rm } from 'node:fs/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTask, type HostTurnInput } from '@ioteams/core'
import { loadCatalog, listCorpusMarkdown } from '@ioteams/catalog'
import { indexCatalog } from '@ioteams/knowledge'
import { createWorkspace, PlanningService, type Workspace } from '@ioteams/runtime'
import { planningFixture } from './planning.fixture.js'
import { executionFixture, testFixtureLifetime, FixtureExecutionService as ExecutionService } from './execution.fixture.js'
import { git } from '../../fixtures/runtime/repository.js'
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })

it('uses the approved demand proposal when an earlier unapproved proposal has the same policy hash and stale corpus', async () => {
  const lifetime = testFixtureLifetime()
  cleanups.push(() => lifetime.cleanup())
  await lifetime.run(async () => {
    const f = await planningFixture(); let workspace: Workspace | undefined
    lifetime.defer(() => f.cleanup())
    lifetime.defer(async () => { if (workspace) await workspace.release() })
    const planning = new PlanningService(f.options), first = await planning.propose(f.demand, f.policy)
    if (first.status !== 'proposed') throw new Error('Missing first proposal')
    for (const path of await listCorpusMarkdown(f.corpus.root)) {
      const file = join(f.corpus.root, path)
      await writeFile(file, await readFile(file, 'utf8') + '\nCurrent corpus revision.\n')
    }
    await indexCatalog(f.index, { root: f.corpus.root, commitSha: f.corpus.commit() })
    const second = await planning.propose({ ...f.demand, id: 'demand-2' }, f.policy)
    if (second.status !== 'proposed') throw new Error('Missing second proposal')
    expect(first.proposal.policy.plan.policyHash).toBe(second.proposal.policy.plan.policyHash)
    const policy = await planning.approve('demand-2', second.proposal.hash, f.state)
    const catalog = (await loadCatalog(f.corpus.root)).map(entry => entry.metadata)
    for (const task of policy.snapshot.plan.tasks) {
      const state = createTask({ mode: 'operational', task,
        professional: catalog.find(entry => entry.kind === 'professional' && entry.id === task.professionalId),
        team: catalog.find(entry => entry.kind === 'team' && entry.id === 'lisa'),
        requirements: f.demand.requirements[0].competencies, definitionOfDone: policy.snapshot.plan.definitionOfDone,
        delivery: { pushRequired: true, branch: policy.snapshot.plan.branch, remote: policy.snapshot.plan.remote } })
      f.store.create('task', { id: task.id, projectId: policy.snapshot.plan.projectId, planId: policy.snapshot.plan.id, state })
    }
    workspace = await createWorkspace(policy)
    const captured: HostTurnInput[] = []
    const result = await new ExecutionService({ lifetime, store: f.store, createHost: async () => ({ host: {
      async *start(input) { captured.push(input); yield { type: 'error' as const, code: 'PROBE', message: 'Sources captured', retryable: false } },
      async interrupt() {}, async respondToApproval() {},
    }, async dispose() {} }), createCheckSandbox: async () => { throw new Error('No check expected') } }).start({ id: 'run-approved' }, policy, workspace)
    expect(result).toMatchObject({ status: 'paused', reason: 'HOST_ERROR' })
    expect(captured).toHaveLength(1)
    expect(captured[0].retrievedData).toEqual(second.proposal.roles.find(role => role.role === 'Developer')!.citations)
    expect(captured[0].retrievedData).not.toEqual(first.proposal.roles.find(role => role.role === 'Developer')!.citations)
  })
})

it('keeps manual approved plans free of citations from unapproved proposed events', async () => {
  const creating = executionFixture(); cleanups.push(creating.cleanup)
  const f = await creating
  f.store.appendEvent({ id: 'unapproved-proposal', projectId: f.plan.projectId, type: 'planning.proposed', at: new Date().toISOString(), data: {
    demand: { id: 'demand-1' }, policy: JSON.parse(JSON.stringify(f.policy.snapshot)), roles: [{ role: 'Developer', professionalId: 'bia-martins', threadId: 'unapproved-thread', turnId: 'unapproved-turn',
      citations: [{ documentId: 'unapproved', path: 'stacks/git/uso.md', heading: 'Git', lineStart: 1, lineEnd: 1, commitSha: '0'.repeat(40), contentHash: '0'.repeat(64), excerpt: 'Unapproved source' }],
      output: { tasks: [f.plan.tasks[0]], citationIds: ['unapproved'] } }],
  } })
  expect((await new ExecutionService(f).start({ id: 'run-manual' }, f.policy, f.workspace)).status).toBe('completed')
  expect(f.inputs.every(input => input.retrievedData.length === 0)).toBe(true)
}, 20_000)

it('blocks remote alias replacement immediately after the durable commit result without pushing elsewhere', async () => {
  const creating = executionFixture(); cleanups.push(creating.cleanup)
  const f = await creating
  const other = join(f.base, 'unapproved.git')
  await git(f.base, 'clone', '--bare', '--no-hardlinks', '--no-local', f.remote, other)
  const append = f.store.appendEvent.bind(f.store)
  f.store.appendEvent = event => {
    const result = append(event)
    if (event.type === 'execution.commit.result') {
      const config = join(f.workspaceRoot, '.git/config')
      writeFileSync(config, readFileSync(config, 'utf8').replace(f.remote, other))
    }
    return result
  }
  expect(await new ExecutionService(f).start({ id: 'run-delivery' }, f.policy, f.workspace)).toMatchObject({ status: 'blocked', reason: 'REPOSITORY_CHANGED' })
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(f.plan.baseSha)
  expect(await git(other, 'rev-parse', 'develop')).toBe(f.plan.baseSha)
  expect(f.store.get('task', 'task-1')!.data.state.status).toBe('IN_PROGRESS')
}, 20_000)

it.each(['remote', 'tree'])('revalidates %s after the retry push intent and never delivers an unverified workspace', async fault => {
  const creating = executionFixture(); cleanups.push(creating.cleanup)
  const f = await creating
  const other = join(f.base, 'unapproved.git')
  await git(f.base, 'clone', '--bare', '--no-hardlinks', '--no-local', f.remote, other)
  const hook = join(f.remote, 'hooks/pre-receive')
  await writeFile(hook, '#!/bin/sh\nexit 1\n'); await chmod(hook, 0o700)
  expect((await new ExecutionService(f).start({ id: 'run-retry' }, f.policy, f.workspace)).status).toBe('paused')
  await rm(hook)
  const append = f.store.appendEvent.bind(f.store); let mutated = false
  f.store.appendEvent = event => {
    const result = append(event)
    if (event.type === 'execution.push.intent') {
      mutated = true
      if (fault === 'remote') {
        const config = join(f.workspaceRoot, '.git/config')
        writeFileSync(config, readFileSync(config, 'utf8').replace(f.remote, other))
      } else writeFileSync(join(f.workspaceRoot, 'src/main.ts'), 'untested tree after intent')
    }
    return result
  }
  const result = await new ExecutionService(f).reconcile({ id: 'run-retry', retryPush: true }, f.policy, f.workspace)
  expect(mutated).toBe(true)
  expect(result).toMatchObject({ status: 'blocked', reason: fault === 'remote' ? 'REPOSITORY_CHANGED' : 'DIRTY_REPOSITORY' })
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(f.plan.baseSha)
  expect(await git(other, 'rev-parse', 'develop')).toBe(f.plan.baseSha)
  expect(f.store.get('task', 'task-1')!.data.state.status).toBe('IN_PROGRESS')
}, 20_000)
