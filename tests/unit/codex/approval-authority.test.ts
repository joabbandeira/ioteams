import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { bindNativeApprovalAuthority } from '../../../packages/codex/src/approvals.js'
import { plan } from '../../fixtures/contracts.js'
import { ExecutionPlanSchema } from '@ioteams/core'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
it('binds immutable plan/task/phase and refuses expanded, ambiguous and protected grants', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-t15-authority-'))); roots.push(root)
  const cwd = join(root, 'checkout'); await mkdir(join(cwd, 'tests'), { recursive: true })
  const file = join(cwd, 'tests', 'allowed.txt'); await writeFile(file, 'fixture')
  const protectedRoots = [join(cwd, 'tests', 'protected')]
  await mkdir(protectedRoots[0]); const secret = join(protectedRoots[0], 'marker'); await writeFile(secret, 'fictional')
  const approved = ExecutionPlanSchema.parse(plan)
  const authority = await bindNativeApprovalAuthority({ plan: approved, taskId: 'T01', phase: 'implement', cwd, runtimeHome: join(root, 'runtime'), protectedRoots, readRoots: [] })
  authority.assertPlan(approved)
  expect(() => authority.assertPlan({ ...approved, goal: 'changed' })).toThrow()
  const profile = (read: string[] | null, write: string[] | null) => ({ network: null, fileSystem: { read, write } })
  await expect(authority.assertAccept('permissions', { permissions: profile(null, [file]) })).resolves.toBeUndefined()
  for (const permissions of [profile(null, [join(root, 'outside')]), profile([secret], null),
    profile([cwd], null), { network: { enabled: true }, fileSystem: null },
    { network: null, fileSystem: { read: null, write: null, entries: [{ path: { type: 'special', value: { kind: 'root' } }, access: 'write' }] } }])
    await expect(authority.assertAccept('permissions', { permissions })).rejects.toThrow()
  for (const kind of ['command', 'file_change'] as const) await expect(authority.assertAccept(kind, {})).rejects.toThrow()
  const review = await bindNativeApprovalAuthority({ plan: approved, taskId: 'T01', phase: 'review', cwd, runtimeHome: join(root, 'runtime'), protectedRoots, readRoots: [] })
  await expect(review.assertAccept('permissions', { permissions: profile(null, [file]) })).rejects.toThrow()
  protectedRoots.length = 0
  await expect(authority.assertAccept('permissions', { permissions: profile([secret], null) })).rejects.toThrow()
})
