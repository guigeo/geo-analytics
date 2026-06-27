<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Extrair um recorte (bbox) de um PMTiles remoto

> **Propósito**: Gerar um basemap auto-hospedado extraindo só a região de interesse de um PMTiles grande remoto, sem baixar o planeta.
> **Validado**: 2026-06-27

## Quando usar

- Você quer um basemap estático próprio (sem provider/API key) só de uma região.
- A fonte é um PMTiles enorme (ex.: planeta) hospedado remotamente.

## Implementação

O CLI `pmtiles` extrai um bbox de um PMTiles remoto via HTTP range — baixa só os tiles
do recorte. `--maxzoom` limita o detalhe (e o tamanho).

```python
import os, subprocess
from pathlib import Path

# Builds datados expiram (~90 dias): torne a URL configuravel.
DEFAULT_BUILD_URL = "https://build.example.com/<DATA>.pmtiles"

def extract_basemap(out: Path, bbox: tuple[float, float, float, float], maxzoom: int) -> None:
    url = os.environ.get("BASEMAP_BUILD_URL") or DEFAULT_BUILD_URL
    lon_min, lat_min, lon_max, lat_max = bbox
    subprocess.run([
        "pmtiles", "extract", url, str(out),
        f"--bbox={lon_min},{lat_min},{lon_max},{lat_max}",
        f"--maxzoom={maxzoom}",
    ], check=True)
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| `--bbox` | região de interesse | `lon_min,lat_min,lon_max,lat_max` |
| `--maxzoom` | conforme detalhe desejado | Controla detalhe de rua e tamanho |
| URL do build | env var + default | Builds datados expiram; permita sobrescrever |

## Erro comum

### Errado

```python
URL = "https://build.example.com/20240101.pmtiles"  # hardcoded -> 404 quando expira
```

### Certo

```python
URL = os.environ.get("BASEMAP_BUILD_URL") or DEFAULT_BUILD_URL  # configurável
```

## Ver também

- [vector-tiles-por-zoom-e-range-requests](../concepts/vector-tiles-por-zoom-e-range-requests.md)
