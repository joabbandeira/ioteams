import { expect,it } from 'vitest'
import { parseArguments,runCli,safeOutput } from '../../../apps/cli/src/index.js'
it('rejects unknown, duplicate and ambiguous flags without echoing their contents',async()=>{
  for(const args of [['run','--unknown','SECRET'],['run','--id','one','--id','two'],['run','--id'],['run','positional']]) expect(()=>parseArguments(args)).toThrow()
  let error='';expect(await runCli(['status','--home','/fixture','--decision','PRIVATE'],{stdout:()=>{},stderr:s=>error+=s,stdin:async()=>''})).toBe(2)
  expect(error).not.toContain('PRIVATE')
})
it('redacts nested session/auth material and renders terminal controls as JSON data',()=>{
  const value=safeOutput({csrfToken:'secret',data:[{cookie:'secret',details:{password:'secret',message:'Bearer secret sk-abcdefghijk ioteams_session=abcdef\u001b[2J'}}]})
  const text=JSON.stringify(value);expect(text).not.toContain('secret');expect(text).not.toContain('\u001b');expect(text).toContain('REDACTED')
})
