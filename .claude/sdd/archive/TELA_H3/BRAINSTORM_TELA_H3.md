# BRAINSTORM: TELA_H3

> A primeira tela da malha H3: domicílios em apartamento por hexágono, com a
> comparação com casas no clique.

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | TELA_H3 |
| **Data** | 2026-09-07 |
| **Autor** | Codex + Guilherme Ramos |
| **Status** | Pronto para define |

## Ideia inicial

A malha H3 r9 já existe para a concentração urbana de São Paulo e o CNEFE 2022
já trouxe a primeira variável medida nela, mas nenhum dos dois aparece na aplicação.
A tela estreia com uma única tematização: quantidade de domicílios em apartamento
por célula. Casas e total entram no clique; o seletor de variáveis fica para depois.

## Contexto reunido

- `indicadores.censo_h3_r9_celula` contém 68.448 células r9; seis células CNEFE de
  borda não pertencem a ela. O tile usa a união (68.454), e a borda é função pura de
  `h3_r9`, portanto não é guardada no banco.
- `indicadores.cnefe_h3_r9` traz as contagens medidas do CNEFE. `dom_apartamento`
  e `dom_casa` vêm do mesmo recorte de 37 municípios e fecham por município contra
  o Censo 2022.
- A casca só pinta cor sólida ou categoria (`match`). Uma contagem H3 exige
  interpolação contínua e legenda, capacidades universais da casca.
- A regra 7 do ADR-0001 obriga mapa e tool do agente a entrarem juntos. A tool
  identifica a célula pelo índice H3 calculado a partir do ponto, sem guardar
  polígonos no banco.
- O host de tiles é compartilhado e público; só dado universal pode ir para ele.

## Perguntas e respostas da sessão

| # | Pergunta | Resposta do Guilherme | Impacto |
|---|----------|------------------------|---------|
| 1 | Qual é o próximo produto da malha? | A tela H3, não a continuação da carga. | Inclui tile, mapa e agente. |
| 2 | Qual tematização estreia? | Domicílios em apartamento. | Uma escala sequencial fixa, sem seletor. |
| 3 | Haverá mais de um mapa temático agora? | Não; só apartamentos. | Casas ficam no atributo do clique. |

## Amostras e evidências

| Tipo | Local | Evidência |
|------|-------|-----------|
| Malha | `../servidor-dados-gis/docs/censo-h3.md` | 68.448 células r9; área de 0,106 km². |
| Contagens | `../servidor-dados-gis/cargas/cnefe_variaveis.tsv` | `dom_casa` e `dom_apartamento` são variáveis explícitas. |
| Fechamento | `../servidor-dados-gis/docs/cnefe.md` | 8.735.615 domicílios particulares fecham nos 37 municípios. |
| Mapa | `web/src/map/layers.ts` | Padrão atual para `match`, fontes PMTiles e subcamadas. |
| UI | `web/src/panels/LayerPanel.tsx` | Cobertura já é dado da camada; legenda numérica cabe junto dela. |

## Abordagens exploradas

### A. Uma camada contínua de apartamentos, casas no clique — escolhida

Pinta `dom_apartamento` em gradiente sequencial. Cada célula mantém também casas,
total e qualidade da coordenada como atributos consultáveis.

**Por que:** responde à pergunta inaugural sem criar estado de UI, e a mesma área de
cada H3 faz a contagem uma leitura espacial comparável.

### B. Mapa binário de predominância casa/apartamento

Usaria duas cores categóricas conforme o tipo dominante.

**Rejeitada:** apaga magnitude: uma célula com 2 apartamentos contra 1 casa parece
equivalente a outra com 2.000 contra 1.000. Também não exercita a escala numérica
de que as próximas métricas precisam.

### C. Seletor de todas as 17 variáveis do CNEFE

Transformaria o painel numa análise multiindicador já nesta entrega.

**Rejeitada:** abre produto, domínio de escala e cópia de estado antes de a primeira
camada provar a leitura. Entra quando houver uma segunda variável com uso concreto.

## Decisões tomadas

| Decisão | Razão |
|---------|-------|
| Uma escala sequencial para apartamentos | É a pergunta aprovada e preserva magnitude. |
| Casas só no clique | Mantém o mapa simples e dá a comparação necessária. |
| União de 68.454 células entra no tile | Preserva seis células CNEFE de borda; ausência de linha CNEFE é zero medido. |
| Polígono é refeito no pipeline | É função pura de `h3_r9`; persistir cache no banco violaria a regra 6. |
| Cobertura declarada | Fora dos 37 municípios a camada não existe; o painel precisa dizer isso. |

## Fora de escopo (YAGNI)

- seletor de variável, score composto e filtro por valores;
- tematização pelo Censo rateado ou por qualidade de coordenada;
- ranking de células, consulta por área desenhada e geocodificação própria;
- expansão para o Brasil ou mudança da resolução H3.

## Validações da sessão

| Seção | Resultado |
|--------|-----------|
| Plano de produto e publicação | Aprovado pelo Guilherme. |
| Tematização inicial e uma camada única | Confirmado pelo Guilherme. |

## Próximo passo

**Pronto para:** `DEFINE_TELA_H3.md`.
