import { afterEach, expect, it } from 'vitest'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PlanningService } from '@ioteams/runtime'
import { createDomainServices } from '../../../apps/server/src/services.js'
import { planningFixture } from '../runtime/planning.fixture.js'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
it('plans an API draft through the real PlanningService, exposes its exact hash and approves only that snapshot', async () => {
  const f = await planningFixture(); cleanup.push(() => f.cleanup())
  const directory = join(f.base, 'api-approved'); await mkdir(directory, { mode: 0o700 })
  const service = createDomainServices({ ...f.options, planning: new PlanningService(f.options), planningPolicy: async () => f.policy, policyDirectory: directory })
  cleanup.push(() => service.close!())
  const signal = new AbortController().signal
  const { teamId, requirements, ...draft } = f.demand
  expect(await service.execute({ resource: 'demands', body: draft }, signal)).toMatchObject({ version: 1, data: draft })
  expect(await service.execute({ resource: 'demands', id: draft.id, action: 'plan', body: { expectedVersion: 1, teamId, requirements } }, signal)).toEqual({ id: draft.id, status: 'accepted' })
  await expect.poll(async () => { try { return (await service.read('proposals', draft.id, {})) as { hash: string } } catch { return undefined } }).toMatchObject({ hash: expect.stringMatching(/^[a-f0-9]{64}$/) })
  const proposal = await service.read('proposals', draft.id, {}) as { hash: string; productBacklog: { items: unknown[] }; roles: unknown[] }
  expect(proposal.productBacklog.items).toHaveLength(1)
  expect(proposal.roles).toHaveLength(3)
  expect(await service.read('planningStatus', draft.id, {})).toEqual({ demandId: draft.id, status: 'proposed', hash: proposal.hash })
  const demand = await service.read('demands', draft.id, {}) as { version: number }
  await expect(service.execute({ resource: 'demands', id: draft.id, action: 'approve', body: { expectedVersion: demand.version, reviewedHash: 'f'.repeat(64) } }, signal)).rejects.toMatchObject({ code: 'PROPOSAL_MISMATCH' })
  expect(f.store.list('approvedPlan')).toEqual([])
  const approved = await service.execute({ resource: 'demands', id: draft.id, action: 'approve', body: { expectedVersion: demand.version, reviewedHash: proposal.hash } }, signal)
  expect(approved).toMatchObject({ data: { demandId: draft.id } })
  expect(await service.read('planningStatus', draft.id, {})).toMatchObject({ status: 'approved', hash: proposal.hash })
  expect(f.store.list('run')).toEqual([])
  const planId = f.store.list('approvedPlan')[0].data.id
  const task = await service.execute({ resource: 'tasks', body: { projectId: draft.projectId, planId, taskId: 'task-1' } }, signal)
  expect(task).toMatchObject({ data: { state: { mode: 'operational', status: 'TODO', requirements: { professionIds: ['desenvolvimento'], stackIds: ['git'] } } } })
  await expect(service.execute({ resource: 'tasks', body: { projectId: draft.projectId, planId, taskId: 'task-1', professional: { professionIds: ['forged'] } } }, signal)).rejects.toThrow()
  expect(f.inputs).toHaveLength(3)
  await expect(service.execute({ resource: 'demands', id: draft.id, action: 'plan', body: { expectedVersion: demand.version, teamId, requirements } }, signal)).rejects.toThrow()
  expect(f.inputs).toHaveLength(3)
})
it('makes competency gaps visible without creating a proposal, task or native session', async () => {
  const f = await planningFixture(); cleanup.push(() => f.cleanup())
  const service = createDomainServices({ ...f.options, planning: new PlanningService(f.options), planningPolicy: async () => f.policy })
  cleanup.push(() => service.close!())
  const { teamId, requirements, ...draft } = f.demand
  const signal = new AbortController().signal
  await service.execute({ resource: 'demands', body: draft }, signal)
  expect(await service.read('planningStatus', draft.id, {})).toEqual({ demandId: draft.id, status: 'draft' })
  requirements[0].competencies.stackIds = ['swift']
  await service.execute({ resource: 'demands', id: draft.id, action: 'plan', body: { expectedVersion: 1, teamId, requirements } }, signal)
  await expect.poll(() => service.read('planningStatus', draft.id, {})).toMatchObject({ status: 'needs_competency', gaps: [{ competencyId: 'swift' }] })
  expect(f.inputs).toEqual([]); expect(f.store.list('task')).toEqual([])
})
