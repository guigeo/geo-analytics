# Dados

> Nada aqui é versionado. Veja `.gitignore`.

**Não há mais fonte bruta neste repositório.** Todo dado universal vem do geodata, o
PostGIS central, por `GEODATA_DSN` — as sete camadas do mapa e a população que ordena
o índice de busca. Passo 4 do roteiro do
[ADR-0001](../../webgis/docs/adr/0001-arquitetura-e-convergencia.md) concluído, e com
ele a pendência 3 do [HERANCA.md](../../webgis/docs/HERANCA.md): a curadoria do Censo
tem um dono só.

```text
data/
└── processed/   # saídas do pipeline (GeoParquet), regeneráveis a partir do banco
```

O caminho de fonte-arquivo continua no pipeline (`source` como string em vez de
`{kind: geodata}`), e é o do **dado de cliente** — que pela regra 4 do ADR nunca entra
no `geodata`. Hoje nenhum dataset o usa.

Os `.pmtiles` vão para o host de tiles compartilhado, em `TILES_DIR`. Rode
`docker compose run --rm pipeline build`.
