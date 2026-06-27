# DEFINE: Mapa Interativo (Fase 1 — Visualização)

> Aplicação web estática que renderiza camadas geográficas oficiais do Brasil (UF, município, bairro, setor censitário e antenas) em um mapa interativo, com toggle de camadas e clique → atributos.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | MAPA_FASE1 |
| **Data** | 2026-06-27 |
| **Autor** | define-agent |
| **Status** | ✅ Shipped (2026-06-27) |
| **Clarity Score** | 14/15 |

---

## Problema

A equipe de geomarketing precisa explorar visualmente recortes territoriais do Brasil (município, setor censitário, bairro, UF) e a base de antenas de telefonia, mas hoje isso exige ferramentas GIS pesadas e dados em formatos heterogêneos (shapefile, GeoPackage, CSV). Falta um mapa web simples, rápido e reprodutível onde se escolha um recorte, clique e veja os atributos — sem montar infraestrutura de banco.

---

## Usuários-Alvo

| Usuário | Papel | Dor |
|---------|-------|-----|
| Analista de geomarketing | Explora territórios e antenas para decisões de mercado | Sem ferramenta leve para visualizar/clicar recortes oficiais; depende de GIS desktop |
| Guilherme (autor) | Desenvolvedor/operador solo | Dados crus em 3 formatos diferentes; nenhuma base visual sobre a qual evoluir o chat de IA (Fase 2) |

---

## Objetivos

| Prioridade | Objetivo |
|-----------|----------|
| **MUST** | Pipeline ETL que padroniza toda fonte (shp/gpkg/csv) em **GeoParquet** canônico, uma única vez |
| **MUST** | Gerar **PMTiles** para todas as camadas a partir do GeoParquet |
| **MUST** | Mapa MapLibre estático renderizando as 5 camadas com pan/zoom |
| **MUST** | Toggle on/off por camada |
| **MUST** | Clique em feição → painel lateral com atributos |
| **MUST** | Setor censitário (~450k) renderiza com performance aceitável via PMTiles |
| **SHOULD** | Layout reserva espaço à direita para o futuro painel de chat (Fase 2) |
| **SHOULD** | Pipeline parametrizável por dataset, sem ramificação por tamanho (prepara Fase 3) |
| **COULD** | Estilo visual refinado (cores por camada, legenda) |

---

## Critérios de Sucesso

Resultados mensuráveis:

- [ ] As **5 camadas** (UF, município, bairro, setor censitário, antenas) renderizam no browser a partir de PMTiles
- [ ] **100%** das fontes de entrada convertidas para GeoParquet pelo pipeline (3 formatos de origem → 1 canônico)
- [ ] Toggle liga/desliga cada uma das 5 camadas de forma independente
- [ ] Clique em qualquer feição abre o painel lateral em **< 500 ms** com os atributos corretos
- [ ] Setor censitário navegável (pan/zoom) **sem travamento perceptível** no Mac M4 16GB (interação fluida, sem congelar a aba)
- [ ] Aplicação roda **100% estática** (sem processo de backend em runtime)

---

## Testes de Aceite

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| AT-001 | Conversão canônica (happy path) | Shapefile de município, gpkg de bairro/setor e csv de antenas em `data/` | Executo o pipeline ETL | Cada fonte vira um arquivo **GeoParquet** correspondente |
| AT-002 | Geração de tiles | GeoParquet de cada camada | Executo a etapa de tiles | É gerado um **PMTiles** por camada |
| AT-003 | Render inicial | App buildado e servido como estático | Abro a URL no browser | O mapa carrega com basemap claro e as camadas disponíveis |
| AT-004 | Toggle de camada | Mapa com as 5 camadas | Desligo a camada "setor censitário" no painel | A camada some do mapa; as demais permanecem |
| AT-005 | Clique → atributos (polígono) | Camada de município visível | Clico em um município | Painel lateral mostra `NM_MUN`, `CD_MUN`, `SIGLA_UF` |
| AT-006 | Clique → atributos (ponto) | Camada de antenas visível | Clico em uma antena | Painel lateral mostra operadora, tecnologia, frequência |
| AT-007 | Performance camada pesada | Camada de setor censitário ligada | Faço pan/zoom em região densa (ex.: SP) | Mapa permanece interativo, sem congelar a aba |
| AT-008 | Parse de antenas (edge) | `antenas.csv` `;`-separado sem header | Executo o ETL de antenas | Geometria de pontos é construída de lat/lon e atributos preservados |

---

## Fora de Escopo

Explicitamente **não** incluído nesta feature:

- Chat / agente de IA (Fase 2) — apenas reservamos o espaço de UI à direita
- Backend Python em runtime / API de consulta — Python só no ETL offline
- DuckDB spatial e consultas em linguagem natural (Fase 2)
- Autenticação e multiusuário concorrente (RNF-3)
- Deploy em nuvem / hospedagem (alvo é dev local; deploy fica em aberto — `Q2` do PRD)
- Adição de novos datasets além dos 5 existentes (Fase 3)
- Edição/escrita de dados; o mapa é somente leitura

---

## Restrições

| Tipo | Restrição | Impacto |
|------|-----------|---------|
| Técnica | MapLibre GL JS como lib de mapa (PRD §7) | Define API de camadas/estilo |
| Técnica | GeoParquet canônico; shapefile/gpkg/csv nunca lidos crus em runtime (PRD §7) | ETL converte uma vez; runtime só consome derivados |
| Técnica | PMTiles via `tippecanoe`, servido como arquivo estático | `tippecanoe` não lê GeoParquet direto → feed intermediário (GeoJSONSeq/FlatGeobuf) |
| Técnica | Python via `uv` (obrigatório; nunca pip/venv global) | ETL isolado no ambiente do projeto |
| Recurso | Rodar em dev local no Mac M4 16GB, sem servidor de banco (RNF-1) | Sem backend; tudo in-process/estático |
| Escopo | Frontend React + Vite + TypeScript (decidido no brainstorm) | Componentização prepara o painel de chat da Fase 2 |

---

## Contexto Técnico

> Contexto essencial para a fase de Design — evita arquivos mal posicionados e necessidades de infra ignoradas.

| Aspecto | Valor | Notas |
|---------|-------|-------|
| **Local de Deployment** | `src/` (frontend React/Vite/TS) + `pipeline/` ou `etl/` (Python/uv); saídas em `data/processed/` (GeoParquet) e `public/tiles/` (PMTiles) | Separar app estático do ETL offline; estrutura confirmada no /design |
| **Domínios de KB** | Nenhum criado ainda | Candidatos a criar via `/create-kb`: `maplibre`, `pmtiles-tippecanoe`, `geopandas-etl` |
| **Impacto IaC** | Nenhum | Sem infra; frontend 100% estático, ETL local |

**Por que isso importa:**

- **Local** → o Design usa a estrutura correta (app estático vs. ETL offline)
- **KB** → o Design puxa padrões de MapLibre/PMTiles/GeoPandas (a serem criados)
- **IaC** → sem recursos de infra; evita falso "funciona localmente"

---

## Premissas

| ID | Premissa | Se Errada, Impacto | Validada? |
|----|----------|--------------------|-----------|
| A-001 | `tippecanoe` gera PMTiles do setor censitário (~450k) com performance aceitável no M4 16GB | Precisaria de tile server dedicado ou simplificação mais agressiva | [ ] |
| A-002 | As geometrias (gpkg/shp) estão em CRS conhecido e convertíveis para WGS84/EPSG:4326 para web | ETL precisaria de etapa extra de reprojeção/diagnóstico | [ ] |
| A-003 | `antenas.csv` tem layout estável (`;`, sem header, lat/lon nas mesmas posições) em todas as ~111k linhas | Parser precisaria de detecção/limpeza adicional | [ ] |
| A-004 | MapLibre lê PMTiles via protocolo `pmtiles://` sem servidor de tiles | Precisaria de servidor de tiles, quebrando o "100% estático" | [ ] |
| A-005 | Atributos completos sobrevivem ao `tippecanoe` para o clique (sem feature/attribute dropping nas camadas) | Precisaria ajustar flags de tiles ou fonte de atributos separada | [ ] |

**Nota:** validar A-001 e A-004 antes/durante o Design — são as que mais afetam a arquitetura.

---

## Clarity Score Breakdown

| Elemento | Score (0-3) | Notas |
|----------|-------------|-------|
| Problem | 3 | Dor clara e específica (geomarketing + dados heterogêneos) |
| Users | 3 | Dois perfis identificados com dores |
| Goals | 3 | Priorizados MUST/SHOULD/COULD, alinhados a M1/M2 |
| Success | 2 | Mensuráveis, mas performance do setor é qualitativa ("sem travar") — depende de validação A-001 |
| Scope | 3 | Fronteiras explícitas (Fase 2/3, auth, deploy fora) |
| **Total** | **14/15** | |

**Mínimo para prosseguir: 12/15** ✅

---

## Questões em Aberto

- `Q-A001` Performance real do setor censitário via PMTiles a validar empiricamente no Design/Build (premissa A-001).
- `Q-deploy` Alvo de deploy permanece em aberto (PRD `Q2`) — **fora de escopo** desta fase; não bloqueia.

Nenhuma questão bloqueante para o Design.

---

## Histórico de Revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-06-27 | define-agent | Versão inicial a partir de BRAINSTORM_MAPA_FASE1 |

---

## Próximo Passo

**Pronto para:** `/design .claude/sdd/features/DEFINE_MAPA_FASE1.md`
