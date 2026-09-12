# BUILD REPORT: Seletor de variável na tela H3

| Atributo | Valor |
|---|---|
| **Feature** | `SELETOR_H3` |
| **Data** | 2026-09-13 |
| **Entrada** | `.claude/sdd/features/DESIGN_SELETOR_H3.md` |
| **Status** | Implementado, verde e validado na tela pelo Guilherme em 2026-09-13 |
| **Testes** | 263 passando (13 novos) · lint limpo · `tsc` limpo · build de produção OK |

---

## O que foi feito

| # | Arquivo | Ação | O que mudou |
|---|---|---|---|
| 1 | `web/src/configuracao/esquema.ts` | Editado | `EsquemaTemaNumerico` (id + rótulo + escala); `temasNumericos` no lugar de `pinturaPorNumero`; validação de lista não vazia, ids únicos e só em polígono |
| 2 | `web/src/configuracao/index.ts` | Editado | Exporta `TemaNumerico` |
| 3 | `web/src/configuracao/catalogo.ts` | Editado | Os três temas do H3 com os tetos medidos (820 / 925 / 1.223) e as três matizes; o rótulo da camada virou "Domicílios por célula (H3)" |
| 4 | `web/src/map/layers.ts` | Editado | `expressaoDeCorNumerica(tema)` e `temaDaCamada(camada, id)` exportadas; a camada nasce com o primeiro tema |
| 5 | `web/src/map/MapView.tsx` | Editado | Prop `temaAtivo` e o efeito que repinta com `setPaintProperty`, via `assimQuePuder` |
| 6 | `web/src/App.tsx` | Editado | `temaInicial`, estado `temaAtivo`, `escolherTema`, repasse nas duas montagens (desktop e mobile) |
| 7 | `web/src/panels/LayerPanel.tsx` | Editado | `SeletorDeTema` (Popover) na linha da camada; `Rampa` reusada por seletor e legenda; `LegendaNumerica` passa a receber o tema ativo |
| 8-11 | `esquema.test.ts`, `layers.test.ts`, `MapView.test.tsx`, `LayerPanel.test.tsx` | Editados | 13 testes novos |

Nenhum arquivo criado, como o DESIGN previa. Nenhuma dependência nova.

---

## Testes novos

| Teste | Cobre |
|---|---|
| Camada nasce pintando o primeiro tema | AT-003, e o acordo entre style e estado inicial |
| Uma camada por malha, e nenhum id com nome de tema | AT-007 |
| Cada tema tem campo, teto e cor próprios na expressão | Critério das três escalas |
| Id de tema inexistente cai no primeiro | Risco de estado velho deixar a camada sem cor |
| Esquema recusa ids repetidos, lista vazia e tema fora de polígono | Fronteira de cliente |
| Seletor aparece com a camada desligada, e a legenda não | AT-004 |
| Legenda nasce no primeiro tema, com 820+ | AT-003 |
| Escolher avisa camada + tema | AT-001 |
| Legenda mostra o tema ativo e o teto dele | AT-001 |
| Camada de tema único não ganha seletor | Zoneamento (pintura por categoria) |
| Repinta com `setPaintProperty` e não chama `fitBounds`, `addSource` nem `setStyle` | AT-002 |

---

## Desvios do DESIGN

**O mapa dublado do `MapView.test.tsx` precisou conhecer as camadas do catálogo.** Ele
só devolvia `getLayer` para ids começados em `desenhos-`; com isso, o efeito de
repintura desistiria calado e o teste ficaria verde sem exercitar nada. O dublê agora
responde também pelas camadas configuradas, e ganhou `setPaintProperty`, `fitBounds` e
`addSource` — os dois últimos existem para o teste poder afirmar que **não** foram
chamados.

**A `Rampa` virou componente do painel.** O seletor e a legenda desenham o mesmo
gradiente; com duas cópias, corrigir a cor num lugar deixaria o outro mentindo.

---

## Suposições do DEFINE

| ID | Situação |
|---|---|
| A-001 — repintura fluida em zoom baixo | **Validada pelo uso:** o Guilherme trocou as variáveis no mapa aberto e não houve travada; não houve medição instrumentada |
| A-002 — tetos medidos | Validada em 2026-09-13, no `geodata` |
| A-003 — 47% de células zeradas aceitas | Decidida no DEFINE; sem mudança de comportamento |
| A-004 — três matizes se distinguem | **Validada pelo uso**, na mesma passada |

---

## O que falta

1. Conferir no tema escuro — a validação foi feita no claro.
2. Deploy: a feature está na `main` e não no ar. Publicar leva o `HEAD` inteiro (§10 do
   ADR-0001), ou seja, leva junto o painel redesenhado e o Raio-X ao cliente 2.
3. `/ship` para arquivar — junto com o Raio-X, que segue em `features/`.

---

## Próximo passo

`/ship`
