# 03 — Organização das profissões

[Visão geral do projeto](../../README.md)

## Agrupador e segundo nível

`profissoes/` é o agrupador das profissões. Os seis diretórios de profissão ficam diretamente abaixo dele, preservando esse segundo nível da arquitetura de domínio. Não há um nível intermediário obrigatório de áreas.

Cada profissão possui `descricao.md` e uma decomposição interna coerente com seu assunto. A organização compartilhada facilita a consulta, enquanto a estrutura específica preserva as diferenças entre os campos de atuação.

## Componentes de conteúdo

| Componente | Conteúdo esperado |
| --- | --- |
| Descrição | Propósito da profissão, seu recorte e sua relação com os profissionais. |
| Papéis | Responsabilidades e formas de atuação, especialmente no Scrum. |
| Disciplinas | Partes de um campo de trabalho, como requisitos, interfaces e validação. |
| Fundamentos | Bases conceituais que sustentam as práticas e decisões. |
| Pilares | Eixos de conhecimento que organizam uma profissão. |
| Dimensões | Perspectivas pelas quais um problema ou campo pode ser analisado. |
| Ciclos | Dinâmicas de formulação, execução, inspeção e evolução próprias do campo. |
| Eventos | Oportunidades estruturadas de colaboração, inspeção e adaptação. |
| Artefatos | Resultados, registros ou objetos de trabalho pertinentes à profissão. |
| Referências | Sínteses e identificação das fontes que sustentam o conteúdo. |

Fundamentos, pilares e dimensões são conceitos relacionados, com funções de explicação e organização. Nesta estrutura inicial, os conteúdos de DevOps e das engenharias são agrupados em `pilares/`; isso não impede que cada texto discuta seus fundamentos e dimensões.

## Estrutura por profissão

| Profissão | Diretórios internos |
| --- | --- |
| Metodologia Ágil Scrum | `papeis/`, `eventos/`, `artefatos/`, `referencias/`. |
| Desenvolvimento de Sistemas | `disciplinas/`, `ciclos/`, `artefatos/`, `referencias/`. |
| DevOps | `pilares/`, `ciclos/`, `artefatos/`, `referencias/`. |
| Engenharia de Software | `pilares/`, `ciclos/`, `artefatos/`, `referencias/`. |
| Engenharia de IA Aplicada | `pilares/`, `ciclos/`, `artefatos/`, `referencias/`. |
| Engenharia de IA Generativa | `pilares/`, `ciclos/`, `artefatos/`, `referencias/`. |

Todas também possuem `descricao.md` diretamente no diretório da profissão. IA Aplicada e IA Generativa compartilham a estrutura, com conteúdos específicos para seus respectivos recortes.

## Referências e autonomia do conteúdo

O texto deve apresentar as informações essenciais para compreender o assunto. As referências complementam a explicação e permitem rastrear sua origem; uma lista de links, isoladamente, não constitui a descrição da profissão.

Quando um fundamento for compartilhado, os documentos podem estabelecer referências entre si. Isso favorece a manutenção de uma definição coerente, sem exigir a repetição integral do mesmo conteúdo em todos os campos.

## Regras de organização

- Usar nomes claros de diretórios e arquivos, em minúsculas e `kebab-case` no domínio.
- Manter a profissão identificável sem depender da equipe que a utiliza.
- Separar conceitos e referências dos registros de execução de uma demanda.
- Explicar ciclos sem presumir uma sequência universal obrigatória de etapas.
- Relacionar artefatos às práticas e responsabilidades que lhes dão sentido.

A árvore de domínio está consolidada no [plano documental](14-plano-documental-e-decisoes-iniciais.md).
