import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { CodexHostError } from './errors.js'
export type RpcId = number | string
export interface RpcMessage { id?: RpcId; method?: string; params?: unknown; result?: unknown; error?: unknown }
interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }
export class StdioRpc {
  private child: ChildProcessWithoutNullStreams
  private pending = new Map<number, Pending>()
  private sequence = 0
  private buffer = ''
  private decoder = new StringDecoder('utf8')
  private closed?: CodexHostError
  private closing?: Promise<void>
  private exited: Promise<void>
  onMessage: (message: RpcMessage) => void = () => {}
  onFailure: (error: CodexHostError) => void = () => {}
  constructor(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, private timeoutMs: number, private shutdownMs: number) {
    this.child = spawn(command, args, { cwd, env, shell: false, stdio: 'pipe' })
    this.exited = new Promise(resolve => this.child.once('close', () => resolve()))
    this.child.on('error', () => this.fail(new CodexHostError('PROCESS_ERROR', 'Não foi possível iniciar o processo Codex.')))
    this.child.stdin.on('error', () => this.fail(new CodexHostError('DISCONNECTED', 'Canal Codex desconectado.')))
    this.child.on('close', () => this.fail(new CodexHostError('DISCONNECTED', 'Processo Codex encerrou; resultado pendente exige reconciliação.')))
    // Drain diagnostics without logging potentially sensitive model/tool/auth output.
    this.child.stderr.resume()
    this.child.stdout.on('data', (chunk: Buffer) => this.receive(chunk))
  }
  private receive(chunk: Buffer): void {
    if (this.closed) return
    this.buffer += this.decoder.write(chunk)
    if (Buffer.byteLength(this.buffer) > 4_194_304) { this.fail(new CodexHostError('PROTOCOL_ERROR', 'Mensagem Codex excedeu o limite.')); return }
    let index: number
    while (!this.closed && (index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1)
      if (!line.trim()) continue
      try {
        const message: RpcMessage = JSON.parse(line)
        if (!message || typeof message !== 'object' || Array.isArray(message) ||
          (message.id !== undefined && typeof message.id !== 'string' && !Number.isSafeInteger(message.id))) throw new Error()
        if (typeof message.method === 'string') this.onMessage(message)
        else if (typeof message.id === 'number') {
          const pending = this.pending.get(message.id)
          if (!pending) continue // Timed-out/late/duplicate responses never resume work.
          if (('result' in message) === ('error' in message)) throw new Error()
          clearTimeout(pending.timer); this.pending.delete(message.id)
          if (message.error !== undefined) pending.reject(new CodexHostError('RPC_ERROR', 'Codex recusou uma operação RPC.'))
          else pending.resolve(message.result)
        } else throw new Error()
      } catch { this.fail(new CodexHostError('PROTOCOL_ERROR', 'Mensagem Codex inválida.')) }
    }
  }
  send(message: RpcMessage): void {
    if (this.closed) throw this.closed
    this.child.stdin.write(JSON.stringify(message) + '\n')
  }
  request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(this.closed)
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new CodexHostError('RPC_TIMEOUT', 'Timeout Codex; resultado incerto, sem repetição automática.')), this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try { this.send({ id, method, ...(params === undefined ? {} : { params }) }) } catch (e) { this.fail(e as CodexHostError) }
    })
  }
  fail(error: CodexHostError): void {
    if (this.closed) return
    this.closed = error
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear(); this.onFailure(error); void this.dispose()
  }
  dispose(): Promise<void> {
    if (this.closing) return this.closing
    this.closing = Promise.resolve().then(async () => {
      if (!this.closed) this.fail(new CodexHostError('DISPOSED', 'Adapter Codex encerrado.'))
      if (this.child.exitCode !== null || this.child.signalCode !== null) { await this.exited; return }
      // ChildProcess.kill targets this exact spawned child, never a name or shared group.
      this.child.kill('SIGTERM')
      const timer = setTimeout(() => this.child.kill('SIGKILL'), this.shutdownMs)
      await this.exited; clearTimeout(timer)
    })
    return this.closing
  }
}
