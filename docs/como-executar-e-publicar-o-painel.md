# Como executar e publicar o painel LISA

O painel é um site estático. O arquivo `docs/index.html` contém o JavaScript e o CSS necessários à interface, incluindo o modo escuro. Não exige servidor de aplicação, banco de dados, chaves de API ou serviços de IA.

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

Requer Node.js 22 ou superior, com npm. Na raiz do repositório:

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

Para trabalhar no código-fonte, execute em `painel/`:

```bash
npm ci
npm run typecheck
npm run build
npm start
```

`npm ci` instala as dependências nas versões resolvidas pelo lockfile e requer acesso ao registro de pacotes. `typecheck` verifica o TypeScript; `build` gera novamente `docs/index.html`.

Edite [painel/src/app.tsx](../painel/src/app.tsx) para a interface, [painel/src/model.ts](../painel/src/model.ts) para o cenário fictício e [painel/src/styles.css](../painel/src/styles.css) para os estilos. Após cada alteração, execute `npm run build` e recarregue a página. O servidor de pré-visualização não recompila automaticamente.

## Publicar no GitHub Pages

O repositório já contém o HTML pronto em `docs/index.html` e o arquivo `docs/.nojekyll`. Não é necessário criar um workflow de compilação para usar essa opção.

1. Abra [Settings → Pages do repositório](https://github.com/joabbandeira/ioteams/settings/pages), usando uma conta com permissão de administração ou manutenção.
2. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
3. Escolha a branch **main** e a pasta **/docs**.
4. Clique em **Save** e acompanhe a implantação na aba **Actions**.
5. Após a conclusão, use o endereço exibido nas configurações do Pages. Sem domínio personalizado, o endereço esperado para este repositório é `https://joabbandeira.github.io/ioteams/`.

O procedimento segue a [documentação oficial de fontes de publicação do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). A presença dos arquivos no repositório não habilita o Pages por si só.

Para atualizar o painel hospedado, recompile em `painel/` e publique o novo `docs/index.html` na branch configurada. Alterações somente em `painel/src/` não atualizam o HTML publicado automaticamente.

## Outra hospedagem estática

Publique o arquivo `docs/index.html` como `index.html` na raiz pública do serviço escolhido. Não há outros recursos de runtime para copiar nem necessidade de configurar redirecionamento de rotas: a aplicação usa uma única página.

Se o serviço pedir um comando de compilação a partir da raiz do repositório, use:

```bash
npm --prefix painel ci
npm --prefix painel run build
```

O diretório de saída para publicação é `docs/`. Ele também contém os documentos conceituais e este guia; caso queira hospedar apenas a interface, publique somente o `index.html` gerado.

## Verificações após colocar no ar

Confirme que o painel abre, alterna entre os temas claro e escuro, exibe os detalhes das pessoas e eventos e permite movimentar tarefas. Ao recarregar a página, o cenário deve voltar aos dados iniciais.

Se o site retornar 404, confira a branch e a pasta de publicação e o resultado da implantação. Se aparecer uma versão antiga, confira se o HTML foi recompilado e publicado. Para erros locais de instalação, verifique a versão do Node.js e se o comando foi executado em `painel/`.

## Limites do protótipo

As pessoas, tarefas e datas são fictícias. As interações ficam em memória temporária da página; não são compartilhadas entre usuários e não persistem ao recarregar. Hospedar o painel não adiciona execução de agentes ou integração com workflows.

[Código-fonte do painel](../painel/README.md) · [Cenário e recursos](conceitos/12-cenario-e-recursos-do-prototipo.md) · [Visão geral do projeto](../README.md)
