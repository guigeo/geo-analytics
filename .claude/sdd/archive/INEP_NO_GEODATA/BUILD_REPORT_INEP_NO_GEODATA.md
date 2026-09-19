# BUILD REPORT: INEP_NO_GEODATA

> Implementation report for INEP_NO_GEODATA

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | INEP_NO_GEODATA |
| **Date** | 2026-09-18 |
| **Author** | Cursor Grok 4.6 |
| **DEFINE** | [DEFINE_INEP_NO_GEODATA.md](../features/DEFINE_INEP_NO_GEODATA.md) |
| **DESIGN** | [DESIGN_INEP_NO_GEODATA.md](../features/DESIGN_INEP_NO_GEODATA.md) |
| **Status** | Complete |

---

## Summary

| Metric | Value |
|--------|-------|
| **Tasks Completed** | 7 do manifesto (mais o fallback Parquet previsto) |
| **Files Created** | preparador, teste, parquet→csv, carga, publicador, docs + `verificar.sh`/`README.md` |
| **Build Time** | carga nacional em 21 s (fontes já em cache) |
| **Tests Passing** | unidade do preparador, carga, idempotência, atomicidade, ensaio, verificador |

## Files Created

| File | Notes |
|------|-------|
| `metodologia/inep/preparar_escolas.py` | Streaming, stdlib, PEP 723 |
| `metodologia/inep/test_preparar_escolas.py` | 8 testes, ofertas e cabeçalho |
| `metodologia/inep/parquet_para_csv.py` | Fallback pyarrow — GDAL da casa sem driver Parquet |
| `cargas/inep_escolas.sh` | Edição comum Inep+geobr |
| `scripts/vps-publicar-escolas.sh` | BUILD rodou só `--ensaio` |
| `docs/escolas-inep.md` | Linhagem dupla e qualidade |

## Verification Results

Hashes idênticos ao DESIGN de 2026-09-18.

| Medida | Valor |
|--------|------:|
| publicadas | 214.192 |
| inep_only / geobr_only | 0 / 0 |
| situação 1/2/3/4 | 180.540 / 29.780 / 3.872 / 0 |
| dependência 1–4 | 728 / 33.561 / 128.145 / 51.758 |
| fonte `inep` / `geocodebr` | 145.095 / 69.097 |
| sem geom | 13 |
| ativas analisáveis | 166.062 |
| ativas fora do município | 680 |

- `uv run --script metodologia/inep/test_preparar_escolas.py`: 8 ok.
- Segunda execução: `sem mudança`.
- `INEP_FORCAR=1 INEP_FALHAR_ANTES_TROCA=1`: versão vigente intacta.
- `--ensaio`: 214.192 / 180.540 / 166.062, sem SSH.
- `verificar.sh --profundo`: ok.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| GDAL `ubuntu-small-latest` sem Parquet | `parquet_para_csv.py` com pyarrow, como o DESIGN previu |
| `IN_ESP_EXCLUSIVA_MEDIO_INTEGRADO` truncado no CSV | Contrato usa `IN_ESP_EXCLUSIVA_MEDIO_INTEGR` |

## Deviations from Design

| Deviation | Reason |
|-----------|--------|
| Arquivo extra `parquet_para_csv.py` | Fallback explícito do DESIGN; ogr2ogr não lê Parquet nesta imagem |
| Situação 4 = 0 nesta edição | O domínio 1–4 permanece; a edição 2025 não trouxe código 4 |

## Acceptance Test Verification

| ID | Status | Evidence |
|----|--------|----------|
| AT-001 | Pass | 214.192 chaves, linhagem composta |
| AT-002 | Pass | `sem mudança` |
| AT-004/005 | Pass | 13 sem geom com motivo |
| AT-006 | Pass | view ativa só situação 1 (180.540) |
| AT-007 | Pass | hook preserva versão |
| AT-010 | Pass | `--ensaio` sem SSH |

Comparação CNEFE e tile ficam para consumo.

## Final Status

### Overall: Complete

Produção não foi tocada.

**Next:** ✅ SHIPPED — 2026-09-18
