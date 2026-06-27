# Dados (fontes brutas)

> Estes arquivos **não são versionados** (grandes e reproduzíveis). Veja `.gitignore`.

O ETL (`pipeline/`) espera as fontes nesta estrutura:

```text
data/
├── uf/BR_UF_2025.shp                 # malha de UF (shapefile)
├── municipio/BR_Municipios_2025.shp  # malha de municípios (shapefile)
├── bairro/BR_bairros_CD2022.gpkg     # bairros (GeoPackage)
├── setor_censitario/BR_setores_CD2022.gpkg  # setores censitários (~1.4 GB)
└── antenas/antenas.csv               # antenas (CSV ';' sem cabeçalho)
```

As malhas territoriais são do **IBGE** (Malha Municipal / Setores Censitários 2022).
Saídas do pipeline (`data/processed/*.parquet` e `web/public/tiles/*.pmtiles`) também
são geradas e não versionadas — rode `docker compose run --rm pipeline build`.

Caminhos e atributos esperados estão em `pipeline/datasets.yaml`.
