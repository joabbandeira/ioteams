import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bindNativeApprovalAuthority, createCodexHost, initializeRuntimeHome } from '../../../packages/codex/src/index.js'
import { turn } from '../../fixtures/contracts.js'
import { HostTurnInputSchema } from '@ioteams/core'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function setup(kind: string, extra: unknown | ((cwd: string, runtime: string) => unknown), phase?: 'implement' | 'review') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-t15-grants-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const runtimeHome = join(root, 'runtime'), cwd = join(root, 'checkout')
  await mkdir(cwd); await initializeRuntimeHome({ runtimeHome, checkoutRoots: [cwd] })
  await mkdir(join(cwd, 'tests')); await writeFile(join(cwd, 'tests', 'allowed.txt'), 'fixture')
  const authority = phase ? await bindNativeApprovalAuthority({ plan: HostTurnInputSchema.parse(turn).approvedPolicy,
    taskId: 'T01', phase, cwd, runtimeHome, protectedRoots: [join(root, 'personal')], readRoots: [runtimeHome, join(root, 'personal')] }) : undefined
  const params = typeof extra === 'function' ? extra(cwd, runtimeHome) : extra
  const script = join(root, 'server.mjs')
  await writeFile(script, `import {createInterface} from 'node:readline'; import fs from 'node:fs';
if(process.argv.includes('--version')){console.log('codex-cli 0.162.1');process.exit(0)}
const send=m=>console.log(JSON.stringify(m)), result=(id,result)=>send({id,result});
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(!m.method){fs.writeFileSync(process.env.CODEX_HOME+'/reply',JSON.stringify(m));send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}});return}
const p=m.params; switch(m.method){
case 'initialize':result(m.id,{userAgent:'fixture',codexHome:process.env.CODEX_HOME,platformFamily:'unix',platformOs:process.platform});break;
case 'permissionProfile/list':result(m.id,{data:[{id:'p',allowed:true}],nextCursor:null});break;
case 'model/list':result(m.id,{data:[{id:'m',model:'m',displayName:'m',hidden:false}],nextCursor:null});break;
case 'account/read':result(m.id,{account:{type:'chatgpt'},requiresOpenaiAuth:true});break;
case 'thread/start':result(m.id,{thread:{id:'t'},model:'m',cwd:p.cwd,instructionSources:[],activePermissionProfile:{id:'p'},approvalPolicy:'on-request',approvalsReviewer:'user'});break;
case 'turn/start':result(m.id,{turn:{id:'u',status:'inProgress'}});send({id:12,method:${JSON.stringify(kind)},params:{threadId:'t',turnId:'u',itemId:'i',...${JSON.stringify(params)}}});break;
}})`)
  const host = await createCodexHost({ runtimeHome, cwd, runId: 'r', permissionProfile: 'p', model: 'm', executable: process.execPath, executableArgs: [script], approvalAuthority: authority })
  cleanup.push(() => host.dispose())
  return { host, runtimeHome, cwd }
}
it.each([
  ['permissions', { permissions: { network: { enabled: true }, fileSystem: null } }],
  ['permissions', { permissions: { network: null, fileSystem: { read: ['/fixture/runtime/marker'], write: null } } }],
  ['permissions', { permissions: { network: null, fileSystem: { read: ['/fixture/personal/marker'], write: ['/fixture/outside'] } } }],
  ['commandExecution', { command: 'npm test', cwd: '/fixture', additionalPermissions: { network: { enabled: true } } }],
  ['commandExecution', { command: 'npm test', cwd: '/fixture' }],
  ['fileChange', { grantRoot: null }],
])('never positively grants unbound %s approvals', async (kind, extra) => {
  const f = await setup(`item/${kind}/requestApproval`, extra)
  for await (const event of f.host.start(HostTurnInputSchema.parse(turn))) if (event.type === 'approval.requested') {
    await expect(f.host.respondToApproval(event.request.requestId, 'accept')).rejects.toMatchObject({ code: 'NATIVE_APPROVAL_GUARD_REQUIRED' })
    await f.host.respondToApproval(event.request.requestId, 'decline')
  }
  const response = JSON.parse(await readFile(join(f.runtimeHome, 'reply'), 'utf8'))
  expect(response.result).toEqual(kind === 'permissions' ? { permissions: {}, scope: 'turn' } : { decision: 'decline' })
})
it('sends only an exact bounded file permission for its immutable task authority', async () => {
  const f = await setup('item/permissions/requestApproval', (cwd: string) => ({ permissions: { network: null, fileSystem: { read: null, write: [join(cwd, 'tests', 'allowed.txt')] } } }), 'implement')
  for await (const event of f.host.start(HostTurnInputSchema.parse(turn))) if (event.type === 'approval.requested') await f.host.respondToApproval(event.request.requestId, 'accept')
  expect(JSON.parse(await readFile(join(f.runtimeHome, 'reply'), 'utf8')).result).toEqual({ permissions: { fileSystem: { read: null, write: [join(f.cwd, 'tests', 'allowed.txt')] } }, scope: 'turn' })
})
it.each(['runtime', 'personal', 'outside', 'review', 'network', 'command'] as const)('refuses a bound %s expansion before native RPC and preserves cancel', async target => {
  const kind = target === 'command' ? 'commandExecution' : 'permissions'
  const f = await setup(`item/${kind}/requestApproval`, (cwd: string, runtime: string) => target === 'command'
    ? { command: 'npm test', cwd, additionalPermissions: { network: { enabled: true } } }
    : { permissions: { network: target === 'network' ? { enabled: true } : null,
      fileSystem: target === 'network' ? null : { read: target === 'runtime' ? [join(runtime, '.ioteams-runtime.json')] : target === 'personal' ? [join(cwd, '..', 'personal', 'marker')] : null,
        write: target === 'outside' ? [join(cwd, '..', 'outside')] : target === 'review' ? [join(cwd, 'tests', 'allowed.txt')] : null } } }, target === 'review' ? 'review' : 'implement')
  for await (const event of f.host.start(HostTurnInputSchema.parse(turn))) if (event.type === 'approval.requested') {
    await expect(f.host.respondToApproval(event.request.requestId, 'accept')).rejects.toMatchObject({ code: 'UNSUPPORTED_NATIVE_ACCEPT' })
    await f.host.respondToApproval(event.request.requestId, 'cancel')
  }
  expect(JSON.parse(await readFile(join(f.runtimeHome, 'reply'), 'utf8')).result).toEqual(kind === 'permissions' ? { permissions: {}, scope: 'turn' } : { decision: 'cancel' })
})
