import { open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { z, ZodError } from 'zod'
import { IdentifierSchema } from '@ioteams/core'
import { loadCatalog } from '@ioteams/catalog'
import { indexCatalog, openKnowledge, searchKnowledge } from '@ioteams/knowledge'
import { resolveRoute } from '../../server/src/contracts.js'
import { CliError, fail, initializeProduct, offline } from './state.js'
import { createCliClient } from './client.js'
import { doctor, login, type NativeRunner } from './native.js'
import { serve } from './serve.js'
import { proposeInitialPolicy,reviewInitialPolicy,approveInitialPolicy } from './policy.js'
const valueFlags = new Set(['home','corpus','codex','input','key','id','plan','resource','version','demand','hash','approval','decision','query','sha'])
const boolFlags = new Set(['json','offline','wait','show','transition','help','retry-push','device-auth'])
export function parseArguments(argv: string[]) {
  const command = argv[0]
  if (!command || command.startsWith('--')) fail('COMMAND_REQUIRED', 2)
  const flags: Record<string, string | true> = Object.create(null)
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--') || Object.hasOwn(flags, arg.slice(2))) fail('INVALID_ARGUMENT', 2)
    const name = arg.slice(2)
    if (boolFlags.has(name)) flags[name] = true
    else if (valueFlags.has(name) && argv[i+1] !== undefined && !argv[i+1].startsWith('--')) flags[name] = argv[++i]
    else fail('INVALID_ARGUMENT', 2)
  }
  return { command, flags }
}
/** JSON also escapes terminal controls; redact credentials even in arbitrary approval/model data. */
export function safeOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeOutput)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    /(?:secret|token|cookie|password|authorization|api.?key|^auth$|^credentials$)/i.test(key) ? '[REDACTED]' : safeOutput(child)]))
  if (typeof value === 'string') return value.replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+|ioteams_session=[A-Za-z0-9_-]+)/gi, '[REDACTED]')
  return value
}
export interface CliIO { stdout(text: string): void; stderr(text: string): void; stdin(): Promise<string>; signal?: AbortSignal; nativeRunner?: NativeRunner; cwd?: string }
const resources = new Set(['projects','demands','plans','sprints','tasks','runs','approvals'])
export async function runCli(argv: string[], io: CliIO): Promise<number> {
  let json = false
  try {
    const {command, flags} = parseArguments(argv); json = flags.json === true
    const allowed: Record<string, string[]> = {
      init:['corpus','codex'],doctor:[],login:['device-auth'],serve:['input'],catalog:['offline'],index:['sha'],search:['offline','query','input'],
      'policy-propose':['input'],'policy-review':['hash'],'policy-approve':['hash'],
      project:['input','key'],demand:['input','key'],sprint:['input','key'],task:['input','key','id','transition'],
      plan:['demand','input','key','show'],run:['id','plan','key','wait'],status:['resource','id'],
      approve:['demand','hash','approval','decision','version','key'],pause:['id','version','key'],resume:['id','version','key'],cancel:['id','version','key'],help:[],
      reconcile:['id','version','key','retry-push'],
    }
    if (!Object.hasOwn(allowed, command) || Object.keys(flags).some(flag => !['home','json','help',...allowed[command]].includes(flag))) fail('INVALID_ARGUMENT', 2)
    if (command === 'help' || flags.help) { io.stdout('ioteams: init doctor login policy-propose policy-review policy-approve serve catalog index search project demand sprint task plan run status approve pause resume cancel reconcile\nUse --home <absolute> and --json. API mutations require --key; JSON payload: --input <file|->. See docs/operacao-cli.md.\n'); return 0 }
    const text = (name: string): string => typeof flags[name] === 'string' ? flags[name] as string : fail('MISSING_ARGUMENT', 2)
    const identifier = (name: string) => IdentifierSchema.parse(text(name))
    const home = text('home')
    const version = () => z.number().int().positive().max(Number.MAX_SAFE_INTEGER-1).parse(Number(text('version')))
    const input = async () => {
      const source = text('input')
      let content: string
      if (source === '-') content = await io.stdin()
      else {
        const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        try { const info = await file.stat(); if (!info.isFile() || info.nlink !== 1 || info.size > 1_048_576) fail('INVALID_INPUT', 2); content = await file.readFile('utf8') } finally { await file.close() }
      }
      if (Buffer.byteLength(content) > 1_048_576) fail('INVALID_INPUT', 2)
      try { return JSON.parse(content) as unknown } catch { return fail('INVALID_JSON', 2) }
    }
    let result: unknown, code = 0
    if (command === 'init') {
      await initializeProduct({ home, catalogRoot: text('corpus'), checkoutRoots: [text('corpus'), io.cwd ?? process.cwd()], ...(flags.codex ? {codexExecutable:text('codex')} : {}) }); result = {status:'initialized'}
    } else if (command === 'policy-propose') result=await proposeInitialPolicy(home,await input())
    else if (command === 'policy-review') result=await reviewInitialPolicy(home,text('hash'))
    else if (command === 'policy-approve') result=await approveInitialPolicy(home,text('hash'))
    else if (command === 'serve') {
      await serve(home,text('input'),io.signal,origin=>io.stdout(JSON.stringify({status:'listening',origin})+'\n'))
      return 0
    } else if (command === 'doctor') {
      const report = await doctor(home, io.nativeRunner, io.signal); result = report; code = report.status === 'ready' ? 0 : 1
    } else if (command === 'login') {
      if (json) fail('LOGIN_REQUIRES_NATIVE_OUTPUT', 2)
      result = await login(home, io.nativeRunner, io.signal, flags['device-auth'] === true)
    } else if (command === 'index' || (command === 'catalog' || command === 'search') && flags.offline) {
      result = await offline(home, async config => {
        if (command === 'catalog') return loadCatalog(config.catalogRoot)
        const index = openKnowledge({ directory: join(home,'knowledge'), checkoutRoots: config.checkoutRoots })
        try {
          if (command === 'index') return await indexCatalog(index, {root:config.catalogRoot,commitSha:z.string().regex(/^[a-f0-9]{40}$/).parse(text('sha'))})
          return await searchKnowledge(index, flags.input ? await input() as never : {query:text('query')})
        } finally { index.close() }
      })
    } else {
      const client = await createCliClient(home)
      const request = async (method:'GET'|'POST', path:string, body?:unknown, signal = io.signal, key = typeof flags.key === 'string' ? flags.key : undefined) => {
        const route = resolveRoute(method,path)
        if (method === 'POST') body = route.input.parse(body)
        const output = await client.request(method,path,body,key,signal)
        return route.output.parse(output)
      }
      if (command === 'catalog') result = await request('GET','/api/v1/catalog')
      else if (command === 'search') result = await request('POST','/api/v1/knowledge/search', flags.input ? await input() : {query:text('query')})
      else if (['project','demand','sprint','task'].includes(command)) result = await request('POST',`/api/v1/${command}s${command === 'task' && flags.transition ? `/${identifier('id')}/transition` : ''}`,await input())
      else if (command === 'plan') result = flags.show ? await request('GET',`/api/v1/demands/${identifier('demand')}/proposal`) : await request('POST',`/api/v1/demands/${identifier('demand')}/plan`,await input())
      else if (command === 'status') {
        const resource = typeof flags.resource === 'string' ? flags.resource : 'runs'
        if(resource==='planning')result=await request('GET',`/api/v1/demands/${identifier('id')}/planning`)
        else{
          if (!resources.has(resource)) fail('INVALID_RESOURCE',2)
          result = await request('GET',`/api/v1/${resource}${flags.id ? `/${identifier('id')}${resource === 'runs' ? '/status' : ''}` : ''}`)
        }
      } else if (command === 'approve') {
        if (!!flags.demand === !!flags.approval) fail('INVALID_APPROVAL_TARGET',2)
        if (flags.demand && flags.decision || flags.approval && flags.hash) fail('INVALID_APPROVAL_TARGET',2)
        result = flags.demand ? await request('POST',`/api/v1/demands/${identifier('demand')}/approve`,{expectedVersion:version(),reviewedHash:text('hash')})
          : await request('POST',`/api/v1/approvals/${identifier('approval')}/decide`,{expectedVersion:version(),decision:text('decision')})
      } else if (['pause','resume','cancel'].includes(command)) result = await request('POST',`/api/v1/runs/${identifier('id')}/${command}`,{expectedVersion:version()})
      else if (command === 'reconcile') result = await request('POST',`/api/v1/runs/${identifier('id')}/reconcile`,{expectedVersion:version(),retryPush:flags['retry-push'] === true})
      else if (command === 'run') {
        const id = identifier('id')
        result = await request('POST','/api/v1/runs',{id,planId:identifier('plan')})
        if (flags.wait) {
          try {
            while (true) {
              io.signal?.throwIfAborted()
              result = await request('GET',`/api/v1/runs/${id}/status`)
              const status = (result as {status:string}).status
              if (!['queued','running'].includes(status)) break
              await delay(250,undefined,{signal:io.signal})
            }
          } catch (error) {
            if (!io.signal?.aborted) throw error
            // Stop through the authenticated owner. Client interruption is never proof the server's writer stopped.
            const record = await request('GET',`/api/v1/runs/${id}`,undefined,new AbortController().signal) as {version:number}
            await request('POST',`/api/v1/runs/${id}/pause`,{expectedVersion:record.version},new AbortController().signal,`cli-interrupt-${createHash('sha256').update(text('key')).digest('hex')}`)
            return fail('INTERRUPTED',130)
          }
          const status = (result as {status:string}).status
          if (status !== 'completed') code = status === 'awaiting_approval' || status === 'paused' ? 4 : 1
        }
      } else fail('INVALID_COMMAND',2)
    }
    io.stdout(JSON.stringify(safeOutput(result),null,json ? undefined : 2)+'\n');return code
  } catch(error) {
    const known = error instanceof CliError ? error : error instanceof ZodError ? new CliError('INVALID_REQUEST',2) : io.signal?.aborted ? new CliError('INTERRUPTED',130) : new CliError('OPERATION_FAILED')
    io.stderr(JSON.stringify({error:known.code})+'\n');return known.exitCode
  }
}
