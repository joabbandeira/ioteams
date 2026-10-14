import { afterEach, expect, it } from 'vitest'
import { chmod, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { approvePolicy, assertCheckCommand, createNativeCheckSandbox, inspectRepository, preparePolicy } from '@ioteams/runtime'
import { repository, git } from '../../fixtures/runtime/repository.js'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup(check: string, infrastructureFailure = false, timeoutMs = 2000) {
  const f = await repository(); roots.push(f.base)
  await writeFile(join(f.source, 'src/check.mjs'), check)
  await git(f.source, 'add', 'src'); await git(f.source, 'commit', '-m', 'check')
  f.plan.baseSha = await git(f.source, 'rev-parse', 'HEAD')
  f.plan.tasks[0].checks = [{ executable: 'node', args: ['src/check.mjs', '; touch not-a-command'], timeoutMs }]
  const node = await realpath(process.execPath)
  const draft = await preparePolicy({ plan: f.plan, repository: await inspectRepository(f.source, 'origin'), workspaceRoot: f.workspaceRoot, trustedInstructions: [], toolReadRoots: [dirname(node)] })
  const policy = await approvePolicy(draft, draft.plan.policyHash, f.state)
  const { createWorkspace } = await import('@ioteams/runtime')
  const workspace = await createWorkspace(policy)
  // This shim simulates ONLY the sandbox boundary. It never claims OS isolation.
  const executable = join(f.base, 'simulated-sandbox')
  await writeFile(executable, `#!${node}\nimport {spawn} from 'node:child_process';\nimport fs from 'node:fs';\nconst args=process.argv.slice(2);\nfs.writeFileSync(${JSON.stringify(join(f.base, 'observed.json'))},JSON.stringify({args,env:process.env}));\n${infrastructureFailure ? 'process.exit(1);' : `const index=args.indexOf('--'); const child=spawn(args[index+1],args.slice(index+2),{stdio:'inherit'}); child.on('exit',code=>process.exit(code??1));`}\n`)
  // Node treats extensionless modules with imports as ESM in v24.
  await chmod(executable, 0o700)
  return { ...f, workspace, policy, executable, node }
}
it('launches the exact native profile/argv with a minimal environment and hashes real check output', async () => {
  const f = await setup(`if(process.argv[2] !== '; touch not-a-command') process.exit(8); if(process.env.IOTEAMS_TEST_PARENT)process.exit(9); console.log('real check');`)
  const previous = process.env.IOTEAMS_TEST_PARENT; process.env.IOTEAMS_TEST_PARENT = 'fabricated marker'
  try {
    const sandbox = await createNativeCheckSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node), '/usr/bin', '/bin'] })
    const command = await assertCheckCommand(f.policy, 'task-1', f.policy.snapshot.plan.tasks[0].checks[0])
    expect(await sandbox.execute(command)).toMatchObject({ exitCode: 0, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
    const observed = JSON.parse(await readFile(join(f.base, 'observed.json'), 'utf8'))
    expect(observed.args.slice(0, 4)).toEqual(['sandbox', '--include-managed-config', '-P', expect.stringMatching(/^ioteams-/)])
    expect(observed.env.HOME).toBe(join(f.runtimeHome, 'home'))
    expect(observed.env.CODEX_HOME).toBe(f.runtimeHome)
    expect(observed.env.IOTEAMS_TEST_PARENT).toBeUndefined()
    await expect(sandbox.execute(command)).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
    await sandbox.dispose()
  } finally { if (previous === undefined) delete process.env.IOTEAMS_TEST_PARENT; else process.env.IOTEAMS_TEST_PARENT = previous; await f.workspace.release() }
})
it.each([false, true])('distinguishes check exit 1 from sandbox infrastructure failure (%s)', async infra => {
  const f = await setup('console.error("failed check"); process.exit(1)', infra)
  try {
    const sandbox = await createNativeCheckSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node), '/usr/bin', '/bin'] })
    const result = sandbox.execute(await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0]))
    if (infra) await expect(result).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
    else expect((await result).exitCode).toBe(1)
  } finally { await f.workspace.release() }
})
it('terminates only its own process group on check timeout', async () => {
  const f = await setup('setInterval(()=>{},1000)', false, 300)
  try {
    const sandbox = await createNativeCheckSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node), '/usr/bin', '/bin'] })
    await expect(sandbox.execute(await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0]))).rejects.toMatchObject({ code: 'CHECK_TIMEOUT' })
    await sandbox.dispose()
  } finally { await f.workspace.release() }
})
it('rejects descriptor/config tampering before spawning a check', async () => {
  const f = await setup('console.log("ok")')
  try {
    const options = { policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] }
    const sandbox = await createNativeCheckSandbox(options)
    const command = await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0])
    await expect(sandbox.execute({ ...command, args: ['src/another.mjs'] })).rejects.toMatchObject({ code: 'UNAPPROVED_CHECK' })
    await writeFile(join(f.runtimeHome, 'config.toml'), 'default_permissions=":full"')
    await expect(createNativeCheckSandbox(options)).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
  } finally { await f.workspace.release() }
})

it('blocks configuration changes between factory and execute before the process is spawned', async () => {
  const f = await setup('console.log("must not run")')
  try {
    const sandbox = await createNativeCheckSandbox({ policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] })
    await writeFile(join(f.runtimeHome, 'config.toml'), 'default_permissions=":full"')
    await expect(sandbox.execute(await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0]))).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
    await expect(readFile(join(f.base, 'observed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await f.workspace.release() }
})

it('reserves a native runtime for one check even across factory instances', async () => {
  const f = await setup('console.log("ok")')
  try {
    const options = { policy: f.policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: f.executable, searchPath: [dirname(f.node)] }
    const sandbox = await createNativeCheckSandbox(options)
    await expect(createNativeCheckSandbox(options)).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
    await sandbox.dispose()
    await expect(sandbox.execute(await assertCheckCommand(f.policy, 'task-1', f.plan.tasks[0].checks[0]))).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE' })
  } finally { await f.workspace.release() }
})
