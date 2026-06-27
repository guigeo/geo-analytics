# geo-pipeline — ETL geoespacial

Converte as fontes brutas (shapefile/GeoPackage/CSV) em **GeoParquet** canônico
(EPSG:4326) e gera **PMTiles** por camada para o mapa, mais o basemap Protomaps.

Pipeline: `fonte → GeoParquet → FlatGeobuf → PMTiles`, dirigido por
[`datasets.yaml`](./datasets.yaml). Adicionar um dataset = adicionar uma entrada no YAML.

## Pré-requisitos

O ETL depende de binários de sistema (GDAL, tippecanoe, pmtiles) que vêm
**empacotados no container Docker** — você só precisa de **Docker**. Nada é
instalado na máquina.

## Uso (via Docker, recomendado)

```bash
# Na raiz do repositório:
docker compose build                          # constrói a imagem (1x; compila o tippecanoe)
docker compose run --rm pipeline build        # roda todo o pipeline + basemap

# Variações:
docker compose run --rm pipeline build --only setor      # um dataset só
docker compose run --rm pipeline build --no-basemap      # pula o basemap
docker compose run --rm pipeline build --no-tiles        # só GeoParquet (sem PMTiles)
docker compose run --rm pipeline build --basemap-only    # regenera só o basemap (não re-tila dados)
```

Saídas (caem no host via volume):
- `data/processed/<name>.parquet` — GeoParquet canônico
- `web/public/tiles/<name>.pmtiles` — tiles por camada
- `web/public/tiles/basemap.pmtiles` — basemap Protomaps (recorte Brasil)

### Basemap

O basemap é um recorte do Brasil extraído de um build do Protomaps. Para usar um
build mais recente (lista em <https://maps.protomaps.com/builds/>):

```bash
PROTOMAPS_BUILD_URL=https://build.protomaps.com/<DATA>.pmtiles \
  docker compose run --rm pipeline build
```

## Desenvolvimento local (testes/lint, sem os binários)

A lógica pura (parsing do registry e das antenas) roda nativo com `uv`:

```bash
cd pipeline
uv sync --group dev
uv run pytest        # testes
uv run ruff check .  # lint
```

> `convert`/`tiles`/`basemap` exigem GDAL/tippecanoe/pmtiles — use o container.

## Estrutura

```text
pipeline/
├── datasets.yaml              # registry declarativo (1 entrada por camada)
├── Dockerfile                 # gdal + tippecanoe + pmtiles + uv
├── src/geo_pipeline/
│   ├── config.py              # carrega/valida o registry (Pydantic v2)
│   ├── convert.py             # vetorial → GeoParquet (ogr2ogr, streaming)
│   ├── antennas.py            # CSV → pontos GeoParquet
│   ├── tiles.py               # GeoParquet → PMTiles (tippecanoe)
│   ├── basemap.py             # extrato Protomaps → basemap.pmtiles
│   └── cli.py                 # orquestração
└── tests/
```
