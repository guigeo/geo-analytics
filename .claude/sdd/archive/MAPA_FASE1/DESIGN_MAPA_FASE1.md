# DESIGN: Mapa Interativo (Fase 1 — Visualização)

> Design técnico para implementar o mapa estático com pipeline ETL padronizado (GeoParquet → PMTiles).

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | MAPA_FASE1 |
| **Date** | 2026-06-27 |
| **Author** | design-agent |
| **DEFINE** | [DEFINE_MAPA_FASE1.md](./DEFINE_MAPA_FASE1.md) |
| **Status** | ✅ Shipped (2026-06-27) |

---

## Achados dos Dados (medidos, fundamentam o design)

| Fonte | Formato | Tamanho | Feições | CRS | Implicação |
|-------|---------|---------|---------|-----|------------|
| UF | Shapefile | 19 MB | 27 | SIRGAS 2000 (EPSG:4674) | Reprojetar p/ 4326 |
| Município | Shapefile | **306 MB** | ~5.570 | SIRGAS 2000 | Pesado p/ memória → streaming |
| Bairro | GeoPackage | 53 MB | nacional | (assumido 4674) | Moderado |
| Setor censitário | GeoPackage | **1.4 GB** | ~450k | (assumido 4674) | **Crítico** — nunca carregar inteiro em RAM |
| Antenas | CSV `;` s/ header | 16 MB | ~111.295 | lon/lat (graus) | Cabe em memória; construir pontos |

> **Consequência:** o ETL pesado usa **GDAL/`ogr2ogr` (streaming)**, não `GeoPandas` em memória (ver Decisão 1).

---

## Architecture Overview

```text
┌──────────────────────────── BUILD-TIME (offline, Python/uv) ────────────────────────────┐
│                                                                                          │
│  data/ (cru)            pipeline/  (geo-pipeline CLI)                  saídas             │
│  ┌──────────┐                                                                            │
│  │ shp/gpkg │──┐   ┌────────────────┐   reproject 4674→4326    ┌──────────────────────┐  │
│  │  /csv    │  ├──▶│ convert (ogr2ogr│──────────────────────▶ │ data/processed/*.parquet│ │
│  └──────────┘  │   │  / pyogrio)     │   (GeoParquet canônico)  └──────────┬───────────┘  │
│                │   └────────────────┘                                     │              │
│  datasets.yaml ┘            │  (CSV→pontos via antennas.py)               │              │
│  (registry)                 ▼                                             ▼              │
│                     ┌────────────────┐   FlatGeobuf/GeoJSONSeq    ┌────────────────┐      │
│                     │ tiles (tippe-  │◀──────────────────────────│  feed por layer │      │
│                     │  canoe)        │──────────────────────────▶│ web/public/tiles│      │
│                     └────────────────┘        *.pmtiles          │   /*.pmtiles    │      │
│                                                                  └────────────────┘      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                              │  (arquivos estáticos)
                                              ▼
┌──────────────────────────── RUN-TIME (browser, 100% estático) ───────────────────────────┐
│   web/ (React + Vite + TS)                                                                │
│   ┌─────────────┐   pmtiles://   ┌──────────────┐    click    ┌───────────────────────┐   │
│   │  MapView    │◀───────────────│ public/tiles │             │  AttributePanel (dir.) │   │
│   │  (MapLibre) │───────────────▶│  *.pmtiles   │────────────▶│  atributos da feição   │   │
│   └─────┬───────┘                └──────────────┘             └───────────────────────┘   │
│         │ toggle                                                                          │
│         ▼                                                          ┌──────────────────┐   │
│   ┌─────────────┐                                                  │ [espaço Fase 2:  │   │
│   │ LayerPanel  │                                                  │  painel de chat] │   │
│   └─────────────┘                                                  └──────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Components

| Componente | Propósito | Tecnologia |
|-----------|-----------|------------|
| `geo-pipeline` (CLI) | Orquestra ETL: convert → tiles, dirigido por `datasets.yaml` | Python 3.11+, uv, Typer/argparse |
| `convert` | Fonte (shp/gpkg) → GeoParquet 4326, streaming | GDAL `ogr2ogr` via subprocess / pyogrio |
| `antennas` | CSV `;` sem header → pontos → GeoParquet | pandas + shapely/pyogrio |
| `tiles` | GeoParquet → feed → PMTiles por camada | `tippecanoe` + `ogr2ogr` (feed FlatGeobuf) |
| `datasets.yaml` | Registry declarativo dos datasets (1 entrada por camada) | YAML |
| `basemap` (build) | Baixa extrato Brasil do Protomaps → `basemap.pmtiles` | `pmtiles` CLI (no container) |
| **Imagem Docker do ETL** | Empacota gdal+tippecanoe+pmtiles+uv; roda o pipeline reproduzível (Mac e VPS) | Docker (base osgeo/gdal, multi-arch) |
| `MapView` | Render MapLibre, basemap Protomaps + protocolo PMTiles, camadas | React, TS, maplibre-gl, pmtiles, protomaps-themes-base |
| `LayerPanel` | Toggle on/off por camada | React |
| `AttributePanel` | Painel lateral direito com atributos do clique | React |

---

## Key Decisions

### Decision 1: GDAL/`ogr2ogr` (streaming) em vez de GeoPandas-in-memory para conversão pesada

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** Setor censitário = 1.4 GB e município = 306 MB. Carregar como `GeoDataFrame` consumiria múltiplos GB de RAM num Mac de 16 GB, com risco de swap/crash (premissa A-001).

**Choice:** Usar **GDAL `ogr2ogr`** (via `subprocess`) como workhorse de conversão e reprojeção. `ogr2ogr` faz streaming feição-a-feição, escreve GeoParquet e reprojeta numa única passada (`-t_srs EPSG:4326`). GeoPandas/pandas só para o CSV de antenas (leve).

**Rationale:** GDAL é battle-tested para arquivos grandes, não estoura memória, e converte + reprojeta + filtra colunas em um comando. Mantém o pipeline previsível no hardware-alvo.

**Alternatives Rejected:**
1. GeoPandas `read_file()` + `to_parquet()` — rejeitado: carrega tudo em RAM (1.4 GB inviável em 16 GB).
2. DuckDB spatial (`ST_Read`/`ST_Transform`) — adiado: ótimo e vem na Fase 2, mas adiciona dependência agora; `ogr2ogr` é mais simples para conversão pura. Reavaliar na Fase 2.

**Consequences:**
- (+) ETL roda no hardware-alvo sem tuning de memória.
- (−) Dependência de binários de sistema (GDAL, tippecanoe) — empacotados em **container Docker** (ver Decisão 7), não instalados na máquina.

---

### Decision 2: Reprojeção SIRGAS 2000 (EPSG:4674) → WGS84 (EPSG:4326) no ETL

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** As fontes IBGE estão em SIRGAS 2000 (graus). MapLibre/PMTiles assumem WGS84 (EPSG:4326).

**Choice:** Reprojetar no passo `convert` (`-t_srs EPSG:4326`). O GeoParquet canônico já fica em 4326.

**Rationale:** SIRGAS 2000 e WGS84 diferem < 1 m — irrelevante para visualização — mas tippecanoe e o protocolo de tiles exigem 4326. Padronizar no canônico evita reprojeção repetida.

**Alternatives Rejected:**
1. Reprojetar só na geração de tiles — rejeitado: deixaria o GeoParquet canônico em CRS divergente do que a Fase 2 espera.

**Consequences:**
- (+) Um CRS único em todo o sistema. (−) Nenhuma relevante.

---

### Decision 3: PMTiles para TODAS as camadas + protocolo `pmtiles://` (sem tile server)

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** Necessidade de "100% estático" (RNF-1) e padronização (decidida no brainstorm).

**Choice:** Toda camada vira `.pmtiles` servido como arquivo estático; MapLibre lê via protocolo `pmtiles://` registrado no cliente (lib `pmtiles`). Vite serve `web/public/tiles/`.

**Rationale:** Um único caminho de render; HTTP range requests dispensam tile server; satisfaz A-004.

**Alternatives Rejected:**
1. Híbrido GeoJSON/PMTiles — descartado no brainstorm (padronização).
2. Tile server (martin/tileserver-gl) — rejeitado: quebra "100% estático".

**Consequences:**
- (+) Deploy = copiar pasta estática. (−) Build de tiles exige tippecanoe local.

---

### Decision 4: Registry declarativo `datasets.yaml` (pipeline sem ramificação por tamanho)

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** RF-3.1 exige "novo dataset = sem refactor". O código não pode ter `if camada == 'setor'`.

**Choice:** Cada dataset é uma entrada declarativa em `datasets.yaml` (source, tipo de geometria, campos de id/atributos, parâmetros de tile como min/maxzoom e simplificação). O CLI itera o registry. Adicionar dataset = adicionar entrada YAML.

**Rationale:** Move a variação para configuração, não código. O tuning do setor (zoom/simplificação) vira parâmetro, não exceção no código.

**Alternatives Rejected:**
1. Funções hardcoded por camada — rejeitado: viola RF-3.1.

**Consequences:**
- (+) Fase 3 trivial. (−) Schema de config a manter/validar (Pydantic).

---

### Decision 5: Monorepo poliglota — `pipeline/` (uv) + `web/` (Vite), separados

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** Python (ETL) e TypeScript (frontend) coexistem. O DEFINE indicou `src/` (frontend) + `pipeline/`.

**Choice:** Dois subprojetos isolados na raiz: `pipeline/` (projeto uv com seu `pyproject.toml`) e `web/` (projeto Vite com seu `package.json`). Refina o placeholder `src/` do DEFINE para `web/` (mais claro em repo poliglota).

**Rationale:** Toolchains não se misturam; cada um com seu lockfile. PMTiles gerados pelo pipeline são escritos em `web/public/tiles/`.

**Alternatives Rejected:**
1. Tudo em `src/` — rejeitado: mistura ecossistemas.

**Consequences:**
- (+) Limites claros. (−) Dois ambientes para instalar (documentar).

---

### Decision 6: Atributos nos tiles — projetar (seleção de colunas) por camada

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** O clique precisa de atributos (A-005), mas carregar todas as colunas do setor (~450k) infla os tiles.

**Choice:** `datasets.yaml` lista os `attributes` a preservar por camada. `ogr2ogr`/tippecanoe mantêm só esses campos. Tippecanoe roda sem drop de feições nas camadas-chave (`--no-feature-limit --no-tile-size-limit` onde necessário, com simplificação por zoom).

**Rationale:** Tiles enxutos + atributos suficientes para o painel. Evita "sumiço" de feições por limite de tamanho de tile.

**Alternatives Rejected:**
1. Manter todas as colunas — rejeitado: tiles grandes, render lento.

**Consequences:**
- (+) Tiles menores e clique funcional. (−) Atributos extras exigem rebuild dos tiles.

---

### Decision 7: Executar o ETL em container Docker (gdal + tippecanoe + pmtiles + uv)

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** O ETL depende de binários de sistema (GDAL, tippecanoe, pmtiles CLI). Instalá-los via Homebrew "suja" a máquina; o usuário já usa Docker e planeja deploy futuro em **VPS**.

**Choice:** Empacotar o ETL numa imagem Docker (base `osgeo/gdal` multi-arch + tippecanoe compilado + binário `pmtiles` + `uv` + código do pipeline). Rodar via `docker compose run pipeline build`. O repositório é montado como volume; saídas (`data/processed/`, `web/public/tiles/`) caem direto no host. **Só o ETL** é containerizado; o frontend (Vite/npm) roda nativo.

**Rationale:** Máquina limpa (zero `brew install`), versões fixadas/reprodutíveis, e a **mesma imagem roda no Mac e no VPS** — alinhado ao alvo de deploy futuro. Build é batch ocasional, então o overhead de I/O do bind mount no arquivo de 1.4 GB é tolerável.

**Alternatives Rejected:**
1. Homebrew (gdal+tippecanoe na máquina) — rejeitado: instala global; usuário prefere Docker.
2. Dockerizar também o frontend — rejeitado: dev server do mapa não ganha nada com container; perde hot-reload nativo.

**Consequences:**
- (+) Reprodutível e portável (Mac↔VPS); nada instalado no host além de Docker.
- (−) I/O mais lento no setor de 1.4 GB via bind mount; manter um Dockerfile; garantir RAM/disco na VM do Docker.

---

### Decision 8: Basemap Protomaps auto-hospedado (PMTiles), desde o M1

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** O mapa precisa de um fundo (ruas/cidades) para orientação, sem quebrar o princípio "100% estático / sem chamadas externas em runtime".

**Choice:** Usar o basemap **Protomaps** como `basemap.pmtiles` auto-hospedado: um passo de build baixa um **extrato do Brasil** (via `pmtiles extract`, sem chave de API) para `web/public/tiles/basemap.pmtiles`. O frontend estiliza com `protomaps-themes-base` (tema claro) sobre o mesmo protocolo `pmtiles://` das camadas de dados.

**Rationale:** Mesmo padrão `pmtiles://` já usado — consistência total; sem API key, sem chamada externa em runtime; serve estático no VPS com range requests, igual às camadas de dados.

**Alternatives Rejected:**
1. Provider hospedado (Carto/MapTiler) — rejeitado: exige chave e chamada externa em runtime.
2. Fundo neutro sem basemap — rejeitado pelo usuário: quer o basemap desde o M1.
3. MapLibre demo style — rejeitado: servidor demo, não confiável para deploy.

**Consequences:**
- (+) Offline/estático de ponta a ponta; orientação visual no M1. (−) `basemap.pmtiles` adiciona tamanho ao deploy (extrato Brasil); um passo extra de build.

---

> ### Alvo de Deploy (futuro — registrado, fora do escopo do build do MVP)
>
> Deploy planejado em **VPS** (substitui o `Q2` em aberto do PRD). A arquitetura já é compatível: frontend `vite build` → estático atrás de **nginx/Caddy**; tiles `.pmtiles` (incl. setor + basemap) servidos como arquivos estáticos via **HTTP range requests** (suporte nativo do nginx/Caddy); ETL roda a mesma imagem Docker no VPS. **Pontos de atenção:** (1) tamanho/banda dos tiles do setor + extrato Protomaps — mitigado por `--drop-densest-as-needed` e tuning de zoom; (2) garantir range requests habilitados. Nenhum artefato de deploy entra no manifesto desta fase.

---

## File Manifest

| # | File | Action | Purpose | Agent | Deps |
|---|------|--------|---------|-------|------|
| 1 | `pipeline/pyproject.toml` | Create | Projeto uv (deps: pyogrio, pandas, shapely, pydantic, typer, pyyaml) | @python-developer | None |
| 2 | `pipeline/datasets.yaml` | Create | Registry declarativo dos 5 datasets | @ai-data-engineer | None |
| 3 | `pipeline/src/geo_pipeline/config.py` | Create | Carrega/valida `datasets.yaml` (Pydantic v2) | @python-developer | 2 |
| 4 | `pipeline/src/geo_pipeline/convert.py` | Create | Fonte → GeoParquet 4326 via ogr2ogr (streaming) | @ai-data-engineer | 3 |
| 5 | `pipeline/src/geo_pipeline/antennas.py` | Create | CSV `;` s/ header → pontos → GeoParquet | @python-developer | 3 |
| 6 | `pipeline/src/geo_pipeline/tiles.py` | Create | GeoParquet → feed → PMTiles (tippecanoe) | @ai-data-engineer | 4,5 |
| 7 | `pipeline/src/geo_pipeline/basemap.py` | Create | Baixa extrato Brasil do Protomaps → `basemap.pmtiles` (pmtiles CLI) | @ai-data-engineer | 3 |
| 8 | `pipeline/src/geo_pipeline/cli.py` | Create | CLI `geo-pipeline build [--only NAME] [--basemap]` | @python-developer | 4,5,6,7 |
| 9 | `pipeline/tests/test_config.py` | Create | Valida parsing do registry | @test-generator | 3 |
| 10 | `pipeline/tests/test_antennas.py` | Create | Valida parse/geom de antenas (fixture pequena) | @test-generator | 5 |
| 11 | `pipeline/Dockerfile` | Create | Imagem ETL: osgeo/gdal + tippecanoe + pmtiles CLI + uv | @ai-data-engineer | 8 |
| 12 | `docker-compose.yml` | Create | Serviço `pipeline` com volume do repo; `compose run pipeline build` | @ai-data-engineer | 11 |
| 13 | `pipeline/.dockerignore` | Create | Exclui `.venv`, dados crus pesados do contexto de build | @ai-data-engineer | 11 |
| 14 | `pipeline/README.md` | Create | Uso via Docker (`compose run pipeline build`) + pré-reqs | @code-documenter | 8,12 |
| 15 | `web/package.json` | Create | Projeto Vite (maplibre-gl, pmtiles, protomaps-themes-base, react, typescript) | @frontend-developer | None |
| 16 | `web/vite.config.ts` | Create | Config Vite | @frontend-developer | 15 |
| 17 | `web/index.html` | Create | Root HTML | @frontend-developer | 15 |
| 18 | `web/src/main.tsx` | Create | Bootstrap React | @frontend-developer | 15 |
| 19 | `web/src/App.tsx` | Create | Layout: mapa + painéis (espaço chat reservado) | @frontend-developer | 18 |
| 20 | `web/src/lib/pmtiles.ts` | Create | Registra protocolo `pmtiles://` no MapLibre | @frontend-developer | 15 |
| 21 | `web/src/map/basemap.ts` | Create | Source + layers do basemap Protomaps (protomaps-themes-base) | @frontend-developer | 20 |
| 22 | `web/src/map/layers.ts` | Create | Config das 5 camadas (id, source, style, campos) | @frontend-developer | 20 |
| 23 | `web/src/map/MapView.tsx` | Create | Componente MapLibre (basemap + camadas) + handler de clique | @frontend-developer | 20,21,22 |
| 24 | `web/src/panels/LayerPanel.tsx` | Create | Toggle on/off por camada | @frontend-developer | 23 |
| 25 | `web/src/panels/AttributePanel.tsx` | Create | Painel lateral de atributos | @frontend-developer | 23 |
| 26 | `web/src/styles.css` | Create | Layout (mapa + sidebars) | @frontend-developer | 19 |
| 27 | `web/README.md` | Create | Setup/dev/build do frontend | @code-documenter | 23 |

**Total Files:** 27

> **Fora do manifesto (deferido):** artefatos de deploy do VPS (Caddyfile/nginx, compose de produção) — registrados como alvo futuro, não construídos nesta fase.

---

## Agent Assignment Rationale

| Agent | Files | Why |
|-------|-------|-----|
| @ai-data-engineer | 2,4,6,7,11,12,13 | Pipelines de dados, GDAL, tiles, basemap, Docker — coração do ETL geoespacial |
| @python-developer | 1,3,5,8 | Código Python limpo, Pydantic, CLI, parsing |
| @frontend-developer | 15–26 | MapLibre, React/TS, basemap, camadas e painéis |
| @test-generator | 9,10 | pytest + fixtures |
| @code-documenter | 14,27 | READMEs com pré-requisitos e uso via Docker |

---

## Code Patterns

### Pattern 1: Conversão streaming fonte → GeoParquet 4326 (ogr2ogr)

```python
# convert.py — não carrega o arquivo em memória; ogr2ogr streama.
import subprocess
from pathlib import Path

def to_geoparquet(src: Path, dst: Path, attributes: list[str], src_layer: str | None = None) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    select = ",".join(attributes)
    cmd = [
        "ogr2ogr",
        "-f", "Parquet",
        "-t_srs", "EPSG:4326",          # reprojeta SIRGAS 2000 → WGS84
        "-select", select,               # projeta só colunas necessárias (Decisão 6)
        "-lco", "GEOMETRY_ENCODING=GEOARROW",
        str(dst), str(src),
    ]
    if src_layer:                        # gpkg multi-layer
        cmd += [src_layer]
    subprocess.run(cmd, check=True)
```

### Pattern 2: Antenas CSV (`;`, sem header) → pontos → GeoParquet

```python
# antennas.py — ordem das colunas observada na amostra real do CSV.
import pandas as pd
import geopandas as gpd

COLS = ["id","operadora","uf","municipio","bairro","endereco",
        "lat","lon","cod_ibge","tipo","tecnologia","frequencia"]

def antennas_to_geoparquet(src, dst, keep):
    df = pd.read_csv(src, sep=";", header=None, names=COLS,
                     dtype=str).dropna(subset=["lat","lon"])
    df["lat"] = df["lat"].astype(float); df["lon"] = df["lon"].astype(float)
    gdf = gpd.GeoDataFrame(df[keep], geometry=gpd.points_from_xy(df.lon, df.lat),
                           crs="EPSG:4326")
    gdf.to_parquet(dst, index=False)
```

### Pattern 3: GeoParquet → PMTiles (tippecanoe, tuning por zoom)

```python
# tiles.py — feed via FlatGeobuf (streaming) evita GeoJSON gigante em disco.
import subprocess
from pathlib import Path

def build_pmtiles(parquet: Path, out: Path, layer: str, minzoom: int, maxzoom: int) -> None:
    fgb = out.with_suffix(".fgb")
    subprocess.run(["ogr2ogr","-f","FlatGeobuf",str(fgb),str(parquet)], check=True)
    subprocess.run([
        "tippecanoe","-o",str(out),"-l",layer,
        f"--minimum-zoom={minzoom}", f"--maximum-zoom={maxzoom}",
        "--drop-densest-as-needed",          # camadas pesadas (setor)
        "--simplification=10",
        "--no-tile-size-limit","--force",
        str(fgb),
    ], check=True)
    fgb.unlink(missing_ok=True)
```

### Pattern 4: Registrar protocolo PMTiles no MapLibre (TS)

```ts
// lib/pmtiles.ts
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

export function registerPMTiles() {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}
```

### Pattern 5: Camadas declarativas + clique → atributos (TS)

```ts
// layers.ts
export interface LayerDef {
  id: string; label: string; sourceUrl: string; sourceLayer: string;
  type: "fill" | "line" | "circle"; attributes: string[];
}
export const LAYERS: LayerDef[] = [
  { id:"uf", label:"UF", sourceUrl:"pmtiles:///tiles/uf.pmtiles",
    sourceLayer:"uf", type:"line", attributes:["NM_UF","SIGLA_UF","CD_UF"] },
  { id:"municipio", label:"Município", sourceUrl:"pmtiles:///tiles/municipio.pmtiles",
    sourceLayer:"municipio", type:"fill", attributes:["NM_MUN","CD_MUN","SIGLA_UF"] },
  { id:"antenas", label:"Antenas", sourceUrl:"pmtiles:///tiles/antenas.pmtiles",
    sourceLayer:"antenas", type:"circle", attributes:["operadora","tecnologia","frequencia"] },
  // bairro, setor: análogos
];

// MapView.tsx — clique abre o painel lateral
map.on("click", (e) => {
  const ids = LAYERS.filter(l => visible[l.id]).map(l => l.id);
  const f = map.queryRenderedFeatures(e.point, { layers: ids })[0];
  if (f) setSelected({ layer: f.layer.id, props: f.properties });
});
```

### Pattern 6: Estrutura do `datasets.yaml`

```yaml
datasets:
  - name: uf
    source: ../data/uf/BR_UF_2025.shp
    geometry: polygon
    attributes: [NM_UF, SIGLA_UF, CD_UF]
    tile: { minzoom: 0, maxzoom: 8 }
  - name: municipio
    source: ../data/municipio/BR_Municipios_2025.shp
    geometry: polygon
    attributes: [NM_MUN, CD_MUN, SIGLA_UF]
    tile: { minzoom: 0, maxzoom: 10 }
  - name: setor
    source: ../data/setor_censitario/BR_setores_CD2022.gpkg
    layer: BR_setores_CD2022
    geometry: polygon
    attributes: [CD_SETOR, CD_MUN, NM_MUN]
    tile: { minzoom: 6, maxzoom: 14, simplification: 10 }   # tuning camada crítica
  - name: antenas
    source: ../data/antenas/antenas.csv
    format: csv_points
    lon_field: lon
    lat_field: lat
    attributes: [operadora, uf, municipio, tecnologia, frequencia]
    tile: { minzoom: 4, maxzoom: 14 }
  # bairro: análogo

basemap:
  source: protomaps          # extrato Brasil via `pmtiles extract`
  bbox: [-74.0, -34.0, -34.0, 6.0]   # lon_min, lat_min, lon_max, lat_max
  out: basemap.pmtiles
```

### Pattern 7: Dockerfile do ETL (gdal + tippecanoe + pmtiles + uv)

```dockerfile
# pipeline/Dockerfile — imagem multi-arch para Mac (arm64) e VPS (amd64)
FROM ghcr.io/osgeo/gdal:ubuntu-small-latest
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential git libsqlite3-dev zlib1g-dev curl ca-certificates \
 && git clone https://github.com/felt/tippecanoe.git /tmp/t \
 && make -C /tmp/t -j && make -C /tmp/t install && rm -rf /tmp/t \
 && curl -L https://github.com/protomaps/go-pmtiles/releases/latest/download/pmtiles_$(uname -m).tar.gz \
      | tar -xz -C /usr/local/bin pmtiles \
 && apt-get purge -y build-essential git && apt-get autoremove -y
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /repo/pipeline
ENTRYPOINT ["uv", "run", "geo-pipeline"]
```

```yaml
# docker-compose.yml — repo montado; saídas caem no host
services:
  pipeline:
    build: { context: ., dockerfile: pipeline/Dockerfile }
    volumes: [ ".:/repo" ]
    working_dir: /repo/pipeline
# uso: docker compose run --rm pipeline build
```

### Pattern 8: Basemap Protomaps no MapLibre (TS)

```ts
// map/basemap.ts
import layers from "protomaps-themes-base";   // gera os layers do schema Protomaps

export const BASEMAP_SOURCE = {
  basemap: { type: "vector", url: "pmtiles:///tiles/basemap.pmtiles" },
} as const;

// tema claro; "basemap" é o nome do source acima
export const basemapLayers = layers("basemap", "light");
// no estilo do mapa: { sources: { ...BASEMAP_SOURCE, ...dataSources }, layers: [...basemapLayers, ...dataLayers] }
```

---

## Data Flow

```text
1. `docker compose run --rm pipeline build`  (itera datasets.yaml, dentro do container)
   │
   ▼
2. convert: shp/gpkg → ogr2ogr (reproj 4326, select cols) → data/processed/<name>.parquet
   antennas: csv → pontos → data/processed/antenas.parquet
   │
   ▼
3. tiles: parquet → FlatGeobuf → tippecanoe → web/public/tiles/<name>.pmtiles
   basemap: pmtiles extract (Protomaps, bbox Brasil) → web/public/tiles/basemap.pmtiles
   │   (saídas caem no host via bind mount)
   ▼
4. `npm run dev` (web, nativo): MapLibre registra pmtiles://, monta basemap Protomaps + as 5 camadas
   │
   ▼
5. Usuário: toggle (LayerPanel) / clique → queryRenderedFeatures → AttributePanel
```

---

## Integration Points

| Sistema externo | Tipo | Auth |
|-----------------|------|------|
| GDAL (`ogr2ogr`) | CLI dentro do container Docker (subprocess) | N/A |
| `tippecanoe` | CLI dentro do container Docker (subprocess) | N/A |
| `pmtiles` CLI | CLI dentro do container (extrai basemap Protomaps) | N/A |
| Protomaps (extrato Brasil) | Download **1x no build** (`pmtiles extract`); em runtime é estático | Sem chave |

---

## Testing Strategy

| Tipo | Escopo | Arquivos | Ferramentas | Meta |
|------|--------|----------|-------------|------|
| Unit | Parse de config e antenas | `test_config.py`, `test_antennas.py` | pytest | Caminhos-chave |
| Integration (ETL) | 1 dataset pequeno (UF) ponta-a-ponta → parquet → pmtiles | manual/script | pytest + CLIs | UF gera `.pmtiles` |
| E2E (manual) | AT-003..AT-007 no browser | — | navegador | Happy path |

> Datasets pesados (setor) **não** entram em CI — validação manual de performance (AT-007) no M4.

---

## Error Handling

| Erro | Estratégia | Retry? |
|------|-----------|--------|
| `ogr2ogr`/`tippecanoe`/`pmtiles` ausente | Falhar cedo no CLI com mensagem clara (rodar via `docker compose run pipeline`) | Não |
| Extrato Protomaps indisponível (rede) | Abortar passo de basemap com erro claro; camadas de dados não dependem dele | Sim (1x) |
| CRS de origem desconhecido/ausente | Logar e abortar dataset; `-s_srs` explícito como fallback no YAML | Não |
| Linha de antena com lat/lon inválido | Dropar linha, contar e logar quantidade descartada | Não |
| Tile excede limite de tamanho | `--drop-densest-as-needed` / ajustar zoom no YAML | Não |
| PMTiles 404 no browser | Erro no console + camada marcada indisponível no LayerPanel | Não |

---

## Configuration

| Config Key | Type | Default | Descrição |
|------------|------|---------|-----------|
| `datasets[].source` | string | — | Caminho da fonte crua |
| `datasets[].attributes` | list | — | Colunas preservadas nos tiles |
| `datasets[].tile.minzoom` | int | 0 | Zoom mínimo dos tiles |
| `datasets[].tile.maxzoom` | int | 14 | Zoom máximo dos tiles |
| `datasets[].tile.simplification` | int | none | Simplificação (camadas pesadas) |
| `output.processed_dir` | string | `data/processed` | Saída GeoParquet |
| `output.tiles_dir` | string | `web/public/tiles` | Saída PMTiles |

---

## Security Considerations

- Dados públicos (IBGE/antenas); sem PII sensível — antenas são infraestrutura, não pessoas.
- Sem backend/auth no MVP (RNF-3); superfície de ataque = arquivos estáticos.
- `subprocess` com lista de args fixa (sem `shell=True`) — evita injeção via caminhos.
- Validar caminhos do `datasets.yaml` para não escapar do repositório.

---

## Observability

| Aspecto | Implementação |
|---------|---------------|
| Logging | `logging` stdlib no CLI: por dataset, tempo de convert/tiles, nº de feições, linhas descartadas |
| Metrics | Tamanho final de cada `.pmtiles` reportado ao fim do build |
| Tracing | N/A (pipeline batch local) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-27 | design-agent | Versão inicial a partir de DEFINE_MAPA_FASE1; achados de tamanho/CRS dos dados |
| 1.1 | 2026-06-27 | design-agent | + Decisão 7 (ETL em Docker), Decisão 8 (basemap Protomaps desde M1), nota de alvo VPS; manifesto 22→27 arquivos |

---

## Next Step

**Ready for:** `/build .claude/sdd/features/DESIGN_MAPA_FASE1.md`
