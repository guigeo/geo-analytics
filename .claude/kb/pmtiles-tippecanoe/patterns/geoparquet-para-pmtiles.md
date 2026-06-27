<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# GeoParquet para PMTiles (tippecanoe)

> **Propósito**: Gerar tiles vetoriais (`.pmtiles`) a partir de um GeoParquet, com um feed intermediário que o tippecanoe aceita.
> **Validado**: 2026-06-27

## Quando usar

- Você tem um formato canônico (GeoParquet) e precisa de tiles para exibir no mapa.
- A camada pode ser grande (centenas de milhares de feições) e exige tuning.

## Implementação

tippecanoe **não** lê GeoParquet direto; lê GeoJSON-Seq/FlatGeobuf. Exporte um feed
(streaming) com GDAL e tile a partir dele.

```python
import subprocess
from pathlib import Path

def build_pmtiles(parquet: Path, out: Path, layer: str,
                  minzoom: int, maxzoom: int, simplification: int | None = None) -> None:
    fgb = out.with_suffix(".fgb")
    subprocess.run(["ogr2ogr", "-f", "FlatGeobuf", "-overwrite", str(fgb), str(parquet)], check=True)
    try:
        cmd = ["tippecanoe", "-o", str(out), "-l", layer,
               f"--minimum-zoom={minzoom}", f"--maximum-zoom={maxzoom}",
               "--drop-densest-as-needed", "--no-tile-size-limit", "--force"]
        if simplification is not None:
            cmd.append(f"--simplification={simplification}")
        cmd.append(str(fgb))
        subprocess.run(cmd, check=True)
    finally:
        fgb.unlink(missing_ok=True)
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| Feed | FlatGeobuf | Streaming; evita um GeoJSON gigante em disco |
| `--drop-densest-as-needed` | ligado em camadas pesadas | Mantém tiles dentro do limite |
| `--maximum-zoom` | por camada | Camada de detalhe fino → zoom maior |
| `--simplification` | ~10 em camadas pesadas | Reduz vértices/tamanho |

## Nota de performance

A **tilagem domina o tempo**; a conversão de formato (Parquet → FlatGeobuf) é barata.
Em camadas com centenas de milhares de feições, espere minutos a dezenas de minutos só
no tippecanoe. Por isso, evite re-tilar o que não mudou (atalho de CLI por camada).

## Exemplo de uso

```bash
# camada leve: zoom amplo
build_pmtiles(area.parquet, area.pmtiles, "area", 0, 10)
# camada pesada: tuning
build_pmtiles(dense.parquet, dense.pmtiles, "dense", 6, 14, simplification=10)
```

## Ver também

- [vector-tiles-por-zoom-e-range-requests](../concepts/vector-tiles-por-zoom-e-range-requests.md)
- geospatial-etl/patterns/conversao-streaming-ogr2ogr.md
