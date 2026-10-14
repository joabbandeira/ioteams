import { trackedBody, drainTestBodies } from '../../fixtures/runtime/test-lifetime.js'
import { afterEach, expect, it } from 'vitest'
import { chmod, copyFile, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FakeHostAdapter } from '@ioteams/codex'
import { HostTurnInputSchema } from '@ioteams/core'
import { turn } from '../../fixtures/contracts.js'
import { verifyNativeExecutable, guardNativeApprovals } from '../../../apps/server/src/native.js'
const roots: string[] = []
afterEach(async () => { await drainTestBodies(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() { const root = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-native-api-'))); roots.push(root); return root }
it('requires a canonical native executable outside served checkouts and binds its bytes across uses', trackedBody(async () => {
  const root = await setup(), checkout = join(root, 'checkout'); await mkdir(checkout)
  const file = join(root, 'tool'); await copyFile(await realpath('/usr/bin/true'), file); await chmod(file, 0o700)
  const verified = await verifyNativeExecutable(file, [checkout])
  await verified.assertUnchanged()
  const bytes = await readFile(file); bytes[bytes.length - 1] ^= 1; await writeFile(file, bytes)
  await expect(verified.assertUnchanged()).rejects.toMatchObject({ code: 'EXECUTABLE_CHANGED' })
  const alias = join(root, 'alias'); await symlink(file, alias)
  await expect(verifyNativeExecutable(alias, [checkout])).rejects.toMatchObject({ code: 'UNSAFE_EXECUTABLE' })
  await copyFile('/usr/bin/true', join(checkout, 'tool')); await chmod(join(checkout, 'tool'), 0o700)
  await expect(verifyNativeExecutable(join(checkout, 'tool'), [checkout])).rejects.toMatchObject({ code: 'UNSAFE_EXECUTABLE' })
}))
it('rejects scripts and writable executables rather than discovering a repo PATH entry', trackedBody(async () => {
  const root = await setup(), script = join(root, 'codex')
  await writeFile(script, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  await expect(verifyNativeExecutable(script, [])).rejects.toMatchObject({ code: 'UNSAFE_EXECUTABLE' })
  await copyFile('/usr/bin/true', script); await chmod(script, 0o777)
  await expect(verifyNativeExecutable(script, [])).rejects.toMatchObject({ code: 'UNSAFE_EXECUTABLE' })
}))
it('fails closed on native accept until the adapter policy guard is available, while preserving decline', trackedBody(async () => {
  const raw = new FakeHostAdapter([
    { type: 'thread.started', threadId: 't1' }, { type: 'turn.started', threadId: 't1', turnId: 'turn1' },
    { type: 'approval.requested', request: { id: 'a1', runId: 'run-1', threadId: 't1', turnId: 'turn1', requestId: 'req1', kind: 'permissions', summary: 'Grant', details: { network: true }, status: 'pending' } },
    { type: 'turn.completed', turnId: 'turn1', status: 'completed' },
  ])
  const host = guardNativeApprovals(raw)
  const stream = host.start(HostTurnInputSchema.parse(turn))[Symbol.asyncIterator]()
  await stream.next(); await stream.next(); expect((await stream.next()).value.type).toBe('approval.requested')
  await expect(host.respondToApproval('req1', 'accept')).rejects.toMatchObject({ code: 'NATIVE_APPROVAL_GUARD_REQUIRED' })
  await host.respondToApproval('req1', 'decline')
  expect((await stream.next()).value.type).toBe('turn.completed')
  await stream.return?.()
}))
it('refuses a check runtime inside a served checkout before creating any artifacts', trackedBody(async () => {
  const { createNativeFactories } = await import('../../../apps/server/src/native.js')
  const { repository } = await import('../../fixtures/runtime/repository.js')
  const { approvePolicy, preparePolicy, inspectRepository } = await import('@ioteams/runtime')
  const { readdir } = await import('node:fs/promises')
  const f = await repository(); roots.push(f.base)
  const root = join(f.source, 'unsafe-checks'); await mkdir(root, { mode: 0o700 })
  const snapshot = await preparePolicy({ plan: f.plan, repository: await inspectRepository(f.source, 'origin'), workspaceRoot: f.workspaceRoot, trustedInstructions: [] })
  const policy = await approvePolicy(snapshot, snapshot.plan.policyHash, f.state)
  const factories = await createNativeFactories({ codexExecutable: await realpath('/usr/bin/true'), checkoutRoots: [f.source],
    runtimeHome: join(f.base, 'runtime'), checkRuntimeRoot: root, searchPath: [] })
  await expect(factories.createCheckSandbox({ policy, taskId: f.plan.tasks[0].id })).rejects.toThrow()
  expect(await readdir(root)).toEqual([])
}))
