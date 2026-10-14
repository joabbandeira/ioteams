import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import manifest from '../../../packages/codex/protocol/manifest.json' with { type: 'json' }
it('retains the exact generated installed protocol artifacts covered by the manifest',async()=>{
 const root=new URL('../../../packages/codex/protocol/',import.meta.url)
 for(const [path,hash] of Object.entries(manifest.files)) {
  const data=await readFile(fileURLToPath(new URL(path,root)))
  expect(createHash('sha256').update(data).digest('hex'),path).toBe(hash)
 }
 const schema=JSON.parse(await readFile(fileURLToPath(new URL(manifest.retainedSchema,root)),'utf8'))
 expect(schema.definitions.v2.ThreadStartParams.properties).toHaveProperty('permissions')
 expect(schema.definitions.v2.ThreadStartResponse.properties).toHaveProperty('instructionSources')
 expect(schema.definitions.PermissionsRequestApprovalResponse.properties.scope).toBeDefined()
})
