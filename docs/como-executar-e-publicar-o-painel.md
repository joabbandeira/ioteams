# Como executar e publicar o painel ioteams

O painel tem duas superfícies: operação local autenticada e demonstração fictícia. O build padrão gera `painel/dist/index.html` para o servidor local. O arquivo publicado `docs/index.html` é somente o demo, com CSS/JavaScript incorporados; abrir esse arquivo não executa agentes nem acessa dados operacionais.

## Painel operacional local

Use Node.js 24 e npm 11, instale pelo lockfile raiz e compile:

```bash
npm ci
npm run build
```

Prepare o diretório privado do produto, índice e bindings de políticas revisadas conforme [Operação da CLI](operacao-cli.md). Inicie o proprietário único:

```bash
npm run cli -- serve --home /caminho/privado/ioteams --input /caminho/privado/serve.json --json
```

O terminal informa somente a origem loopback. Abra `browser-access.html` dentro desse diretório privado do produto. O arquivo tem modo 0600: use o link para abrir o painel, copie o código e cole no campo **Código de acesso privado**. A troca exige interação no mesmo origin, tem uso único e expira em até dois minutos após iniciar o servidor. O código não aparece em URL, stdout ou localStorage. A sessão do browser é independente da CLI, com cookie HttpOnly/SameSite e CSRF mantido apenas em memória. Se o código expirar, encerre com Ctrl+C, aguarde a liberação dos recursos e reinicie de forma segura. Não apague locks ou arquivos incertos para forçar um novo proprietário.

**Trabalho** lê equipe, sprints e tarefas reais. **Conhecimento** consulta o catálogo e índice local, com citações, linhas, hashes e revisão Git. **Configuração** mostra os bindings confiáveis antes de editar objetivo/requisitos. Repositório, projeto, equipe, slots, branch, remote, checks e escopo são somente leitura e exigem nova revisão na CLI para mudança. Sem binding, a UI informa a lacuna em vez de inventar IDs. A leitura desses limites não cria workspace.

Salve a demanda, declare competências por slot e use **Propor plano**. Os requisitos permanecem locais até essa ação. A demanda fica imutável após a tentativa, inclusive quando há lacunas; para mudar requisitos, crie outro binding/demanda pela CLI. Revise Product Goal, Product Backlog, Sprint Goal, Sprint Backlog, DoD, tarefas, checks e fontes. **Aprovar este hash** vincula o snapshot exato; **Iniciar execução** é uma ação separada e mantém aprovações nativas. **Execuções** mostra estados e solicitações concretas. Registros completos dos eventos Scrum ainda não são expostos pela API; metadata SSE não é apresentada como conteúdo desses eventos.

Falha de rede preserva os campos e permite reconectar leituras. Uma mutação de resultado incerto não é repetida automaticamente: reconcilie pela CLI antes de reenviar. SSE atualiza registros e retoma o cursor; reconexão revalida os dados. Navegação por teclado, temas e viewport estreita usam os mesmos componentes do demo.

A rota `/demo` no servidor local monta somente a simulação, sem cliente operacional. Ela não oferece desfazer, reiniciar ou editar efeitos reais. As opções de hospedagem abaixo se referem exclusivamente ao HTML fictício publicado.

## Obter os arquivos

```bash
git clone https://github.com/joabbandeira/ioteams.git
cd ioteams
```

Também é possível baixar o repositório em **Code → Download ZIP**, extrair os arquivos e abrir a pasta extraída.

## Opção 1: abrir sem instalar dependências

Abra o arquivo `docs/index.html` em um navegador com JavaScript habilitado. Como os recursos da interface estão incorporados ao HTML, não é necessário instalar Node.js para essa opção.

Para servir o arquivo por HTTP, se tiver Python 3 instalado, execute na raiz do repositório:

```bash
python3 -m http.server 3000 --bind 127.0.0.1 --directory docs
```

Abra `http://127.0.0.1:3000/`. Use `Ctrl+C` no terminal para encerrar o servidor.

## Opção 2: executar com Node.js

Requer Node.js 24, com npm 11. Na raiz do repositório:

```bash
cd painel
npm start
```

Abra `http://127.0.0.1:3000/`. Esse comando serve o HTML já compilado e não precisa de `npm ci`.

Se a porta estiver ocupada, em macOS ou Linux:

```bash
PORT=3001 npm start
```

No PowerShell:

```powershell
$env:PORT = "3001"
npm start
```

Nesse caso, abra `http://127.0.0.1:3001/`. Use `Ctrl+C` para encerrar o servidor.

## Alterar e recompilar

Para trabalhar no código-fonte, execute na raiz do repositório com Node.js 24 e npm 11:

```bash
npm ci
npm run typecheck
npm test
npm run docs:check
npm run build
npm run preview
```

O lockfile raiz fixa a instalação de todos os workspaces (`packages/*`, `apps/*` e `painel`). `typecheck` valida os pacotes e o painel; `test` executa os testes unitários e de integração presentes. `docs:check` verifica links locais e a estrutura/relações das entidades declaradas; catálogo e relações são validados pelos mesmos schemas compartilhados.

O build padrão gera `painel/dist/index.html`, ignorado pelo Git. `preview` serve somente os bytes da interface em `http://127.0.0.1:3000/`; para operar com API autenticada, use `serve` conforme acima. Edite [painel/src/panel.tsx](../painel/src/panel.tsx) e suas vistas para a operação, [painel/src/demo.tsx](../painel/src/demo.tsx) para o demo, [painel/src/model.ts](../painel/src/model.ts) para o cenário fictício e [painel/src/styles.css](../painel/src/styles.css) para os estilos. Recompile e recarregue o navegador depois de cada alteração; o servidor não recompila automaticamente.

Também é possível rodar `npm ci` dentro de `painel/`; o npm usa o lockfile do workspace raiz. Os comandos de build/typecheck/preview nesse diretório atuam apenas no painel. O comando `npm start` mantém a prévia do HTML aprovado em `docs/index.html`.

Para instalar o navegador dentro do projeto e executar os testes de interface:

```bash
npm run browser:install
npm run test:e2e
```

O E2E usa API real com SQLite/índice e hosts simulados na porta 4173; cobre sessão, catálogo, configuração, fontes, proposta/aprovação por hash, teclado, tema, narrow viewport, falhas e o demo. Não faz login nem inferência nativa. Requer espaço para Chromium (a instalação completa inicial é estimada em menos de 2 GB adicionais); mantenha pelo menos 5 GB de reserva. `npm ci` reinstala `node_modules`, portanto execute novamente `browser:install` após uma reinstalação. Os comandos `test:unit` e `test:integration` permitem rodar subconjuntos; diretório vazio termina com código 2 e informa indisponibilidade.

Para atualizar deliberadamente o HTML destinado à publicação:

```bash
npm run build:demo
```

Revise o diff de `docs/index.html`. Esse comando também existe no workspace `painel`. Os builds e testes normais preservam o arquivo publicado.

A CI é acionada somente por tags `ci/ioteams-v1-T06-*`, `ci/ioteams-v1-T09-*`, `ci/ioteams-v1-T13-*`, `ci/ioteams-v1-T17-*` e `ci/ioteams-v1-T18-*`. Pushes de branches não iniciam esse workflow. Ele roda os mesmos checks com Chromium e não usa credenciais de modelo, agentes reais ou deploy. A criação e a preservação das tags de marco são responsabilidade do coordenador da entrega.

## Publicar no GitHub Pages

O repositório já contém o HTML pronto em `docs/index.html` e o arquivo `docs/.nojekyll`. Não é necessário criar um workflow de compilação para usar essa opção.

1. Abra [Settings → Pages do repositório](https://github.com/joabbandeira/ioteams/settings/pages), usando uma conta com permissão de administração ou manutenção.
2. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
3. Escolha a branch **main** e a pasta **/docs**.
4. Clique em **Save** e acompanhe a implantação na aba **Actions**.
5. Após a conclusão, use o endereço exibido nas configurações do Pages. Sem domínio personalizado, o endereço esperado para este repositório é `https://joabbandeira.github.io/ioteams/`.

O procedimento segue a [documentação oficial de fontes de publicação do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). A presença dos arquivos no repositório não habilita o Pages por si só.

Para atualizar o painel hospedado, execute `npm run build:demo` e publique o novo `docs/index.html` na branch configurada. Alterações somente em `painel/src/` não atualizam o HTML publicado automaticamente.

## Outra hospedagem estática

Publique o arquivo `docs/index.html` como `index.html` na raiz pública do serviço escolhido. Não há outros recursos de runtime para copiar nem necessidade de configurar redirecionamento de rotas: a aplicação usa uma única página.

Se o serviço pedir um comando de compilação a partir da raiz do repositório, use:

```bash
npm ci
npm run build:demo
```

O diretório de saída para publicação é `docs/`. Ele também contém os documentos conceituais e este guia; caso queira hospedar apenas a interface, publique somente o `index.html` gerado.

## Verificações após colocar no ar

Confirme que o painel abre, alterna entre os temas claro e escuro, exibe os detalhes das pessoas e eventos e permite movimentar tarefas. Ao recarregar a página, o cenário deve voltar aos dados iniciais.

Se o site retornar 404, confira a branch e a pasta de publicação e o resultado da implantação. Se aparecer uma versão antiga, confira se o HTML foi recompilado e publicado. Para erros locais de instalação, verifique a versão do Node.js e se foi usado o lockfile da raiz do workspace.

## Limites do protótipo

As pessoas, tarefas e datas são fictícias. As interações ficam em memória temporária da página; não são compartilhadas entre usuários e não persistem ao recarregar. Hospedar o painel não adiciona execução de agentes ou integração com workflows.

[Código-fonte do painel](../painel/README.md) · [Cenário e recursos](conceitos/12-cenario-e-recursos-do-prototipo.md) · [Visão geral do projeto](../README.md)
