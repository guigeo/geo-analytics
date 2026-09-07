# DEFINE: MOBILE_WEB

> Fazer a aplicação utilizável em celular, mantendo o desktop intacto.

## Problema

A grade atual reserva 268 px para camadas e 340 px para chat, além de um cabeçalho de uma
linha. Em uma tela de celular ela consome toda a largura útil e deixa o mapa sem área.

## Objetivos

| Prioridade | Objetivo |
|---|---|
| MUST | Mapa ocupa a área principal no celular. |
| MUST | Busca, camadas e chat funcionam sem competir pela largura do mapa. |
| MUST | Login e conta continuam utilizáveis em tela pequena. |
| MUST | O desktop conserva a composição e os fluxos atuais. |
| SHOULD | O mapa fica legível com teclado virtual, área segura e rotação. |

## Critérios de aceitação

| ID | Cenário | Resultado esperado |
|---|---|---|
| AT-001 | Abre em 375 px | Mapa visível sem rolagem horizontal. |
| AT-002 | Abre Camadas | Painel sobrepõe o mapa e alterna uma camada. |
| AT-003 | Abre Chat e pergunta | Resposta chega e o destaque aparece no mapa. |
| AT-004 | Busca município/endereço | Mapa focaliza o resultado. |
| AT-005 | Login e conta | Formulários e menu não escapam da viewport. |
| AT-006 | Abre em 1440 px | Grade desktop continua com três colunas. |

## Fora de escopo

- App nativo e publicação nas lojas.
- Mudança em API, agente, PostGIS, tiles ou deploy.
- Criação e edição de desenhos, e medição, por toque nesta primeira entrega.

## Restrições

- Uma composição de build por cliente, como determina o ADR-0001.
- A casca é compartilhada: nenhum `.tsx` conhece o cliente pelo nome.
- A sessão e os desenhos continuam atrás de `/api`; layout não muda autorização.

## Próximo passo

Pronto para `DESIGN_MOBILE_WEB.md`.
