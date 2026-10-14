import { expect,it } from 'vitest'
import { realpath,mkdtemp,rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initializeProduct,runCli } from '../../../apps/cli/src/index.js'
import { fixture } from '../knowledge/fixtures.js'
it('indexes only the corpus snapshot and returns verified lexical citations through shared RAG services',async()=>{
  const corpus=await fixture(),root=await realpath(await mkdtemp(join(tmpdir(),'ioteams-t15-index-'))),home=join(root,'product')
  try{
    await initializeProduct({home,catalogRoot:corpus.root,checkoutRoots:[corpus.root]})
    let output='';const io={stdout:(s:string)=>output+=s,stderr:()=>{},stdin:async()=>''}
    expect(await runCli(['index','--home',home,'--sha',corpus.sha,'--json'],io)).toBe(0)
    expect(JSON.parse(output)).toMatchObject({commitSha:corpus.sha,documents:7})
    output='';expect(await runCli(['search','--home',home,'--offline','--query','recuperação','--json'],io)).toBe(0)
    expect(JSON.parse(output)).toMatchObject({status:'evidence',citations:expect.arrayContaining([expect.objectContaining({commitSha:corpus.sha,path:corpus.path})])})
    output='';expect(await runCli(['catalog','--home',home,'--offline','--json'],io)).toBe(0);expect(JSON.parse(output)).toHaveLength(6)
  }finally{await rm(root,{recursive:true,force:true});await corpus.cleanup()}
})
