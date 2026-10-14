import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { initializeRuntimeHome, createCodexHost } from '../../../packages/codex/src/index.js'
const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function root(){const p=await realpath(await mkdtemp(join(tmpdir(),'ioteams-t10-runtime-')));roots.push(p);return p}
it('initializes a private owned runtime outside checkout and preserves native auth on reopen',async()=>{
  const p=await root(),runtimeHome=join(p,'runtime');await initializeRuntimeHome({runtimeHome,checkoutRoots:[join(p,'checkout')]})
  expect((await stat(runtimeHome)).mode&0o777).toBe(0o700)
  await writeFile(join(runtimeHome,'auth.json'),'fixture-auth',{mode:0o600})
  await initializeRuntimeHome({runtimeHome,checkoutRoots:[join(p,'checkout')]})
  expect(await readFile(join(runtimeHome,'auth.json'),'utf8')).toBe('fixture-auth')
})
it('rejects personal homes, nested checkout and unowned directories before mutation',async()=>{
  const p=await root();await mkdir(join(p,'unowned'));await writeFile(join(p,'unowned','config.toml'),'fixture')
  for(const runtimeHome of [join(homedir(),'.codex'),join(p,'checkout','runtime'),join(p,'unowned')])
    await expect(initializeRuntimeHome({runtimeHome,checkoutRoots:[join(p,'checkout')]})).rejects.toThrow()
  expect(await readFile(join(p,'unowned','config.toml'),'utf8')).toBe('fixture')
})
it('rejects symlink runtime and symlink auxiliaries without writing through them',async()=>{
  const p=await root();await mkdir(join(p,'target'));await symlink(join(p,'target'),join(p,'link'))
  await expect(initializeRuntimeHome({runtimeHome:join(p,'link'),checkoutRoots:[]})).rejects.toThrow()
  const runtimeHome=join(p,'runtime');await initializeRuntimeHome({runtimeHome,checkoutRoots:[]})
  await mkdir(join(p,'checkout'));await symlink(join(p,'target'),join(runtimeHome,'sqlite','link'))
  await expect(createCodexHost({runtimeHome,cwd:join(p,'checkout'),runId:'r',permissionProfile:'p'})).rejects.toThrow()
})
it('reuses only native helper aliases bound to a verified executable and preserves locks', async () => {
  const { verifyCodexExecutable } = await import('../../../packages/codex/src/executable.js')
  const p = await root(), runtimeHome = join(p, 'runtime'), executable = await verifyCodexExecutable(await import('node:fs/promises').then(fs => fs.realpath(process.execPath)), [])
  const options = { runtimeHome, checkoutRoots: [], nativeExecutable: executable }
  await initializeRuntimeHome(options)
  const helpers = join(runtimeHome, 'tmp', 'arg0', 'codex-arg0ABC123')
  await mkdir(join(helpers, '..'), { recursive: true, mode: 0o700 }); await mkdir(helpers, { mode: 0o755 })
  await writeFile(join(helpers, '.lock'), 'fixture-lock', { mode: 0o600 })
  for (const name of ['apply_patch', 'applypatch', 'codex-execve-wrapper']) await symlink(executable.path, join(helpers, name))
  await initializeRuntimeHome(options); await initializeRuntimeHome(options)
  expect(await readFile(join(helpers, '.lock'), 'utf8')).toBe('fixture-lock')
  await expect(initializeRuntimeHome({ runtimeHome, checkoutRoots: [] })).rejects.toThrow()
  const linuxHelper = join(helpers, 'codex-linux-sandbox'); await symlink(executable.path, linuxHelper)
  if (process.platform === 'linux') await initializeRuntimeHome(options)
  else await expect(initializeRuntimeHome(options)).rejects.toThrow()
  await import('node:fs/promises').then(fs => fs.unlink(linuxHelper))
  await symlink(executable.path, join(helpers, 'unexpected'))
  await expect(initializeRuntimeHome(options)).rejects.toThrow()
})
it('rejects adulterated helper targets, forged verifiers and non-private helper parents', async () => {
  const { verifyCodexExecutable } = await import('../../../packages/codex/src/executable.js')
  const { chmod, copyFile, realpath, unlink } = await import('node:fs/promises')
  const p=await root(),binary=join(p,'native');await copyFile(await realpath('/usr/bin/true'),binary);await chmod(binary,0o700)
  const executable=await verifyCodexExecutable(binary,[]),runtimeHome=join(p,'runtime'),options={runtimeHome,checkoutRoots:[],nativeExecutable:executable}
  await initializeRuntimeHome(options)
  const helpers=join(runtimeHome,'tmp','arg0','codex-arg0ABC123');await mkdir(helpers,{recursive:true,mode:0o700});await writeFile(join(helpers,'.lock'),'owned-lock',{mode:0o600})
  const link=join(helpers,'apply_patch');await symlink(await realpath(process.execPath),link)
  await expect(initializeRuntimeHome(options)).rejects.toThrow();await unlink(link);await symlink(binary,link)
  await chmod(helpers,0o777);await expect(initializeRuntimeHome(options)).rejects.toThrow();await chmod(helpers,0o700)
  await expect(initializeRuntimeHome({...options,nativeExecutable:{path:binary,assertUnchanged:async()=>{}}})).rejects.toThrow()
  await writeFile(binary,'tampered');await expect(initializeRuntimeHome(options)).rejects.toThrow()
  expect(await readFile(join(helpers,'.lock'),'utf8')).toBe('owned-lock')
})
