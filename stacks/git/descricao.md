---
version: 1
kind: stack
id: git
name: Git
---
# Git

## Propósito

Controlar versões de arquivos e relacionar mudanças a revisões identificáveis. O [tutorial oficial](https://git-scm.com/docs/gittutorial) apresenta o fluxo entre diretório de trabalho, índice e commits, permitindo revisar o que será registrado.

## Funcionalidades

Inspecionar diferenças e histórico, preparar mudanças no índice, criar commits e trabalhar com branches. Remotes permitem trocar objetos e atualizar referências; um commit local e sua publicação são etapas distintas. O [manual de push](https://git-scm.com/docs/git-push) explica destinos, refspecs e rejeições de atualização.

## Vantagens

Para desenvolvimento iterativo, um histórico coerente facilita comparar comportamento e localizar a origem de uma mudança. No ioteams, o SHA vincula plano, revisão e evidências a uma entrega concreta, permitindo conferir se o conteúdo testado corresponde ao conteúdo registrado.

## Desvantagens

Conflitos e histórico divergente exigem interpretação do código; resolver marcadores não prova correção funcional. Commits muito grandes dificultam revisão. Arquivos binários e artefatos gerados podem aumentar o custo de armazenamento sem oferecer diferenças úteis.

## Casos de uso

Entrega de uma correção com testes e documentação, comparação entre revisões e colaboração por branches. Exemplo fictício: revisar um diff de catálogo, validar os links e registrar apenas os arquivos autorizados em um commit.

## Restrições

Git não valida requisitos, não elimina segredos de revisões antigas ao apagar um arquivo e não autentica sozinho a intenção do operador. Por padrão, atualizações de branches por push precisam avançar o histórico; divergências podem ser recusadas. [Regras de atualização](https://git-scm.com/docs/git-push). A stack não concede permissão para publicar, reescrever histórico ou remover trabalho alheio.

## Boas práticas

Conferir checkout, branch, destino e árvore antes de mutações. Revisar o índice e usar commits com propósito único. No fluxo do ioteams, validar a árvore entregue e confirmar o SHA remoto quando a publicação estiver autorizada; em resultado incerto, reconciliar o estado antes de repetir efeitos.

## Referências e vínculos

Fontes consultadas em 14 de outubro de 2026: [tutorial Git](https://git-scm.com/docs/gittutorial) e [git-push](https://git-scm.com/docs/git-push).

Contexto: [Engenharia de Software](../../profissoes/engenharia-de-software/descricao.md), [GitHub Actions](../github-actions/descricao.md) e [conceito de stack](../../docs/conceitos/04-stacks.md).
