import { expect, it, vi } from 'vitest'
import { setImmediate } from 'node:timers/promises'
import { executionFixture, FixtureExecutionService as ExecutionService } from '../runtime/execution.fixture.js'

it('retains SQLite, workspace leases and files until an interrupted implementation actually settles', async () => {
  let release!: () => void, entered!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const active = new Promise<void>(resolve => { entered = resolve })
  const f = await executionFixture({ implement: async () => { entered(); await held } })
  const close = f.store.close.bind(f.store)
  let implementationPending = true, closedEarly = false
  const guard = vi.spyOn(f.store, 'close').mockImplementation(() => {
    if (implementationPending) { closedEarly = true; throw new Error('Unsafe early close prevented by regression probe') }
    close()
  })
  const running = new ExecutionService(f).start({ id: 'lifecycle' }, f.policy, f.workspace)
  let cleaning: Promise<void> | undefined
  try {
    await active
    cleaning = f.cleanup(); void cleaning.catch(() => {})
    await setImmediate()
    expect(closedEarly).toBe(false)
    expect(f.store.get('run', 'lifecycle')).toBeDefined()
    await f.workspace.assertOwned()
  } finally {
    implementationPending = false; release()
    await running.catch(() => {})
    await cleaning?.catch(() => {})
    guard.mockRestore()
    await f.cleanup()
  }
})

it.each(['resume', 'reconcile'] as const)('drains %s before closing SQLite or releasing its workspace', async method => {
  const { ExecutionService: NativeExecutionService } = await import('@ioteams/runtime')
  const f = await executionFixture()
  let release!: () => void, entered!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const active = new Promise<void>(resolve => { entered = resolve })
  f.store.create('run', { id: 'lifecycle', projectId: f.plan.projectId, planId: f.plan.id, status: 'paused' })
  f.store.appendEvent({ id: 'lifecycle-started', projectId: f.plan.projectId, runId: 'lifecycle', type: 'execution.started', at: new Date().toISOString(), data: {
    policyHash: f.policy.snapshot.plan.policyHash, workspace: JSON.parse(JSON.stringify(f.workspace.repository)),
  } })
  const actual: InstanceType<typeof NativeExecutionService>['resume'] = NativeExecutionService.prototype[method]
  const gate = vi.spyOn(NativeExecutionService.prototype, method).mockImplementation(async function (this: InstanceType<typeof NativeExecutionService>, ...args) {
    entered(); await held
    return actual.apply(this, args)
  })
  const running = new ExecutionService(f)[method]({ id: 'lifecycle' }, f.policy, f.workspace)
  let cleaned = false
  try {
    await active
    const cleaning = f.cleanup().then(() => { cleaned = true })
    await setImmediate()
    expect(cleaned).toBe(false)
    expect(f.store.get('run', 'lifecycle')).toBeDefined()
    await f.workspace.assertOwned()
    release()
    await running
    await cleaning
    const { access } = await import('node:fs/promises')
    await expect(access(f.base)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    release(); await running.catch(() => {}); gate.mockRestore(); await f.cleanup()
  }
})

it('drains unfinished setup and resources acquired after cancellation before deleting its repository', async () => {
  const { testFixtureLifetime } = await import('../runtime/execution.fixture.js')
  const { repository } = await import('../../fixtures/runtime/repository.js')
  const { access } = await import('node:fs/promises')
  const lifetime = testFixtureLifetime()
  let release!: () => void, entered!: (base: string) => void
  const held = new Promise<void>(resolve => { release = resolve })
  const active = new Promise<string>(resolve => { entered = resolve })
  let lateResourceReleased = false
  const setup = lifetime.run(async () => {
    const f = await repository(); entered(f.base)
    await held
    lifetime.defer(() => { lateResourceReleased = true })
  })
  let cleaned = false
  try {
    const base = await active
    const cleaning = lifetime.cleanup().then(() => { cleaned = true })
    await setImmediate()
    expect(cleaned).toBe(false)
    await access(base)
    release(); await setup; await cleaning
    expect(lateResourceReleased).toBe(true)
    await expect(access(base)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { release(); await setup; await lifetime.cleanup() }
})

it('waits for the exact cancelled child to close before removing its cwd', async () => {
  const { mkdtemp, readFile, writeFile, access, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { testFixtureLifetime } = await import('../runtime/execution.fixture.js')
  const { fixtureExecFile } = await import('../../fixtures/runtime/repository.js')
  const lifetime = testFixtureLifetime()
  const base = await mkdtemp(join(tmpdir(), 'ioteams-t14-child-'))
  lifetime.defer(() => rm(base, { recursive: true, force: true }))
  const ready = join(base, 'ready'), terminated = join(base, 'terminated'), released = join(base, 'released')
  const child = lifetime.run(() => fixtureExecFile(process.execPath, ['-e', `
    const fs = require('node:fs');
    process.on('SIGTERM', () => {
      fs.writeFileSync(process.argv[2], 'ack');
      const wait = setInterval(() => { if (fs.existsSync(process.argv[3])) { clearInterval(wait); process.exit(0) } }, 5);
    });
    fs.writeFileSync(process.argv[1], String(process.pid));
    setInterval(() => {}, 1000);
  `, ready, terminated, released], { encoding: 'utf8', cwd: base, env: { PATH: process.env.PATH } }))
  void child.catch(() => {})
  let pid: number | undefined, cleaning: Promise<void> | undefined, cleaned = false
  try {
    await expect.poll(() => readFile(ready, 'utf8').then(Number).catch(() => 0)).toBeGreaterThan(0)
    pid = Number(await readFile(ready, 'utf8'))
    cleaning = lifetime.cleanup().then(() => { cleaned = true })
    await expect.poll(() => access(terminated).then(() => true).catch(() => false)).toBe(true)
    expect(cleaned).toBe(false)
    expect(() => process.kill(pid!, 0)).not.toThrow()
    await writeFile(released, 'release')
    await expect(child).rejects.toMatchObject({ name: 'AbortError' })
    await cleaning
    expect(() => process.kill(pid!, 0)).toThrow()
    await expect(access(base)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    if (!cleaned) { lifetime.controller.abort(); await writeFile(released, 'release') }
    await child.catch(() => {}); await (cleaning ?? lifetime.cleanup())
  }
})

it('cleans a cancelled factory setup even when it never returns a fixture to its caller', async () => {
  const controller = new AbortController(); controller.abort()
  const creating = executionFixture({ signal: controller.signal })
  await expect(creating).rejects.toMatchObject({ name: 'AbortError' })
  await creating.cleanup()
})


it('keeps a native check fixture leased until its interrupted process has closed', async () => {
  const { nativeCheckFixture } = await import('../runtime/checks.fixture.js')
  const { assertCheckCommand } = await import('@ioteams/runtime')
  const { access } = await import('node:fs/promises')
  const { dirname, join } = await import('node:path')
  const f = await nativeCheckFixture(`import fs from 'node:fs'; fs.writeFileSync('src/check-ready', 'ready'); setInterval(()=>{},1000)`)
  const sandbox = await f.createSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] })
  const command = await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0])
  let pending = true, releasedEarly = false
  const release = f.workspace.release.bind(f.workspace)
  const guard = vi.spyOn(f.workspace, 'release').mockImplementation(async () => {
    if (pending) { releasedEarly = true; throw new Error('Unsafe native-check release prevented by regression probe') }
    await release()
  })
  const running = sandbox.execute(command).finally(() => { pending = false })
  void running.catch(() => {})
  let cleaning: Promise<void> | undefined
  try {
    await f.lifetime.run(() => expect.poll(() => access(join(f.workspaceRoot, 'src/check-ready')).then(() => true).catch(() => false), { timeout: 7000 }).toBe(true), 'check-readiness')
    cleaning = f.cleanup(); void cleaning.catch(() => {})
    expect(releasedEarly).toBe(false)
    await expect(running).rejects.toMatchObject({ code: 'CHECK_INTERRUPTED' })
    await cleaning
    await expect(access(f.base)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    f.lifetime.controller.abort(); await running.catch(() => {}); await cleaning?.catch(() => {})
    guard.mockRestore(); await f.cleanup()
  }
}, 20_000)
