# BUILD REPORT: Mapa Interativo (Fase 1 — Visualização)

> Relatório de implementação do mapa estático com pipeline ETL (GeoParquet → PMTiles).

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | MAPA_FASE1 |
| **Date** | 2026-06-27 |
| **Author** | build-agent |
| **DEFINE** | [DEFINE_MAPA_FASE1.md](../features/DEFINE_MAPA_FASE1.md) |
| **DESIGN** | [DESIGN_MAPA_FASE1.md](../features/DESIGN_MAPA_FASE1.md) |
| **Status** | ✅ Complete — E2E executado (ETL Docker + frontend rodando em http://localhost:5173) |

---

## Summary

| Metric | Value |
|--------|-------|
| **Tasks Completed** | 27/27 arquivos do manifesto (+ suportes: `__init__.py`, fixture, `.gitkeep`, `.gitignore`) |
| **Files Created** | 31 |
| **Lines of Code** | ~815 (Python 438 / TS-TSX 377) + configs |
| **Tests Passing** | 8/8 (pytest, Python) |
| **Agents Used** | 0 (build direto, sem spawn de subagentes) |

---

## Task Execution

| Bloco | Arquivos | Status | Notas |
|-------|----------|--------|-------|
| Pipeline base | `pyproject.toml`, `__init__.py`, `datasets.yaml` | ✅ | datasets.yaml com schemas reais (campos confirmados via pyogrio) |
| Config | `config.py` | ✅ | Pydantic v2; resolução de paths a partir da raiz do repo |
| ETL | `convert.py`, `antennas.py`, `tiles.py`, `basemap.py` | ✅ | ogr2ogr streaming, parse CSV antenas, tippecanoe, extrato Protomaps |
| CLI | `cli.py` | ✅ | argparse; checagem de binários com mensagem amigável |
| Docker | `Dockerfile`, `docker-compose.yml`, `.dockerignore` | ✅ | gdal+tippecanoe+pmtiles+uv; venv fora do bind mount |
| Testes | `test_config.py`, `test_antennas.py`, `fixtures/antenas_sample.csv` | ✅ | 8 testes, todos passando |
| Frontend | `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `main.tsx`, `App.tsx`, `lib/pmtiles.ts`, `map/basemap.ts`, `map/layers.ts`, `map/MapView.tsx`, `panels/LayerPanel.tsx`, `panels/AttributePanel.tsx`, `styles.css`, `public/tiles/.gitkeep` | ✅ | escrito fiel ao design; não compilado (npm ausente) |
| Docs | `pipeline/README.md`, `web/README.md` | ✅ | uso via Docker + dev local |

**Nota sobre agentes:** o DESIGN sugeria delegação a @ai-data-engineer / @frontend-developer etc., mas o build foi executado **diretamente** (sem spawn de subagentes), seguindo os padrões de código do DESIGN.

---

## Files Created

| Arquivo | Agent | Verificado |
|---------|-------|-----------|
| `pipeline/pyproject.toml` | (direct) | ✅ uv sync |
| `pipeline/datasets.yaml` | (direct) | ✅ test_config |
| `pipeline/src/geo_pipeline/config.py` | (direct) | ✅ pytest + ruff |
| `pipeline/src/geo_pipeline/convert.py` | (direct) | ✅ ruff (exec exige Docker) |
| `pipeline/src/geo_pipeline/antennas.py` | (direct) | ✅ pytest + ruff |
| `pipeline/src/geo_pipeline/tiles.py` | (direct) | ✅ ruff (exec exige Docker) |
| `pipeline/src/geo_pipeline/basemap.py` | (direct) | ✅ ruff (exec exige Docker) |
| `pipeline/src/geo_pipeline/cli.py` | (direct) | ✅ exec até checagem de binários |
| `pipeline/tests/test_config.py` | (direct) | ✅ 5 testes |
| `pipeline/tests/test_antennas.py` | (direct) | ✅ 3 testes |
| `pipeline/tests/fixtures/antenas_sample.csv` | (direct) | ✅ fixture |
| `pipeline/Dockerfile` | (direct) | ⚠️ não construído (ver manual) |
| `docker-compose.yml` | (direct) | ✅ `docker compose config` |
| `pipeline/.dockerignore` | (direct) | ✅ |
| `pipeline/README.md` | (direct) | ✅ |
| `web/package.json` | (direct) | ⚠️ npm ausente |
| `web/tsconfig.json` | (direct) | ⚠️ npm ausente |
| `web/vite.config.ts` | (direct) | ⚠️ npm ausente |
| `web/index.html` | (direct) | ⚠️ npm ausente |
| `web/src/main.tsx` | (direct) | ⚠️ npm ausente |
| `web/src/App.tsx` | (direct) | ⚠️ npm ausente |
| `web/src/lib/pmtiles.ts` | (direct) | ⚠️ npm ausente |
| `web/src/map/basemap.ts` | (direct) | ⚠️ npm ausente |
| `web/src/map/layers.ts` | (direct) | ⚠️ npm ausente |
| `web/src/map/MapView.tsx` | (direct) | ⚠️ npm ausente |
| `web/src/panels/LayerPanel.tsx` | (direct) | ⚠️ npm ausente |
| `web/src/panels/AttributePanel.tsx` | (direct) | ⚠️ npm ausente |
| `web/src/styles.css` | (direct) | ⚠️ npm ausente |
| `web/public/tiles/.gitkeep` | (direct) | ✅ |
| `web/README.md` | (direct) | ✅ |
| `.gitignore` (mod) | (direct) | ✅ |

---

## Verification Results

### Lint (ruff)

```text
All checks passed!
```

**Status:** ✅ Pass

### Type Check

- **Python:** N/A (mypy não configurado; ruff cobre estilo/erros).
- **TypeScript:** ⏭️ Skipped — `node`/`npm` ausentes no ambiente. `npm run typecheck` é verificação manual.

### Tests (pytest)

```text
8 passed in 0.28s
```

| Teste | Resultado |
|-------|-----------|
| test_load_real_registry | ✅ |
| test_dataset_lookup_and_paths | ✅ |
| test_antennas_is_csv_points | ✅ |
| test_basemap_bbox_validation | ✅ |
| test_unknown_dataset_raises | ✅ |
| test_parses_valid_rows_and_drops_invalid | ✅ |
| test_geometry_from_lonlat | ✅ |
| test_strips_whitespace_in_attributes | ✅ |

**Status:** ✅ 8/8 Pass

### CLI (smoke)

```text
$ uv run geo-pipeline build --only uf --no-basemap
binarios ausentes: ogr2ogr, tippecanoe. Rode o pipeline via container: `docker compose run --rm pipeline build`.
```

✅ Config carregada, dataset resolvido, checagem de binários com mensagem clara. `docker compose config` → OK.

---

## Issues Encountered

| # | Issue | Resolução | Impacto |
|---|-------|-----------|---------|
| 1 | `dtype=str` no pandas 2.x gera dtype `string`, não `object` → strip de espaços não aplicava | Trocado para `df.select_dtypes(include=["object","string"])` | test_antennas passou |
| 2 | Bind mount do Docker sobrescreveria o `.venv` em `/repo/pipeline` | venv movido para `/opt/venv` via `UV_PROJECT_ENVIRONMENT` (fora do mount) | Dockerfile robusto |
| 3 | Campos reais dos datasets eram suposições no DESIGN | Inspeção via `pyogrio.read_info` → `datasets.yaml` com campos confirmados | Eliminou risco do AT-005/006 |

---

## Deviations from Design

| Desvio | Razão | Impacto |
|--------|-------|---------|
| CLI usa `argparse` (stdlib) em vez de Typer | Zero dependência extra; CLI simples | Menos deps; mesma UX |
| Bairro: peso real **moderado** (18.269 feições), não "pesado" | Confirmado na inspeção | Tile config mais leve (maxzoom 13) |
| Setor: **472.780** feições (não ~450k) | Contagem real | Sem mudança de abordagem |
| `.dockerignore` em `pipeline/` (não raiz) + build context `./pipeline` | Mantém contexto de build pequeno (data/ 1.4GB fora) | Build mais rápido |
| Visibilidade default: Bairro/Setor **off** | Performance no primeiro load | Mapa abre leve; usuário liga sob demanda |

---

## Acceptance Test Verification

| ID | Cenário | Status | Evidência |
|----|---------|--------|-----------|
| AT-001 | Fonte → GeoParquet | 🟡 Código pronto | Exige Docker (ogr2ogr). `convert.py`/`antennas.py` prontos |
| AT-002 | GeoParquet → PMTiles | 🟡 Código pronto | Exige Docker (tippecanoe). `tiles.py` pronto |
| AT-003 | Render inicial | 🟡 Código pronto | Exige npm + tiles. `MapView`/style prontos |
| AT-004 | Toggle de camada | 🟡 Código pronto | `LayerPanel` + `setLayoutProperty` |
| AT-005 | Clique polígono → atributos | 🟡 Código pronto | Campos reais confirmados (NM_MUN, CD_MUN, SIGLA_UF) |
| AT-006 | Clique ponto → atributos | 🟡 Código pronto | operadora/tecnologia/frequencia mapeados |
| AT-007 | Performance setor | ⏳ A validar | Manual no M4 após gerar tiles |
| AT-008 | Parse antenas | ✅ Pass | test_antennas (3 válidas, 1 descartada, geom correta) |

🟡 = implementado e revisado; aguarda execução E2E (Docker/npm) para evidência observável.

---

## Verificação Manual Pendente (E2E)

O ambiente desta sessão não tem `node`/`npm` nem os binários geo (por design, vivem no Docker). Para fechar o ciclo:

```bash
# 1. ETL (gera GeoParquet + PMTiles + basemap)
docker compose build
docker compose run --rm pipeline build            # ~minutos; setor é o gargalo

# 2. Frontend
cd web && npm install && npm run typecheck && npm run dev
# abrir http://localhost:5173 → validar AT-003..AT-007
```

---

## E2E — Execução Real (Docker + Frontend)

### ETL: tiles gerados (`web/public/tiles/`)

| Camada | Feições | Tile | Convert | Tilagem |
|--------|---------|------|---------|---------|
| uf | 27 | 0.84 MB | <1s | ~1s |
| municipio | 5.573 | 28 MB | ~4s | ~50s |
| bairro | 18.269 | 17 MB | ~1s | ~15s |
| antenas | 111.296 | 17 MB | <1s | ~67s |
| **setor** | **472.780** | **593 MB** | **~30s** | **~28 min** |
| basemap (Protomaps z≤8) | — | 20 MB | — | ~7s (download) |

> **Validação da Decisão 1 (streaming):** converter o gpkg de **1.4 GB** do setor para GeoParquet levou **~30s sem estouro de memória**. A tilagem (tippecanoe) é o gargalo, não a conversão.

### Frontend

- `npm run build` (typecheck + vite) → ✅ 40 módulos, `dist` gerado.
- Vite dev server (container Node) em **http://localhost:5173**.
- Serving validado: `index.html` 200; `*.pmtiles` respondem **HTTP 206** com `accept-ranges: bytes` (PMTiles funcional).

### Deviations descobertas no E2E (corrigidas)

| # | Problema | Correção |
|---|----------|----------|
| 1 | GDAL `ubuntu-small` sem driver Parquet | Base → `osgeo/gdal:ubuntu-full-latest` |
| 2 | `protomaps-themes-base` v4.5 mudou API (`layers` espera `Theme`) | Usar export `default(source, "light", "pt")` |
| 3 | Build Protomaps `20240618` expirou (404) | Fixar `20250602`; `PROTOMAPS_BUILD_URL` override |
| 4 | Recorte Brasil em zoom cheio = **5.8 GB** | `basemap.maxzoom` (default 8 → 20 MB) |
| 5 | `go-pmtiles` v1.22 → v1.30.3 | Atualizada versão no Dockerfile |

### Acceptance Tests — reavaliação pós-E2E

| ID | Status | Evidência |
|----|--------|-----------|
| AT-001 Fonte → GeoParquet | ✅ Pass | 5 datasets convertidos (incl. setor 1.4 GB) |
| AT-002 GeoParquet → PMTiles | ✅ Pass | 5 `.pmtiles` + basemap gerados |
| AT-003 Render inicial | 🟢 Servindo | App 200, tiles 206; render visual = confirmar no browser |
| AT-004 Toggle | 🟢 Código + servindo | `setLayoutProperty`; validar no browser |
| AT-005/006 Clique atributos | 🟢 Código + servindo | campos reais nos tiles; validar no browser |
| AT-007 Performance setor | 🟡 A validar | setor.pmtiles 593 MB servido; medir interação no M4 |
| AT-008 Parse antenas | ✅ Pass | 111.296 pontos; test_antennas |

> **Atenção VPS:** setor.pmtiles = **593 MB** — confirma o ponto de banda/disco anotado no DESIGN. Mitigável reduzindo `maxzoom` do setor se necessário.

---

## Final Status

### Overall: ✅ COMPLETE — app rodando; falta só confirmação visual no browser

**Checklist:**

- [x] Todos os 27 arquivos do manifesto criados (+ suportes)
- [x] Lint (ruff) passa
- [x] Testes Python passam (8/8)
- [x] CLI/compose validados
- [x] E2E Docker (ETL) — 5 camadas + basemap gerados
- [x] E2E frontend (npm build + dev server rodando)
- [x] Serving validado (HTTP 206 / range requests)
- [ ] Confirmação visual no browser (AT-003..006)
- [ ] AT-007 performance do setor — medir no M4

---

## Next Step

**E2E:** rodar os comandos da seção "Verificação Manual Pendente".

**Quando validado:** `/ship .claude/sdd/features/DEFINE_MAPA_FASE1.md`

**Se algo quebrar no E2E:** `/iterate DESIGN_MAPA_FASE1.md "{ajuste}"`
