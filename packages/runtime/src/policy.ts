import { createHash } from 'node:crypto'
import { lstat, open, readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'
import { ContentHashSchema, ExecutionPlanSchema, CheckCommandSchema } from '@ioteams/core'
import { RepositorySchema, validateRemoteUrl } from './git.js'
import { canonicalAbsolute, checkoutPath, contains, overlaps, privateState, protectedHomes, protectedPath, resolvedRoot, safeRelative } from './paths.js'
import { fail } from './errors.js'
export const InstructionSchema = z.strictObject({ path: z.string(), kind: z.enum(['instructions', 'configuration']), contentHash: ContentHashSchema })
export type InstructionSource = z.infer<typeof InstructionSchema>
const snapshotSchema = z.strictObject({ version: z.literal(1), plan: ExecutionPlanSchema, repository: RepositorySchema, workspaceRoot: z.string(), trustedInstructions: z.array(InstructionSchema).max(1000), toolReadRoots: z.array(z.string()).max(100).default([]), corpusRoots: z.array(z.string()).max(100).default([]) })
export type PolicySnapshot = z.infer<typeof snapshotSchema>
const inputSchema = snapshotSchema.omit({ version: true })
export type PolicyInput = z.input<typeof inputSchema>
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  return JSON.stringify(value)
}
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
function policyHash(snapshot: PolicySnapshot): string {
  const { policyHash: _, ...plan } = snapshot.plan
  return sha256(canonicalJson({ ...snapshot, plan }))
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value) }
  return value
}
async function validateSnapshot(raw: unknown): Promise<PolicySnapshot> {
  const snapshot = snapshotSchema.parse(raw)
  await canonicalAbsolute(snapshot.repository.root); await canonicalAbsolute(snapshot.repository.commonDir); await canonicalAbsolute(snapshot.workspaceRoot)
  if (overlaps(snapshot.repository.root, snapshot.workspaceRoot)) fail('UNSAFE_PATH', 'Checkout deve ser independente da origem.')
  validateRemoteUrl(snapshot.repository.remoteUrl)
  if (snapshot.plan.branch !== snapshot.repository.branch || snapshot.plan.baseSha !== snapshot.repository.head || snapshot.plan.remote !== snapshot.repository.remote)
    fail('POLICY_MISMATCH', 'Plano não corresponde ao repositório aprovado.')
  for (const task of snapshot.plan.tasks) for (const path of task.allowedPaths) {
    if (protectedPath(path)) fail('PROTECTED_SCOPE', 'Escopo não pode autorizar escrita em controles de execução.')
    await checkoutPath(snapshot.workspaceRoot, path)
  }
  if (new Set(snapshot.corpusRoots).size !== snapshot.corpusRoots.length) fail('UNSAFE_PATH', 'Raiz de corpus duplicada.')
  for (const root of snapshot.corpusRoots) {
    await resolvedRoot(root)
    if (overlaps(root, snapshot.workspaceRoot)) fail('UNSAFE_PATH', 'Checkout não pode sobrepor o corpus.')
  }
  if (new Set(snapshot.toolReadRoots).size !== snapshot.toolReadRoots.length) fail('UNSAFE_PATH', 'Raiz de ferramentas duplicada.')
  for (const root of snapshot.toolReadRoots) {
    await canonicalAbsolute(root)
    const info = await lstat(root)
    if ((!info.isDirectory() && (!info.isFile() || info.nlink !== 1)) || root === sep || root === homedir() || [...protectedHomes(), ...snapshot.corpusRoots, snapshot.repository.root, snapshot.workspaceRoot].some(path => overlaps(root, path)))
      fail('UNSAFE_PATH', 'Leitura de ferramentas deve ter raízes explícitas, separadas e limitadas.')
  }
  const trusted = new Set<string>()
  for (const source of snapshot.trustedInstructions) {
    safeRelative(source.path)
    if (trusted.has(source.path)) fail('POLICY_MISMATCH', 'Fonte de instrução duplicada.')
    trusted.add(source.path)
    if (snapshot.corpusRoots.some(root => contains(root, join(snapshot.repository.root, source.path)))) fail('UNTRUSTED_INSTRUCTIONS', 'Corpus nunca é fonte de instruções operacionais.')
    if (source.kind !== 'instructions' || !/^(?:.*\/)?AGENTS(?:\.override)?\.md$/.test(source.path))
      fail('UNSUPPORTED_PROJECT_CONFIG', 'Config, plugins e skills do projeto não podem ser carregados neste runtime v1.')
  }
  return snapshot
}
/** A proposal, not authorization. The UI must show this exact snapshot/hash to the human. */
export async function preparePolicy(input: unknown): Promise<PolicySnapshot> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('POLICY_MISMATCH', 'Proposta inválida.')
  const parsed = inputSchema.parse(input)
  const snapshot = await validateSnapshot({ ...parsed, version: 1 })
  snapshot.plan.policyHash = policyHash(snapshot)
  return frozen(snapshot)
}
export class ApprovedPolicy {
  private constructor(readonly snapshot: PolicySnapshot, readonly file: string) { Object.freeze(this) }
  /** Only the trusted approval service supplies approvedHash; model output is never an approval. */
  static async persist(raw: unknown, approvedHash: string, directory: string): Promise<ApprovedPolicy> {
    const snapshot = await validateSnapshot(raw)
    ContentHashSchema.parse(approvedHash)
    if (snapshot.plan.policyHash !== approvedHash || policyHash(snapshot) !== approvedHash) fail('POLICY_MISMATCH', 'Aprovação não corresponde ao snapshot exato.')
    await privateState(directory, [snapshot.repository.root, snapshot.workspaceRoot, ...snapshot.toolReadRoots, ...snapshot.corpusRoots])
    const file = join(directory, `${approvedHash}.policy.json`)
    let handle
    try { handle = await open(file, 'wx', 0o400) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('POLICY_EXISTS', 'Política existente não pode ser substituída.')
      throw error
    }
    try { await handle.writeFile(canonicalJson(snapshot)); await handle.sync() } finally { await handle.close() }
    return new ApprovedPolicy(frozen(snapshot), file)
  }
  static async load(file: string, approvedHash: string): Promise<ApprovedPolicy> {
    await canonicalAbsolute(file)
    const info = await lstat(file)
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o077) || info.size > 4_194_304) fail('UNSAFE_STATE', 'Arquivo de política inseguro.')
    const snapshot = await validateSnapshot(JSON.parse(await readFile(file, 'utf8')))
    await privateState(join(file, '..'), [snapshot.repository.root, snapshot.workspaceRoot, ...snapshot.toolReadRoots, ...snapshot.corpusRoots])
    if (snapshot.plan.policyHash !== approvedHash || policyHash(snapshot) !== approvedHash) fail('POLICY_MISMATCH', 'Política persistida diverge da aprovação.')
    return new ApprovedPolicy(frozen(snapshot), file)
  }
}
export const approvePolicy = ApprovedPolicy.persist
export const loadPolicy = ApprovedPolicy.load
export function taskPolicy(policy: ApprovedPolicy, taskId: string) {
  const task = policy.snapshot.plan.tasks.find(task => task.id === taskId)
  if (!task) fail('UNKNOWN_TASK', 'Tarefa não pertence ao plano aprovado.')
  return task
}
export async function assertAllowedPaths(policy: ApprovedPolicy, taskId: string, paths: readonly string[]): Promise<void> {
  const task = taskPolicy(policy, taskId)
  for (const path of paths) {
    safeRelative(path)
    if (protectedPath(path) || !task.allowedPaths.some(scope => contains(scope, path))) fail('OUT_OF_SCOPE', 'Mudança fora do escopo aprovado.')
    await checkoutPath(policy.snapshot.workspaceRoot, path)
  }
}
export async function assertCheckCommand(policy: ApprovedPolicy, taskId: string, raw: unknown): Promise<{ executable: string; args: string[]; cwd: string; timeoutMs: number }> {
  const check = CheckCommandSchema.parse(raw), task = taskPolicy(policy, taskId)
  if (!task.checks.some(command => canonicalJson(command) === canonicalJson(check))) fail('UNAPPROVED_CHECK', 'Comando não consta exatamente do plano aprovado.')
  const cwd = check.cwd ? await checkoutPath(policy.snapshot.workspaceRoot, check.cwd) : await canonicalAbsolute(policy.snapshot.workspaceRoot)
  if (!(await lstat(cwd)).isDirectory()) fail('UNSAFE_PATH', 'Cwd do check deve ser diretório existente.')
  const executable = check.executable.includes('/') ? await checkoutPath(policy.snapshot.workspaceRoot, check.executable) : check.executable
  return { ...check, executable, args: [...check.args], cwd }
}
