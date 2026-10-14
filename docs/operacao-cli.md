# Operação da CLI ioteams

A CLI exige Node 24 e as dependências dos workspaces instaladas. Execute
`npm run cli -- help` na raiz do projeto. `npm run build --workspace @ioteams/cli`
valida o workspace TypeScript; o launcher executa o código com `tsx`.

## Inicialização e diagnóstico

Escolha um destino absoluto, privado, fora dos checkouts, corpus e dados pessoais
do Codex/ChatGPT. O diretório pai deve existir. `init` cria somente diretórios e
configuração do produto; não autentica, não copia credenciais e não executa modelo.
Diretórios preexistentes com conteúdo desconhecido e aliases são recusados.

```sh
npm run cli -- init --home /caminho/privado/ioteams --corpus /caminho/corpus --codex /caminho/binario/nativo/codex
npm run cli -- doctor --home /caminho/privado/ioteams --json
npm run cli -- login --home /caminho/privado/ioteams
```

`--codex` identifica o binário nativo canônico, fora dos checkouts. Launchers
JavaScript/shell, symlinks e binários graváveis por terceiros são recusados. O
protocolo está fixado em Codex CLI `0.162.1`; outra versão exige revisão do adapter.
O binário é revalidado antes de cada uso.

`doctor` verifica Node 24, Git, leitura segura do catálogo, reserva de disco de
5 GB, versão/capacidades de CLI e estado nativo de autenticação. Não produz
inferência nem imprime stderr nativo, conteúdo de auth ou caminhos pessoais.
A descoberta de perfis/modelos e a conferência de permissões efetivas continuam
obrigatórias no App Server ao abrir um host. Com servidor/adapter proprietário
ativo, o diagnóstico não toma seu runtime: reporta atenção necessária.

`login` conduz o login nativo pelo navegador no runtime exclusivo, com armazenamento
nativo em arquivo e ambiente separado para HOME, SQLite, temporários e logs.
A interação de autenticação é a saída nativa; `login --json` é recusado.
`login --device-auth` é uma opção explícita para contas que já habilitam esse fluxo;
a CLI não modifica configurações da conta ou armazenamento do sistema. O comando
aguarda o encerramento do processo antes de liberar sua reserva. Não existe
cópia de `auth.json`, Keychain ou configurações pessoais. Login real desta entrega
permanece pendente de revisão do SHA; testes usam runner simulado.

A checagem opcional `node --import tsx scripts/check-codex-lifecycle.ts
/caminho/binario/nativo/codex` faz duas invocações de versão em um runtime novo,
sem login, App Server ou modelo, e remove somente esse diretório descartável.

## Servidor executável

Depois de inicializar e indexar o corpus, inicie o servidor pelo comando:

```sh
npm run cli -- serve --home /caminho/privado/ioteams --input /caminho/privado/serve.json --json
```

Não é necessário escrever código TypeScript de launcher. A configuração é JSON
estrito, em arquivo privado (modo 0600), com este formato:

```json
{
  "version": 1,
  "bindings": [
    {
      "demandId": "demanda-1",
      "policyFile": "/caminho/privado/politicas/envelope.policy.json",
      "approvedHash": "HASH_REVISADO_64_HEX"
    }
  ],
  "searchPath": ["/usr/bin", "/bin", "/caminho/ferramentas-aprovadas"]
}
```

Substitua o hash pelo hash real do envelope já aprovado pelo operador. Cada
`policyFile` é uma política imutável persistida do núcleo, fora dos checkouts,
com hash correspondente; texto do modelo não cria um binding. O corpus deve
constar nessa política. `model` é opcional e deve pertencer ao catálogo descoberto;
`port` é opcional, sempre em loopback. `bindings: []` permite leitura/configuração
inicial, mas não autoriza planejamento/execução. Não há módulos, callbacks,
comandos arbitrários ou adapters fake selecionáveis por flags, ambiente ou JSON.

O launcher adquire a reserva do produto **antes** de abrir os bancos. Compõe os
serviços de planejamento/execução compartilhados, perfis nativos por fase e checks
em homes novos sem auth. Cria um checkout novo a partir da política somente quando
a operação precisa dele; não adota um checkout/lock preexistente após reinício.
Aprovação da proposta persiste a política final em `policies` do produto; execução
usa esse hash e o workspace pertencente à mesma instância. `SIGINT`/`SIGTERM`
aguardam jobs, requests, bancos e leases antes de remover canal e reserva próprios.
O terminal imprime apenas estado/origem local, sem capability, cookie ou CSRF.

## Canal autenticado e proprietário

Os comandos operacionais usam a API v1. Eles não abrem Store, executor ou host
paralelo. O launcher confiável fornece os mesmos serviços e bindings de política
aprovada/workspace da API. Integrações de UI/backend podem usar:

```ts
import { startCliServer } from '@ioteams/cli'

// home foi inicializado; store e services pertencem à composição confiável.
const channel = await startCliServer(home, { store, services })
try {
  // Manter o launcher vivo enquanto CLI/UI utilizam os serviços compartilhados.
  await operatorShutdown
} finally {
  await channel.close()
  // Somente depois fechar Store/índice e liberar os workspaces do chamador.
}
```

`startCliServer` faz bind em loopback e consome a capability de bootstrap dentro
do processo. A sessão/CSRF ficam em `connection.json` privado, sob reserva do
produto; não são argumentos, URLs nem saída de terminal. O arquivo não é aceito
se público, ligado por symlink/hardlink, de outro dono, ou apontando para origem
fora de `http://127.0.0.1:porta`. Redirects são recusados. Um arquivo ou lock
preexistente exige reconciliação pelo proprietário; a CLI não remove reservas
estrangeiras ou inventa prova de término. `close()` aguarda o serviço e só então
retira o canal/reserva. O chamador continua responsável pelos bancos e leases.

Para integrar um servidor já criado, o launcher pode chamar
`publishCliConnection(home, origin, server.bootstrapSecret)` e conservar a função
de liberação até **depois** de `server.close()`. Nunca imprimir a capability.
A CLI não aceita políticas, executáveis ou alegações de posse por HTTP.
A CLI compõe as factories nativas com autoridade imutável; autenticação/smoke reais
permanecem gates posteriores. Recuperação confiável após hard crash fica na T18;
o canal não autoriza recuperar um proprietário incerto.

## Fluxo operacional

Use `--home /caminho/privado/ioteams` em todos os comandos. `--json` entrega um
único valor JSON sem formatação adicional; erros são JSON estático em stderr.
Payloads podem vir de arquivo regular limitado a 1 MiB ou de stdin com `--input -`.
IDs, schemas e versões usam os mesmos contratos da API. Cada efeito exige
`--key` explícita: guarde e reutilize a mesma chave com os mesmos dados para
consultar/repetir uma requisição incerta sem repetir o efeito.

| Comando | Argumentos e resultado |
| --- | --- |
| `project`, `demand`, `sprint` | `--input arquivo.json --key chave`: cria a entidade pelo schema correspondente |
| `catalog` | Lista metadados pelo servidor; `--offline` lê somente o corpus sob reserva exclusiva |
| `index` | `--sha SHA`: indexa o snapshot Git do corpus no índice separado, somente com proprietário offline |
| `search` | `--query texto` ou `--input busca.json`; `--offline` usa o mesmo RAG local sob reserva |
| `plan` | `--demand ID --input planejamento.json --key chave`: propõe plano, sem executar run |
| `plan --show` | `--demand ID`: apresenta proposta, hash, equipe, fontes e artefatos Scrum |
| `approve` de plano | `--demand ID --hash HASH_REVISADO --version V --key chave`: aprova o snapshot exato |
| `task` | `--input tarefa.json --key chave`: deriva tarefa do plano aprovado |
| `task --transition` | `--id ID --input transicao.json --key chave`: transição de preparação permitida pelo núcleo |
| `run` | `--id ID --plan ID --key chave`: inicia no proprietário; `--wait` acompanha até entrega, bloqueio ou ação humana |
| `status` | `--resource projects/demands/plans/sprints/tasks/runs/approvals`, opcional `--id ID`; padrão `runs` |
| `approve` nativo | `--approval ID --decision accept/decline/cancel --version V --key chave`: responde somente à solicitação ativa |
| `reconcile` | `--id RUN --version V --key chave`: reconcilia efeitos já observados sem repetir inferência; `--retry-push` solicita explicitamente nova tentativa de push permitido pelo plano |
| `pause`, `resume`, `cancel` | `--id RUN --version V --key chave`: controla o job proprietário e preserva CAS/estados do núcleo |

O planejamento recebe `{expectedVersion,teamId,requirements}`. A criação de
tarefa recebe `{projectId,planId,taskId,sprintId?}`; uma transição recebe
`{expectedVersion,target,reason?}`. Consulte as entidades com `status` para obter
a versão atual, sem inventar versões ou aprovação. Receber uma proposta não é
aprovar; aprovar plano não é iniciar run. Uma aceitação nativa não amplia o plano.

`run --wait` retorna quando o run aguarda aprovação, para permitir revisar e
responder em outro comando. `SIGINT` durante acompanhamento solicita pausa pelo
mesmo canal autenticado, com a versão atual, e aguarda a resposta do proprietário.
Interromper a CLI não declara que outro escritor acabou. Pausa/retomada não
reexecutam automaticamente tentativas incertas; os guards podem exigir
reconciliação confiável. Nenhum comando aceita uma alegação HTTP/modelo de que
um processo morreu, remove locks ou fabrica confirmação de push.

As saídas escapam controles de terminal e ocultam campos de credencial, cookies,
tokens e material de autenticação, inclusive dados aninhados. Um erro de rede
após efeito pode ser `OUTCOME_UNCERTAIN`: preserve a chave e investigue o estado
no proprietário. Não iniciar outra execução com ID/chave novos às cegas.

| Exit code | Significado |
| --- | --- |
| `0` | Operação solicitada aceita/concluída; `run --wait` exige completed |
| `1` | Falha operacional ou diagnóstico com atenção necessária |
| `2` | Uso, payload ou flags inválidos |
| `3` | Sessão/autenticação/acesso requerido |
| `4` | Conflito, proprietário ocupado, ação humana ou resultado incerto |
| `130` | Interrupção tratada; durante acompanhamento, pausa confirmada pelo proprietário |

## Aprovações e lifecycle nativo

O adapter recusa aceitações sem autoridade confiável imutável vinculada a hash
do plano, tarefa, fase, checkout, runtime e raízes protegidas. A autoridade não
vem do corpus, objetivo, texto do modelo ou de uma decisão de aprovação nativa.
Rede habilitada, grants de diretório/glob/special, paths externos/protegidos e
escrita durante planejamento/revisão são recusados. Apenas arquivos existentes,
canônicos e já dentro dos limites da autoridade podem receber permissões
adicionais de turno. Comandos e file-change não fornecem metadados suficientes
para provar efeito limitado nos schemas instalados: accept continua recusado.
Decline/cancel mantêm suas respostas nativas e uma validação recusada não
consome a solicitação, permitindo ao operador decliná-la.

As factories da CLI vinculam essa autoridade a cada política/tarefa/fase; as
factories de biblioteca do servidor mantêm seu default conservador até integração
própria. Não remover esse guard para fazer uma execução passar.
A validação do runtime só reconhece os helpers próprios em
`tmp/arg0/codex-arg0XXXXXX`, com lock regular, ancestral privado e alvo exato no
binário verificado. `codex-linux-sandbox` só é reconhecido em Linux. Outros links,
alvos adulterados, verificadores forjados e diretórios graváveis por terceiros
continuam recusados; nenhum lock é apagado pela validação.

O fluxo de autenticação segue a [documentação oficial](https://learn.chatgpt.com/docs/auth),
com browser padrão e device auth opcional, sem copiar credenciais entre homes.

## Política inicial sem código de launcher

O envelope inicial é uma proposta do operador. A CLI inspeciona o repositório
real e vincula branch, SHA, remote, paths, checks, ferramentas e corpus; um JSON
existente não é aprovação. Escreva `envelope.json` com o seguinte formato,
substituindo caminhos, SHA e critérios pelos valores realmente revisados:

```json
{
  "plan": {
    "version": 1,
    "id": "plan-1",
    "projectId": "project-1",
    "teamId": "lisa",
    "goal": "Objetivo revisado",
    "branch": "develop",
    "remote": "origin",
    "baseSha": "SHA_BASE_40_HEX",
    "tasks": [{
      "id": "task-1",
      "title": "Entrega delimitada",
      "professionalId": "bia-martins",
      "dependsOn": [],
      "allowedPaths": ["src"],
      "acceptanceCriteria": ["Critério verificável"],
      "checks": [{ "executable": "node", "args": ["--test"], "timeoutMs": 60000 }]
    }],
    "definitionOfDone": ["Checks e revisão aprovados"],
    "limits": { "maxAttempts": 3, "turnTimeoutMs": 1800000 },
    "policyHash": "0000000000000000000000000000000000000000000000000000000000000000"
  },
  "repositoryPath": "/caminho/projeto",
  "workspaceRoot": "/caminho/checkout-novo",
  "trustedInstructions": [],
  "toolReadRoots": ["/caminho/ferramentas-aprovadas"],
  "corpusRoots": ["/caminho/corpus"]
}
```

`baseSha` deve coincidir com `git -C /caminho/projeto rev-parse HEAD`; branch e
remote também precisam coincidir. O checkout deve ser novo e separado da origem.
A raiz real do Node usado pelos checks deve estar em toolReadRoots, sem sobrepor
corpus/checkout/estado. O hash zerado é apenas entrada da proposta: preparePolicy
recalcula o hash de todo o snapshot. Fontes de instrução exigem decisão explícita
e hash; corpus não se transforma em instrução. O envelope não cria escritor,
processo Codex, autenticação ou run.

```sh
npm run cli -- policy-propose --home /caminho/privado/ioteams --input envelope.json --json
npm run cli -- policy-review --home /caminho/privado/ioteams --hash HASH_EXATO --json
npm run cli -- policy-approve --home /caminho/privado/ioteams --hash HASH_EXATO --json
npm run cli -- serve --home /caminho/privado/ioteams --input /caminho/privado/serve.json --json
```

Leia o snapshot completo antes do terceiro comando. A proposta fica em arquivo
privado imutável em `policies/proposals`; somente `policy-approve` é a ação humana
explícita de aprovação do hash exato. Seu resultado fornece `policyFile` e hash
para o binding de `serve`. Hash inválido, tampering, mudança de branch/SHA/remote
ou proprietário offline ocupado são recusados. Não há script TypeScript privado
necessário para preparar esse arquivo. Se o stdout se perder depois de persistir,
repetir explicitamente `policy-approve` confirma somente o arquivo aprovado
idêntico e validado, sem reescrevê-lo; arquivo divergente continua recusado.
Esses comandos locais são vinculados pelo hash, sem chave HTTP adicional.

Depois de iniciar o servidor, crie projeto e demanda pelos comandos existentes,
execute `plan`, acompanhe seu estado e revise/aprove a proposta com seu outro hash.
A aprovação inicial define o envelope; a aprovação de proposta mantém sua própria
vinculação humana e não inicia execução automaticamente.

```sh
npm run cli -- status --home /caminho/privado/ioteams --resource planning --id demanda-1 --json
```

A consulta usa `GET /demands/:id/planning` e mostra draft, planning,
needs_competency com lacunas, proposed, approved ou blocked pelos mesmos serviços.
`plan --show` continua reservado à proposta completa quando disponível.

No shutdown, uma falha verificada no preflight, antes de chamar createWorkspace,
não deixa bancos/canal/reserva do produto abertos. Se a criação já começou e seu
resultado/lease permanece incerto, o launcher fecha os bancos depois de drenar
serviços/requests, agrega falhas de disposal e conserva canal/reserva para
reconciliação; não apaga/adota locks ou declara um escritor terminado.

## Validação completa em shards

`npm test` continua enumerando e executando a suíte inteira. Para o limite de
300 segundos por comando do coordenador, estes seis comandos formam uma partição
completa e disjunta dos arquivos, sem skips ou retries:

```sh
npm test -- --shard core
npm test -- --shard codex
npm test -- --shard runtime-execution
npm test -- --shard runtime-policy
npm test -- --shard server
npm test -- --shard cli
```

`node scripts/test.mjs --list-shards` imprime a enumeração exata, incluindo novos
arquivos. Cada comando aguarda `close` real do Vitest e propaga falha/sinal; não
lança trabalho em background nem altera maxWorkers, limites dos checks ou testes
de concorrência. Não interpretar um único shard verde como conclusão da suíte.
