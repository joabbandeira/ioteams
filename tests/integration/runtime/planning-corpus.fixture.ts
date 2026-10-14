import {mkdir,writeFile} from 'node:fs/promises'
import {dirname,join} from 'node:path'
import {metadata} from '../../fixtures/contracts.js'
import {fixtureExecFile} from '../../fixtures/runtime/repository.js'
/** Corpus belonging to the planning fixture root/lifetime, including its Git children. */
export async function planningCorpus(base:string){
 const root=join(base,'corpus'),data=join(base,'corpus-index');await mkdir(root);await mkdir(data)
 const git=async(...args:string[])=>(await fixtureExecFile('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false',...args],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,HOME:root,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}})).stdout.trim()
 const file=async(path:string,content:string)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),content)}
 const commit=async()=>{await git('add','--all');await git('commit','--allow-empty','-qm','Fixture snapshot');return git('rev-parse','HEAD')}
 await git('init','-q')
 for(const entry of metadata){const folder=({profession:'profissoes',stack:'stacks',professional:'profissionais',team:'equipes'} as Record<string,string>)[entry.kind]
  await file(`${folder}/${entry.id}/${entry.kind==='professional'?'perfil':'descricao'}.md`,`---\n${JSON.stringify(entry)}\n---\n# ${entry.name}\nConhecimento de referência.\n`)}
 const path='stacks/git/uso.md',source='# Git\nIntrodução.\n\n## Recuperação\nAção e café: SQLite para recuperação lexical.\nFonte: [SQLite](https://www.sqlite.org/fts5.html).\n'
 await file(path,source);const sha=await commit()
 return {root,data,file,git,commit,path,source,sha}
}
