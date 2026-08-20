# Dados (fontes brutas)

> Estes arquivos **não são versionados** (grandes e reproduzíveis). Veja `.gitignore`.

Sete das nove camadas saíram daqui: as malhas do IBGE (UF, município, bairro, setor)
e a infraestrutura (antenas, rodovias, ferrovias) vêm do **geodata**, o PostGIS
central, por `GEODATA_DSN`. Foram 3,2 GB a menos neste repositório, e o dado universal
passou a existir uma vez só em vez de uma por aplicação — passo 4 do roteiro do
[ADR-0001](../../webgis/docs/adr/0001-arquitetura-e-convergencia.md).

O que ainda vem de arquivo, e por quê:

```text
data/
├── saude/cnes.gpkg      # CNES geolocalizado (geobr) — ainda não está no geodata
├── inep/escolas.gpkg    # escolas INEP (geobr)       — ainda não está no geodata
├── censo_2022/          # CSVs do Censo, insumo do `census.py`
└── processed/           # saídas do pipeline (GeoParquet), regeneráveis
```

Os `.pmtiles` não moram aqui nem em lugar nenhum deste repositório: vão para o host
de tiles compartilhado, em `TILES_DIR`. Rode `docker compose run --rm pipeline build`.

Quem vem do banco e quem vem de arquivo está declarado em `pipeline/datasets.yaml`:
`source` é uma string quando é arquivo, e `{kind: geodata, sql: ...}` quando é banco.
