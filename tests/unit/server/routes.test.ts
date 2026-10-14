import { expect, it } from 'vitest'
import { resolveRoute } from '../../../apps/server/src/contracts.js'
it.each([
  ['GET', '/api/v1/catalog', 'catalog'], ['GET', '/api/v1/projects', 'projects'],
  ['GET', '/api/v1/plans/plan1', 'plans'], ['GET', '/api/v1/demands/d1/planning', 'planningStatus'],
  ['GET', '/api/v1/demands/d1/proposal', 'proposals'], ['GET', '/api/v1/runs/r1/status', 'runStatus'],
  ['POST', '/api/v1/knowledge/search', 'knowledge'], ['POST', '/api/v1/approvals/a1/decide', 'approvals'],
])('resolves %s %s to the typed service boundary', (method, path, resource) => {
  expect(resolveRoute(method, path).resource).toBe(resource)
})
it('rejects model-controlled policy, credentials, commands, DONE and versionless control', () => {
  const cases = [
    ['POST', '/api/v1/runs', { id: 'r1', planId: 'p1', executable: 'sh' }],
    ['POST', '/api/v1/tasks/t1/transition', { expectedVersion: 1, target: 'DONE', completion: {} }],
    ['POST', '/api/v1/demands/d1/approve', { expectedVersion: 1, reviewedHash: 'f'.repeat(64), policyPath: '/tmp/policy' }],
    ['POST', '/api/v1/approvals/a1/decide', { expectedVersion: 1, decision: 'accept', permissions: { network: true } }],
    ['POST', '/api/v1/runs/r1/resume', {}],
    ['PATCH', '/api/v1/projects/p1', { expectedVersion: 0, data: { id: 'p1', name: 'P', repositoryPath: '/fixture' } }],
  ] as const
  for (const [method, path, input] of cases) expect(resolveRoute(method, path).input.safeParse(input).success).toBe(false)
  expect(() => resolveRoute('POST', '/api/v1/shell')).toThrow()
  expect(() => resolveRoute('GET', '/api/v1/projects/../shell')).toThrow()
  expect(() => resolveRoute('POST', '/api/v1/plans')).toThrow()
})
