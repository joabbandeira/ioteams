import { chmod, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { approvePolicy, createNativeCheckSandbox, inspectRepository, preparePolicy } from '@ioteams/runtime'
import { testFixtureLifetime } from './execution.fixture.js'
import { repository, git } from '../../fixtures/runtime/repository.js'
export function nativeCheckFixture(check: string, infrastructureFailure = false, timeoutMs = 2000) {
  const lifetime = testFixtureLifetime()
  const creating = lifetime.run(async () => {
    const f = await repository()
    await writeFile(join(f.source, 'src/check.mjs'), check)
    await git(f.source, 'add', 'src'); await git(f.source, 'commit', '-m', 'check')
    f.plan.baseSha = await git(f.source, 'rev-parse', 'HEAD')
    f.plan.tasks[0].checks = [{ executable: 'node', args: ['src/check.mjs', '; touch not-a-command'], timeoutMs }]
    const node = await realpath(process.execPath)
    const draft = await preparePolicy({ plan: f.plan, repository: await inspectRepository(f.source, 'origin'), workspaceRoot: f.workspaceRoot, trustedInstructions: [], toolReadRoots: [dirname(node)] })
    const policy = await approvePolicy(draft, draft.plan.policyHash, f.state)
    const { createWorkspace } = await import('@ioteams/runtime')
    const workspace = { ...await createWorkspace(policy) }
    lifetime.defer(() => workspace.release())
    // This shim simulates ONLY the sandbox boundary. It never claims OS isolation.
    const executable = join(f.base, 'simulated-sandbox')
    await writeFile(executable, `#!${node}\nimport {spawn} from 'node:child_process';\nimport fs from 'node:fs';\nconst args=process.argv.slice(2);\nfs.writeFileSync(${JSON.stringify(join(f.base, 'observed.json'))},JSON.stringify({args,env:process.env}));\n${infrastructureFailure ? 'process.exit(1);' : `const index=args.indexOf('--'); const child=spawn(args[index+1],args.slice(index+2),{stdio:'inherit'}); child.on('exit',code=>process.exit(code??1));`}\n`)
    // Node treats extensionless modules with imports as ESM in v24.
    await chmod(executable, 0o700)
    const createSandbox: typeof createNativeCheckSandbox = options => {
      lifetime.assertActive()
      return lifetime.run(async () => {
        const sandbox = await createNativeCheckSandbox(options)
        lifetime.defer(() => sandbox.dispose())
        return {
          execute(command, signal) {
            lifetime.assertActive()
            return lifetime.run(() => sandbox.execute(command, signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal), 'native-check')
          },
          dispose: () => lifetime.run(() => sandbox.dispose()),
        }
      }, 'sandbox-factory')
    }
    return { ...f, lifetime, workspace, policy, executable, node, createSandbox, cleanup: () => lifetime.cleanup() }
  }, 'setup')
  return Object.assign(creating, { lifetime, cleanup: () => lifetime.cleanup() })
}
