# BRAINSTORM: Mapa Interativo (Fase 1 — Visualização)

> Sessão exploratória para clarear intenção e abordagem antes da captura de requisitos

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | MAPA_FASE1 — Visualização de camadas geográficas |
| **Data** | 2026-06-27 |
| **Autor** | brainstorm-agent |
| **Status** | Pronto para Define |

---

## Ideia Inicial

**Input Bruto:** "mapas + chat com agente de IA" — partindo do PRD em [docs/prd-plataforma-geo.md](../../../docs/prd-plataforma-geo.md). Esta rodada foca **apenas a Fase 1 (mapa)**; o chat (Fase 2) é desenhado depois.

**Contexto Coletado:**
- PRD já maduro (quase um pré-`/design`): visão em 3 fases e várias decisões técnicas já travadas.
- Dados já presentes em [data/](../../../data/): UF, município, bairro (nacional, gpkg), setor censitário (~450k feições, gpkg) e antenas de telefonia (~111k pontos, CSV).
- Repositório novo, sem código-fonte ainda (só dados e docs).

**Contexto Técnico Observado (para o Define):**

| Aspecto | Observação | Implicação |
|---------|------------|------------|
| Local provável do código | `src/` (frontend React/Vite) + `pipeline/` ou `etl/` (Python/uv) | Separar app estático do ETL offline |
| Domínios de KB relevantes | nenhum criado ainda | Candidatos: `maplibre`, `pmtiles-tippecanoe`, `geopandas-etl` (criar via `/create-kb`) |
| Padrões IaC | N/A — dev local, sem infra (RNF-1) | Frontend 100% estático; sem backend em runtime na Fase 1 |

---

## Perguntas de Descoberta & Respostas

| # | Pergunta | Resposta | Impacto |
|---|----------|----------|---------|
| 1 | Escopo desta rodada? | **Só Fase 1 (mapa)** | Sem chat/IA agora; entrega o marco M1. Sem backend em runtime. |
| 2 | Quais camadas no primeiro build? | **Todas** (UF, município, antenas, setor censitário **+ bairro**) | Build já inclui toolchain de tiles (setor e bairro são pesadas). |
| 3 | Stack frontend em volta do MapLibre? | "Decida o melhor" → **React + Vite + TypeScript** | Componentização desde já; melhor base para o painel de chat da Fase 2. |
| 4 | Referência visual/UX? | **Padrão sensato** | Basemap claro (Carto Positron-like), painel lateral de camadas, clique → painel lateral de atributos. |

---

## Inventário de Dados (Amostras)

> Amostras melhoram precisão e servem de fixtures de teste do ETL.

| Tipo | Localização | Contagem | Notas |
|------|-------------|----------|-------|
| UF | `data/uf/BR_UF_2025.shp` | 27 | Shapefile IBGE. Leve → GeoJSON. |
| Município | `data/municipio/BR_Municipios_2025.shp` | ~5.570 | Shapefile IBGE. Colunas: `CD_MUN`, `NM_MUN`, `SIGLA_UF`. Leve → GeoJSON. |
| Bairro | `data/bairro/BR_bairros_CD2022.gpkg` | nacional (moderada) | GeoPackage. Peso **moderado** (não é a camada crítica). → PMTiles. |
| Setor censitário | `data/setor_censitario/BR_setores_CD2022.gpkg` | ~450k | GeoPackage. **Camada mais pesada / ponto de atenção de performance** (M2). → PMTiles. |
| Antenas | `data/antenas/antenas.csv` | ~111.295 | CSV `;`-separado, sem header. Campos observados: id, operadora, UF, município, bairro, endereço, **lat, lon**, código IBGE, tipo, tecnologia (2G–5G), frequência. → PMTiles (pontos). |

**Como serão usadas:**
- Fontes do pipeline ETL (shapefile/gpkg/csv → **GeoParquet canônico** → **PMTiles** para exibição).
- Antenas: CSV precisa de header/parse explícito e construção de geometria a partir de lat/lon.
- Atributos de clique: UF/município (nome, código IBGE, UF); antenas (operadora, tecnologia, frequência).

---

## Abordagens Exploradas

### Abordagem A: Esteira padronizada (GeoParquet canônico → PMTiles uniforme) ⭐ Recomendada e Escolhida

**Descrição:** Pipeline ETL único em Python/uv. **Toda** fonte de entrada (shapefile, gpkg, csv) é convertida **uma vez** para **GeoParquet** (formato canônico/analítico — o mesmo que a Fase 2/DuckDB vai consultar). Para exibição no mapa, **todas** as camadas são geradas como **PMTiles** via `tippecanoe`, servidas como arquivo estático (protocolo `pmtiles://` nativo do MapLibre). Frontend 100% estático (React+Vite+TS+MapLibre), **sem backend em runtime**.

- Entrada heterogênea (shp/gpkg/csv) → **GeoParquet** (1 formato canônico)
- GeoParquet → **PMTiles** (1 formato de exibição, para todas as camadas)

**Prós:**
- **Padronização total:** 1 formato analítico (GeoParquet) + 1 formato de exibição (PMTiles). Acaba com a heterogeneidade shp/gpkg/csv.
- Um único caminho de renderização no MapLibre; regra **sem ramificação por tamanho** → Fase 3 = "roda a esteira" (RF-3.1/3.2).
- GeoParquet já é o formato que a Fase 2 (DuckDB spatial) vai consultar — zero retrabalho.
- Respeita RF-1.5 / M2 (setor censitário com tiles).

**Contras:**
- Primeiro build já carrega o toolchain de tiles (`tippecanoe`).
- `tippecanoe` não lê GeoParquet direto → ETL exporta um feed intermediário (GeoJSONSeq/FlatGeobuf) para alimentar os tiles (detalhe do /design).

**Por que recomendada:** entrega a padronização pedida e a regra única de pipeline que torna a Fase 3 "sem refactor".

---

### Abordagem B: Híbrida (leve=GeoJSON / pesado=PMTiles)

**Descrição:** roteia o formato de exibição pelo peso da fonte — UF/município como GeoJSON, setor/bairro/antenas como PMTiles.
**Prós:** GeoJSON é trivial para camadas minúsculas (atributos completos, styling fácil).
**Contras:** **dois** formatos de exibição e uma ramificação "por tamanho" no pipeline — contraria o objetivo de padronização; cada novo dataset da Fase 3 exige decidir o formato. *(Era a proposta original; descartada após pedido de padronização.)*

---

### Abordagem C: Tudo GeoJSON + simplificação client-side

**Descrição:** dispensar `tippecanoe`; simplificar geometrias pesadas no ETL e servir tudo como GeoJSON.
**Prós:** zero toolchain de tiles.
**Contras:** 450k setores não performam (viola RF-1.5/M2); perde detalhe; não escala. **Não recomendada.**

---

## Abordagem Selecionada

| Atributo | Valor |
|----------|-------|
| **Escolhida** | Abordagem A (revisada) |
| **Confirmação do Usuário** | 2026-06-27 — "Confirmo abordagem A"; refinada após pedido de padronização (GeoParquet canônico + PMTiles uniforme, sem split por tamanho). |
| **Raciocínio** | Padroniza entrada heterogênea (shp/gpkg/csv) em **GeoParquet** e exibição em **PMTiles para todas as camadas**. Pipeline sem ramificação → Fase 3 sem refactor. GeoParquet reaproveitado pela Fase 2 (DuckDB). |

---

## YAGNI — Cortado/Adiado do MVP

| Item | Decisão | Motivo |
|------|---------|--------|
| Backend Python em runtime | ❌ Adiado p/ Fase 2 | Visualização é estática; Python fica só no ETL offline. |
| Auth / multiusuário | ❌ Fora | RNF-3 confirma. |
| Chat / IA (Fase 2) | ❌ Fora desta rodada | Escopo = só mapa. |
| Bairro nacional | ⚠️ Incluído (peso moderado) | PRD §11 marcava como adiável; usuário pediu incluir. **Não** é a camada crítica. |
| Split de formato por tamanho (GeoJSON/PMTiles) | ⚖️ Descartado | Padronização vence: **PMTiles para todas** as camadas, sem ramificação. |
| Clustering client-side de antenas | ⚖️ Substituído por PMTiles | Mantém a esteira única de exibição. |

> **Ponto de atenção de performance:** **setor censitário (~450k)** é a camada crítica — foco de tuning de zoom/simplificação no `tippecanoe` (M2).

---

## Rascunho de Requisitos (para o /define)

**Pipeline / ETL (offline, Python/uv + GeoPandas)**
- `R-1` Converter **toda** fonte (shapefile/gpkg/csv) para **GeoParquet** canônico, uma única vez (formato analítico padrão, reaproveitado na Fase 2/DuckDB).
- `R-2` Gerar **PMTiles** (via `tippecanoe`) para **todas** as camadas de exibição, a partir do GeoParquet (feed intermediário GeoJSONSeq/FlatGeobuf).
- `R-3` Tuning específico do setor censitário (~450k) no `tippecanoe` (níveis de zoom / simplificação) para performance (M2).
- `R-4` Antenas: parsear CSV `;`-separado (sem header), construir geometria de pontos a partir de lat/lon, preservar atributos (operadora, tecnologia, frequência).
- `R-5` Pipeline parametrizável por dataset, **sem ramificação por tamanho**, preparando RF-3.1 (novo dataset = roda a esteira, sem refactor).

**Frontend (React + Vite + TypeScript + MapLibre GL JS, estático)**
- `R-6` Mapa interativo com pan/zoom (RF-1.1) e basemap claro.
- `R-7` Renderizar todas as camadas: UF, município, antenas, setor censitário, bairro (RF-1.2/1.4).
- `R-8` Painel lateral de camadas com **toggle on/off** por camada (RF-1.4).
- `R-9` Carregar todas as camadas como **PMTiles** via protocolo `pmtiles://` (RF-1.5).
- `R-10` Clique em feição → **painel lateral** com atributos (nome, código IBGE, UF; para antenas: operadora/tecnologia/frequência) (RF-1.3).
- `R-11` Layout reserva espaço à direita para o futuro painel de chat (Fase 2).

**Critério de Aceite (M1):** abrir no browser, ver as camadas renderizadas, alternar via toggle, clicar numa feição e ver atributos no painel lateral. Setor censitário renderiza com performance via PMTiles (M2).

---

## Próximo Passo

```bash
/define .claude/sdd/features/BRAINSTORM_MAPA_FASE1.md
```
