import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ExecutionPlanSchema, type ExecutionPlan } from '@ioteams/core'
import { z } from 'zod'
import { CodexHostError } from './errors.js'
import { homedir } from 'node:os'
const inside = (root: string, path: string) => root === path || path.startsWith(root + sep)
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable)}]` : value && typeof value === 'object'
  ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}` : JSON.stringify(value)
const fail = () => { throw new CodexHostError('UNSUPPORTED_NATIVE_ACCEPT', 'Solicitação excede a autoridade imutável ou não prova efeitos limitados.') }
const authorities = new WeakSet<NativeApprovalAuthority>()
export interface NativeApprovalAuthority {
  readonly policyHash: string; readonly taskId: string; readonly phase: 'plan' | 'implement' | 'review'; readonly cwd: string; readonly runtimeHome: string
  assertPlan(plan: ExecutionPlan): void
  assertAccept(kind: 'command' | 'file_change' | 'permissions', params: Record<string, unknown>): Promise<void>
}
export function isNativeApprovalAuthority(value: unknown): value is NativeApprovalAuthority { return !!value && authorities.has(value as NativeApprovalAuthority) }
/** Trusted composition only, never an HTTP/model payload. Snapshot and roots are copied, not callbacks supplied by a model. */
export async function bindNativeApprovalAuthority(input: { plan: ExecutionPlan; taskId: string; phase: 'plan' | 'implement' | 'review'; cwd: string; runtimeHome: string; protectedRoots: readonly string[]; readRoots: readonly string[] }): Promise<NativeApprovalAuthority> {
  const plan = ExecutionPlanSchema.parse(input.plan), expected = stable(plan), taskId = input.taskId
  const phase = z.enum(['plan', 'implement', 'review']).parse(input.phase), task = plan.tasks.find(task => task.id === taskId)
  if (!task) return fail()
  const cwd = input.cwd, runtimeHome = input.runtimeHome, reads = [cwd, ...input.readRoots]
  const protectedRoots = [runtimeHome, join(homedir(), '.codex'), join(homedir(), '.chatgpt'), join(homedir(), '.agents'),
    ...[process.env.CODEX_HOME, process.env.CODEX_SQLITE_HOME].filter((p): p is string => !!p), ...input.protectedRoots]
  for (const root of [...reads, ...protectedRoots]) if (!isAbsolute(root) || resolve(root) !== root || await realpath(root).catch(() => root) !== root) fail()
  const writes = phase === 'implement' ? task.allowedPaths.map(path => join(cwd, path)) : []
  async function check(path: string, roots: string[]) {
    if (!isAbsolute(path) || resolve(path) !== path || !roots.some(root => inside(root, path)) ||
      protectedRoots.some(root => inside(root, path) || inside(path, root)) ||
      relative(cwd, path).split(sep).some(part => /^(?:\.(?:git|agents|codex|claude|aws|ssh|mcp\.json|env(?:\..*)?)|(?:agents(?:\.override)?|claude|gemini)\.md)$/i.test(part))) fail()
    // Only a canonical existing regular file is provably bounded. Directory/glob/special grants may expose future protected descendants.
    if (await realpath(path) !== path) fail()
    const info = await lstat(path)
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.()) fail()
  }
  const result: NativeApprovalAuthority = Object.freeze({ policyHash: plan.policyHash, taskId, phase, cwd, runtimeHome,
    assertPlan(other: ExecutionPlan) { if (stable(ExecutionPlanSchema.parse(other)) !== expected) fail() },
    async assertAccept(kind: 'command' | 'file_change' | 'permissions', params: Record<string, unknown>) {
      // These installed RPC schemas do not attest sandbox mode / exact changed files; a command string or grantRoot cannot prove scope.
      if (kind !== 'permissions') return fail()
      const value = z.strictObject({ network: z.strictObject({ enabled: z.boolean().nullable() }).nullable(),
        fileSystem: z.strictObject({ read: z.array(z.string()).nullable(), write: z.array(z.string()).nullable() }).nullable() }).safeParse(params.permissions)
      if (!value.success || value.data.network?.enabled !== false && value.data.network?.enabled != null) return fail()
      for (const path of value.data.fileSystem?.read ?? []) await check(path, reads)
      for (const path of value.data.fileSystem?.write ?? []) await check(path, writes)
    },
  })
  authorities.add(result); return result
}
