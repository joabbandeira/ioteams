import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { access } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { setImmediate } from 'node:timers/promises'
import { ExecutionService as NativeExecutionService, assertCheckCommand, createNativeCheckSandbox } from '@ioteams/runtime'
import { superviseCheckProcess } from '../../../packages/runtime/src/checks.js'
import { executionFixture, FixtureExecutionService } from './execution.fixture.js'
import { nativeCheckFixture } from './checks.fixture.js'

it('blocks a workspace after uncertain check disposal and releases the barrier only after its exact child closes', async () => {
  const f = await executionFixture()
  let child: ChildProcess | undefined, closing: Promise<void> | undefined
  const targets: number[] = []
  const service = new FixtureExecutionService({ ...f, createCheckSandbox: async () => ({
    async execute(command, signal) {
      child = spawn(process.execPath, ['-e', "process.on('message',()=>process.exit(0)); process.send('ready')"], {
        cwd: command.cwd, env: { PATH: process.env.PATH }, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      const abort = new AbortController()
      const supervised = superviseCheckProcess(child, command.timeoutMs, AbortSignal.any([signal!, abort.signal]), pid => {
        targets.push(pid)
        throw Object.assign(new Error('Scoped signal denied'), { code: 'EPERM' })
      })
      closing = supervised.quiescent
      f.lifetime.defer(() => supervised.quiescent)
      abort.abort()
      await supervised.result
      throw new Error('Denied termination must never produce check evidence')
    },
    async dispose() { await closing },
  }) })
  try {
    let settled = false
    const running = service.start({ id: 'uncertain-check' }, f.policy, f.workspace).then(result => { settled = true; return result })
    void running.catch(() => {})
    await expect.poll(() => f.store.get('run', 'uncertain-check')?.data.status, { timeout: 15000 }).toBe('blocked')
    expect(service.status('uncertain-check')).toMatchObject({ status: 'blocked', reason: 'CHECK_TERMINATION_UNCERTAIN' })
    expect(settled).toBe(false)
    expect(f.store.list('evidence')).toEqual([])
    expect(targets).toEqual([child!.pid])
    await expect(new NativeExecutionService(f).reconcile({ id: 'uncertain-check' }, f.policy, f.workspace)).rejects.toMatchObject({ code: 'EXECUTION_BUSY' })
    await f.workspace.assertOwned()
    expect(() => process.kill(child!.pid!, 0)).not.toThrow()
    child!.send('close'); await closing
    expect(await running).toMatchObject({ status: 'blocked', reason: 'CHECK_TERMINATION_UNCERTAIN' })
    expect((await new NativeExecutionService(f).reconcile({ id: 'uncertain-check' }, f.policy, f.workspace)).status).toBe('paused')
  } finally {
    if (child?.connected) child.send('close')
    await closing; await f.cleanup()
  }
}, 20_000)

it('native dispose drains preflight, refuses late spawn and reuses its closure promise', async () => {
  const f = await nativeCheckFixture('console.log("must not launch")')
  try {
    const sandbox = await f.lifetime.run(async () => {
      const boundary = await createNativeCheckSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] })
      f.lifetime.defer(() => boundary.dispose())
      return boundary
    })
    const command = await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0])
    const running = f.lifetime.run(() => sandbox.execute(command))
    const first = sandbox.dispose(), second = sandbox.dispose()
    expect(first).toBe(second)
    await expect(running).rejects.toMatchObject({ code: 'CHECK_INTERRUPTED' })
    await Promise.all([first, second])
    await expect(access(join(f.base, 'observed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await f.cleanup() }
})

it('retains the checkout when a check leaves its own short-lived descendant in the group with stdio ignored', async () => {
  const { readFile } = await import('node:fs/promises')
  const f = await nativeCheckFixture(`import {spawn} from 'node:child_process'; import fs from 'node:fs'; const child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),3500)'],{stdio:'ignore'}); fs.writeFileSync('src/descendant.pid',String(child.pid)); process.exit(0)`)
  let childPid: number | undefined
  const gone = () => {
    if (!childPid) return true
    try { process.kill(childPid, 0); return false }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' }
  }
  try {
    const sandbox = await f.createSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] })
    const command = await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0])
    const running = sandbox.execute(command)
    void running.catch(() => {})
    await expect.poll(() => readFile(join(f.workspaceRoot, 'src/descendant.pid'), 'utf8').then(Number).catch(() => 0), { timeout: 7000 }).toBeGreaterThan(0)
    childPid = Number(await readFile(join(f.workspaceRoot, 'src/descendant.pid'), 'utf8'))
    await expect(running).rejects.toMatchObject({ code: 'CHECK_TERMINATION_UNCERTAIN' })
    let cleaned = false
    const cleaning = f.cleanup().then(() => { cleaned = true })
    await Promise.resolve(); expect(cleaned).toBe(false)
    await f.workspace.assertOwned(); await access(f.workspaceRoot)
    await cleaning
    await expect(access(f.base)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(gone()).toBe(true)
  } finally {
    // This exact descendant exits naturally. No post-exit group signal or
    // process selected by name is used to finish the test.
    await expect.poll(gone, { timeout: 7000 }).toBe(true)
    await f.cleanup()
  }
}, 20_000)


it.each(['rejected-disposal', 'failed-status-event'] as const)('retains the owning operation through %s until trusted closure reconciliation', async faultMode => {
  const f = await executionFixture()
  let child: ChildProcess | undefined, closing: Promise<void> | undefined, settled = false, confirmed = false, observed!: () => void
  const reachedFault = new Promise<void>(resolve => { observed = resolve })
  const append = f.store.appendEvent.bind(f.store)
  let publicationFailed = false
  const guard = vi.spyOn(f.store, 'appendEvent').mockImplementation(event => {
    if (faultMode === 'failed-status-event' && !publicationFailed && event.type === 'execution.status' && (event.data as { status?: string }).status === 'blocked') {
      publicationFailed = true; observed(); throw Object.assign(new Error('Transient status persistence failure'), { code: 'SQLITE_BUSY' })
    }
    return append(event)
  })
  const owner = new FixtureExecutionService({ ...f, createCheckSandbox: async () => ({
    async execute(command, signal) {
      child = spawn(process.execPath, ['-e', "process.on('message',()=>process.exit(0)); process.send('ready')"], {
        cwd: command.cwd, env: { PATH: process.env.PATH }, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      const abort = new AbortController()
      const supervised = superviseCheckProcess(child, command.timeoutMs, AbortSignal.any([signal!, abort.signal]), () => {
        throw Object.assign(new Error('Scoped signal denied'), { code: 'EPERM' })
      })
      closing = supervised.quiescent.then(() => { confirmed = true })
      f.lifetime.defer(() => closing!)
      abort.abort(); await supervised.result
      throw new Error('No evidence on uncertain termination')
    },
    async dispose() {
      if (faultMode === 'rejected-disposal' && !confirmed) { observed(); throw new Error('Disposal could not confirm closure') }
      await closing
    },
  }) })
  const running = owner.start({ id: 'closure-fault' }, f.policy, f.workspace).then(result => { settled = true; return result })
  void running.catch(() => {})
  try {
    await reachedFault; await setImmediate()
    expect(settled).toBe(false)
    expect(owner.status('closure-fault')).toMatchObject({ status: 'blocked', reason: 'CHECK_TERMINATION_UNCERTAIN' })
    expect(f.store.list('evidence')).toEqual([])
    await expect(new NativeExecutionService(f).reconcile({ id: 'closure-fault' }, f.policy, f.workspace)).rejects.toMatchObject({ code: 'EXECUTION_BUSY' })
    await f.workspace.assertOwned()
    if (faultMode === 'rejected-disposal') await expect(owner.reconcile({ id: 'closure-fault' }, f.policy, f.workspace)).rejects.toMatchObject({ code: 'CHECK_TERMINATION_UNCERTAIN' })
    expect(settled).toBe(false)
    child!.send('close'); await closing
    expect((await owner.reconcile({ id: 'closure-fault' }, f.policy, f.workspace)).status).toBe('paused')
    expect(await running).toMatchObject({ status: 'blocked', reason: 'CHECK_TERMINATION_UNCERTAIN' })
  } finally {
    if (child?.connected) child.send('close')
    await closing
    if (!settled) await owner.reconcile({ id: 'closure-fault' }, f.policy, f.workspace).catch(() => {})
    await running.catch(() => {}); guard.mockRestore(); await f.cleanup()
  }
}, 20_000)
