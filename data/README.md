# Dados (fontes brutas)

> Estes arquivos **não são versionados** (grandes e reproduzíveis). Veja `.gitignore`.

**Todo dado universal vem do geodata**, o PostGIS central, por `GEODATA_DSN` — as
sete camadas do mapa, sem exceção. Não há mais fonte de arquivo neste registry, e
isso é o passo 4 do roteiro do
[ADR-0001](../../webgis/docs/adr/0001-arquitetura-e-convergencia.md) concluído: o
dado que é igual para todo cliente existe uma vez só, e não uma cópia por aplicação.

O caminho de fonte-arquivo continua no pipeline, e é o do **dado de cliente** — que
pela regra 4 do ADR nunca entra no `geodata`. Hoje nenhum dataset o usa.

O que ainda mora aqui:

```text
data/
├── censo_2022/   # CSVs do Censo, insumo do `census.py`
└── processed/    # saídas do pipeline (GeoParquet), regeneráveis
```

O `censo_2022` sai quando a **pendência 3** do
[HERANCA.md](../../webgis/docs/HERANCA.md) for resolvida: a curadoria do Censo tem
dois donos hoje — `THEMES` aqui e `censo_nomes.tsv` no banco — e enquanto os dois
existirem, um vai ficar para trás.

Os `.pmtiles` não moram aqui nem em lugar nenhum deste repositório: vão para o host
de tiles compartilhado, em `TILES_DIR`. Rode `docker compose run --rm pipeline build`.
