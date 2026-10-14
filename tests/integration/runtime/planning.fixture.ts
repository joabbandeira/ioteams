import { FakeHostAdapter } from '@ioteams/codex'
import { openStore } from '@ioteams/storage'
import { indexCatalog, openKnowledge } from '@ioteams/knowledge'
import type { HostAdapter, HostEvent, HostTurnInput, ScrumRole } from '@ioteams/core'
import { approvePolicy, inspectRepository, preparePolicy } from '@ioteams/runtime'
import { repository } from '../../fixtures/runtime/repository.js'
import { planningCorpus } from './planning-corpus.fixture.js'
import { testFixtureLifetime } from '../../fixtures/runtime/test-lifetime.js'

export function output(role: ScrumRole, input: HostTurnInput): Record<string, unknown> {
  const citationIds = [input.retrievedData[0].documentId]
  if (role === 'Product Owner') return {
    productGoal: { id: 'product-goal', objective: 'Referência útil' },
    productBacklog: { id: 'product-backlog', productGoalId: 'product-goal', items: [{ id: 'item-1', title: 'Referência', acceptanceCriteria: ['Utilizável'] }] },
    sprintGoal: { id: 'sprint-goal', objective: 'Entregar referência' }, selectedBacklogItemIds: ['item-1'], citationIds,
  }
  if (role === 'Developer') return { tasks: [{ ...input.approvedPolicy.tasks[0], title: 'Implementar referência' }], citationIds }
  return { observations: ['Plano consistente com os papéis'], impediments: [], citationIds }
}
export function planningFixture(transform: (role: ScrumRole, value: Record<string, unknown>, input: HostTurnInput) => unknown = (_r, v) => v,
  transformEvents: (events: HostEvent[], input: HostTurnInput) => HostEvent[] = events => events,
  options: { signal?: AbortSignal; afterResources?(state: { store: ReturnType<typeof openStore>; base: string }): Promise<void> } = {}) {
  const lifetime = testFixtureLifetime(options.signal)
  const creating = lifetime.run(async () => {
  const repo = await repository(), corpus = await planningCorpus(repo.base)
  const store = openStore({ memory: true }); lifetime.defer(() => store.close())
  const index = openKnowledge({ memory: true }); lifetime.defer(() => index.close())
  await options.afterResources?.({ store, base: repo.base })
  lifetime.assertActive()
  await indexCatalog(index, { root: corpus.root, commitSha: corpus.sha })
  const snapshot = await preparePolicy({ plan: repo.plan, repository: await inspectRepository(repo.source, 'origin'), workspaceRoot: repo.workspaceRoot, trustedInstructions: [], corpusRoots: [corpus.root] })
  const policy = await approvePolicy(snapshot, snapshot.plan.policyHash, repo.state)
  store.create('project', { id: 'project-1', name: 'Fixture', repositoryPath: repo.source })
  const inputs: HostTurnInput[] = [], phases: string[] = [], disposed: number[] = []
  let count = 0
  const factory = async (request: { phase: 'plan' }): Promise<{ host: HostAdapter; dispose(): Promise<void> }> => {
    phases.push(request.phase)
    const number = ++count
    let fake: FakeHostAdapter
    const host: HostAdapter = {
      async *start(input, signal) {
        inputs.push(structuredClone(input))
        const value = transform(input.identity.role, output(input.identity.role, input), input)
        fake = new FakeHostAdapter(transformEvents([
          { type: 'thread.started', threadId: `thread-${number}` },
          { type: 'turn.started', threadId: `thread-${number}`, turnId: `turn-${number}` },
          { type: 'content.delta', turnId: `turn-${number}`, text: typeof value === 'string' ? value : JSON.stringify(value) },
          { type: 'turn.completed', turnId: `turn-${number}`, status: 'completed' },
        ], input))
        yield* fake.start(input, signal)
      },
      async respondToApproval(id, decision) { await fake.respondToApproval(id, decision) },
      async interrupt(id) { await fake.interrupt(id) },
    }
    return { host, async dispose() { disposed.push(number) } }
  }
  const demand = { id: 'demand-1', projectId: 'project-1', teamId: 'lisa', goal: 'Referência', requirements: [{ taskId: 'task-1', competencies: { professionIds: ['desenvolvimento'], stackIds: ['git'] } }] }
  return { ...repo, lifetime, corpus, store, index, policy, inputs, phases, disposed, factory, demand,
    options: { catalogRoot: corpus.root, store, index, createHost: factory },
    cleanup: () => lifetime.cleanup(),
  }
  }, 'setup')
  return Object.assign(creating, { cleanup: () => lifetime.cleanup(), lifetime })
}
