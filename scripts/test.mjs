import {fileURLToPath} from 'node:url'
import {readdir} from 'node:fs/promises'
const root=fileURLToPath(new URL('..',import.meta.url)),args=process.argv.slice(2)
async function hasTests(directory){
 try{for(const entry of await readdir(directory,{withFileTypes:true})){
  if(entry.isDirectory()&&await hasTests(`${directory}/${entry.name}`))return true
  if(entry.isFile()&&/\.test\.ts$/.test(entry.name))return true
 }}catch(error){if(error.code!=='ENOENT')throw error}
 return false
}
const requested=args.length===1&&['unit','integration'].includes(args[0])?[args[0]]:['unit','integration']
if(!(await Promise.all(requested.map(name=>hasTests(`${root}/tests/${name}`)))).some(Boolean)){
 for(const name of requested)console.error(`${name}: indisponível (nenhum teste implementado).`)
 process.exitCode=2
}
const {discoverTests,partitionTestFiles,runVitest,shardNames}=process.exitCode?{}:await import('./test-runner.ts')
let subsets=['unit','integration'],shard
if(process.exitCode){/* Empty standalone fixture requires no dependency module. */}
else if(args.length===1&&['unit','integration'].includes(args[0]))subsets=[args[0]]
else if(args.length===2&&args[0]==='--shard'&&shardNames.includes(args[1]))shard=args[1]
else if(args.length&&!(args.length===1&&args[0]==='--list-shards')){
 console.error('Uso: npm test; npm run test:unit/test:integration; npm test -- --shard <core|codex|runtime-execution|runtime-policy|server|cli>; --list-shards')
 process.exitCode=2
}
if(!process.exitCode){
 const files=await discoverTests(root,subsets),groups=partitionTestFiles(files)
 if(args[0]==='--list-shards')console.log(JSON.stringify(groups,null,2))
 else{
  const selected=shard?groups[shard]:files
  if(!selected.length){console.error('No tests discovered');process.exitCode=2}
  else{console.error(`Test coverage: ${selected.length}/${files.length} files${shard?`; shard=${shard}`:'; complete suite'}`);process.exitCode=await runVitest(selected,{cwd:root})}
 }
}
