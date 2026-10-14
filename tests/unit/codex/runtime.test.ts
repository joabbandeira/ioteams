import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { initializeRuntimeHome, createCodexHost } from '../../../packages/codex/src/index.js'
const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function root(){const p=await mkdtemp(join(tmpdir(),'ioteams-t10-runtime-'));roots.push(p);return p}
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
