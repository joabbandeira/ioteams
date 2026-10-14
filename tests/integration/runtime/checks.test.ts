import { afterEach, expect, it } from 'vitest'
import { mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { approvePolicy, assertCheckCommand, preparePolicy } from '@ioteams/runtime'
import { nativeCheckFixture } from './checks.fixture.js'
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function setup(...args: Parameters<typeof nativeCheckFixture>) {
  const creating = nativeCheckFixture(...args)
  cleanups.push(creating.cleanup)
  return await creating
}

it('launches the exact native profile/argv with a minimal environment and hashes real check output', async () => {
  const f = await setup(`if(process.argv[2] !== '; touch not-a-command') process.exit(8); if(process.env.IOTEAMS_TEST_PARENT)process.exit(9); console.log('real check');`)
  const previous = process.env.IOTEAMS_TEST_PARENT; process.env.IOTEAMS_TEST_PARENT = 'fabricated marker'
  try {
    const sandbox = await f.createSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] })
    const command = await assertCheckCommand(f.policy, 'task-1', f.policy.snapshot.plan.tasks[0].checks[0])
    expect(await sandbox.execute(command)).toMatchObject({ exitCode: 0, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
    const observed = JSON.parse(await readFile(join(f.base, 'observed.json'), 'utf8'))
    expect(observed.args.slice(0, 4)).toEqual(['sandbox', '--include-managed-config', '-P', expect.stringMatching(/^ioteams-/)])
    expect(observed.env.PATH).toBe(dirname(f.node))
    expect(observed.env.HOME).toBe(join(f.runtimeHome, 'home'))
    expect(observed.env.CODEX_HOME).toBe(f.runtimeHome)
    expect(observed.env.IOTEAMS_TEST_PARENT).toBeUndefined()
    await expect(sandbox.execute(command)).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
    await sandbox.dispose()
  } finally { if (previous === undefined) delete process.env.IOTEAMS_TEST_PARENT; else process.env.IOTEAMS_TEST_PARENT = previous }
}, 15_000)
it.each([false, true])('distinguishes check exit 1 from sandbox infrastructure failure (%s)', async infra => {
  const f = await setup('console.error("failed check"); process.exit(1)', infra)
  try {
    const sandbox = await f.createSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] })
    const result = sandbox.execute(await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0]))
    if (infra) await expect(result).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
    else expect((await result).exitCode).toBe(1)
  } finally { await f.cleanup() }
}, 20_000)
it('terminates only its own process group on check timeout', async () => {
  const f = await setup('setInterval(()=>{},1000)', false, 300)
  try {
    const sandbox = await f.createSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] })
    await expect(sandbox.execute(await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0]))).rejects.toMatchObject({ code: 'CHECK_TIMEOUT' })
    await sandbox.dispose()
  } finally { await f.cleanup() }
})
it('rejects descriptor/config tampering before spawning a check', async () => {
  const f = await setup('console.log("ok")')
  try {
    const options = { policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] }
    const sandbox = await f.createSandbox(options)
    const command = await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0])
    await expect(sandbox.execute({ ...command, args: ['src/another.mjs'] })).rejects.toMatchObject({ code: 'UNAPPROVED_CHECK' })
    await writeFile(join(f.runtimeHome, 'config.toml'), 'default_permissions=":full"')
    await expect(f.createSandbox(options)).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
  } finally { await f.cleanup() }
})

it('blocks configuration changes between factory and execute before the process is spawned', async () => {
  const f = await setup('console.log("must not run")')
  try {
    const sandbox = await f.createSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] })
    await writeFile(join(f.runtimeHome, 'config.toml'), 'default_permissions=":full"')
    await expect(sandbox.execute(await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0]))).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
    await expect(readFile(join(f.base, 'observed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await f.cleanup() }
})

it('reserves a native runtime for one check even across factory instances', async () => {
  const f = await setup('console.log("ok")')
  try {
    const options = { policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] }
    const sandbox = await f.createSandbox(options)
    await expect(f.createSandbox(options)).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
    await sandbox.dispose()
    await expect(sandbox.execute(await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0]))).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
  } finally { await f.cleanup() }
})


it('rejects a task-owned tool directory symlink before execution and accepts its explicitly resolved path', async () => {
  const f = await setup('console.log("canonical tools only")')
  try {
    const tools = join(f.base, 'tool-directory'), alias = join(f.base, 'tool-alias')
    await mkdir(tools); await symlink(tools, alias)
    const { version: _version, ...envelope } = f.policy.snapshot
    const draft = await preparePolicy({ ...envelope, toolReadRoots: [...envelope.toolReadRoots, tools] })
    const policy = await approvePolicy(draft, draft.plan.policyHash, f.state)
    const options = { policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node), alias] }
    await expect(f.createSandbox(options)).rejects.toMatchObject({ code: 'UNSAFE_PATH' })
    await expect(readFile(join(f.base, 'observed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    const sandbox = await f.createSandbox({ ...options, searchPath: [dirname(f.node), await realpath(alias)] })
    expect((await sandbox.execute(await assertCheckCommand(policy, 'task-1', f.plan.tasks[0].checks[0]))).exitCode).toBe(0)
    await sandbox.dispose()
  } finally { await f.cleanup() }
}, 20_000)
