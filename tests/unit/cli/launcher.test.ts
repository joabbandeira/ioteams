import {afterEach,expect,it} from 'vitest'
import {mkdtemp,mkdir,realpath,rm,access} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {openStore} from '@ioteams/storage'
import {initializeProduct,startCliServer} from '../../../apps/cli/src/index.js'
const cleanups:(()=>Promise<void>)[]=[]
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close()})
it('retains its private channel and product reservation when trusted disposal cannot prove release',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ioteams-t15-uncertain-close-')));cleanups.push(()=>rm(root,{recursive:true,force:true}))
 const corpus=join(root,'corpus');await mkdir(corpus);const home=join(root,'product');await initializeProduct({home,catalogRoot:corpus,checkoutRoots:[corpus]})
 const store=openStore({memory:true});let disposed=0
 const server=await startCliServer(home,async()=>({options:{store,services:{async read(){return []},async execute(){return {}},async close(){}}},async dispose(){disposed++;store.close();throw new Error('fixture uncertain writer')}}))
 await expect(server.close()).rejects.toThrow('fixture uncertain writer');expect(disposed).toBe(1)
 await access(join(home,'connection.json'));await access(join(home,'.ioteams-product-owner.lock'))
 await expect(server.close()).rejects.toThrow('fixture uncertain writer');expect(disposed).toBe(1)
})
