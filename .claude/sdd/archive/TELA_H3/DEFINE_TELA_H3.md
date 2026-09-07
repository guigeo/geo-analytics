# DEFINE: TELA_H3

> A malha H3 da concentração urbana de São Paulo entra no mapa como uma escala
> contínua de domicílios em apartamento, com casas e qualidade da medição no clique.

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | TELA_H3 |
| **Data** | 2026-09-07 |
| **Autor** | Codex |
| **Status** | Pronto para design |
| **Clarity Score** | 15/15 |
| **Origem** | `BRAINSTORM_TELA_H3.md` |

## Problema

A malha H3 e as contagens do CNEFE existem no `geodata` local desde 2026-09-06,
mas são invisíveis: não há tile, camada, legenda ou tool. A pessoa não consegue
comparar concentração de apartamentos numa unidade territorial homogênea, e a
aplicação ainda não sabe pintar qualquer valor numérico contínuo.

## Usuários

| Usuário | Papel | Dor |
|---------|-------|-----|
| EB Prime | Prospecção imobiliária | Não enxerga onde a ocupação por apartamentos se concentra. |
| Geo Intelligence | Laboratório da casca | Não consegue validar a malha H3 com dado medido. |
| Agente de IA | Leitura do mapa | Não pode responder sobre uma camada que a pessoa vê. |

## Objetivos

| Prioridade | Objetivo |
|------------|----------|
| **MUST** | PMTiles universal da união de 68.454 células H3 r9, derivando a borda de `h3_r9` no pipeline. |
| **MUST** | Escala sequencial contínua para `dom_apartamento`, com legenda e domínio medido da distribuição. |
| **MUST** | Clique mostra apartamentos, casas, total e a qualidade `NV_GEO_COORD` da contagem. |
| **MUST** | Camada declara que só cobre os 37 municípios da concentração urbana de São Paulo. |
| **MUST** | Tool `h3_no_ponto` devolve a célula e pinta seu destaque. |
| **MUST** | Dados e tile chegam à VPS antes do frontend que os declara. |
| **SHOULD** | Escala legível nos dois temas e sem ruído no zoom nacional. |
| **COULD** | Medir tempo/tamanho do PMTiles para orientar a próxima variável. |

## Critérios de sucesso

- [ ] O tile tem exatamente 68.454 feições e uma `H3_R9` única por feição: 68.448 do
      Censo e seis células CNEFE de borda que precisam ser preservadas.
- [ ] A soma de `DOM_APARTAMENTO` e `DOM_CASA` no tile confere com as respectivas
      linhas de `indicadores.cnefe_h3_r9`; células sem endereço ficam com zero, não
      ausentes.
- [ ] O domínio da escala é medido no dado completo e registrado no catálogo; zero é
      a extremidade clara e o limite superior não esconde valores maiores.
- [ ] A legenda identifica “Domicílios em apartamento” e os dois extremos numéricos.
- [ ] Clique e tool mostram a mesma célula pelo mesmo `H3_R9`.
- [ ] `h3_no_ponto` fora da concentração devolve cobertura limitada, não uma contagem zero.
- [ ] O tile está no `verificar-tiles.sh` e todos os builds de cliente o exigem antes de publicar.

## Testes de aceite

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| AT-001 | Geometria pura | tabelas H3 locais | pipeline gera `h3_domicilios` | 68.454 hexágonos da união, cada um com o próprio índice e sem polígono persistido no banco. |
| AT-002 | Zero não some | célula sem linha CNEFE | tile gerado | aparece com `DOM_APARTAMENTO=0` e `DOM_CASA=0`. |
| AT-003 | Cor contínua | camada ligada | visualiza SP em zoom adequado | células com mais apartamentos usam tom mais intenso; não há `match` categórico. |
| AT-004 | Legenda | camada ligada | abre o grupo no painel | vê título, gradiente e extremos da escala. |
| AT-005 | Clique | célula com apartamentos | clica no hexágono | vê apartamentos, casas, total e qualidade da coordenada. |
| AT-006 | Cobertura | painel | abre a camada | lê que ela vale somente nos 37 municípios do recorte. |
| AT-007 | Agente dentro | ponto na concentração | pergunta sobre domicílios H3 no ponto | recebe a contagem e a célula é destacada. |
| AT-008 | Agente fora | ponto fora do recorte | faz a mesma pergunta | recebe explicação de cobertura limitada, sem destaque. |
| AT-009 | Publicação | host de tiles e dois bundles | roda verificações | `h3_domicilios.pmtiles` responde Range/CORS e os dois clientes iniciam. |

## Fora de escopo

- Seletor de variável ou várias camadas H3.
- Cor por casas, proporção casa/apartamento, Censo estimado, obras ou qualidade de coordenada.
- Ranking, agregação sob desenho e consulta por nome de lugar.
- H3 nacional, resolução diferente de 9, ou alteração das cargas CENSO_H3/CNEFE_H3.

## Restrições

| Tipo | Restrição | Impacto |
|------|-----------|---------|
| Arquitetural | Borda H3 é função do índice | O pipeline a deriva; o banco não ganha cache geométrico. |
| Arquitetural | Dado universal usa host de tiles compartilhado | Publicação atravessa `servidor-dados-gis`, `geo-analytics` e `webgis`. |
| Arquitetural | Regra 7 do ADR | Tool e camada são entregues juntas. |
| Produto | Um mapa temático | Não há seletor nem estado de variável nesta fase. |
| Infra | VPS tem pouco disco | Medir tile e publicar tabelas pequenas antes do bundle. |
| Honestidade | CNEFE mede endereço; Censo H3 é estimado | Esta tela afirma apenas a contagem medida e expõe a qualidade da coordenada. |

## Contexto técnico

| Aspecto | Valor |
|---------|-------|
| **Locais** | `pipeline/`, `web/`, `query/`, `agent/`, `../servidor-dados-gis/scripts/`, `../webgis/scripts/` |
| **KB** | `maplibre`, `pmtiles-tippecanoe`, `geospatial-etl`, `agentes-llm` |
| **IaC** | Nenhum recurso novo; nova tabela replicada, tile e verificações existentes. |

## Premissas

| ID | Premissa | Impacto se errada | Validada? |
|----|----------|-------------------|-----------|
| A-001 | A biblioteca H3 4.x reproduz a borda dos índices já criados | Tile não casa com a célula do agente | A confirmar por amostra e contagem. |
| A-002 | A linha CNEFE ausente significa contagem zero | O tile poderia confundir ausência com zero | Sim: o CNEFE define zero como medido zero. |
| A-003 | Seis células CNEFE fora da malha Censo são borda real da fonte | Descartá-las perde 18 endereços | Sim: publicação local declara a divergência em vez de recusá-la. |
| A-004 | A distribuição permite uma escala legível | Um outlier pode achatar cores | Medida: 0 / p95 216 / p99 820 / máximo 5.524. |
| A-005 | As tabelas derivadas cabem na VPS | Agente não consegue consultar produção | A confirmar por ensaio de publicação e `df`. |

## Clarity Score

| Elemento | Nota | Motivo |
|----------|------|--------|
| Problema | 3 | Dado pronto, superfície ausente e capacidade visual faltante. |
| Usuários | 3 | Uso imobiliário, laboratório e agente identificados. |
| Objetivos | 3 | Entregas de dado, mapa, UI, agente e publicação. |
| Sucesso | 3 | Contagens, comportamento e verificações mensuráveis. |
| Escopo | 3 | Variáveis e expansões futuras explicitamente excluídas. |
| **Total** | **15/15** | |

## Questões em aberto

Nenhuma bloqueia o design. O teto da escala é uma medição de build, não escolha de
produto: o design a registra antes de a configuração entrar no catálogo.

## Próximo passo

**Pronto para:** `DESIGN_TELA_H3.md`.
