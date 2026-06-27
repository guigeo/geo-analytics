# BUILD REPORT: Refinamento Visual do Mapa

> Relatório de implementação do polish visual (basemap z13, paleta, rótulos, highlight, legenda).

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | REFINAMENTO_VISUAL |
| **Date** | 2026-06-27 |
| **Author** | build-agent |
| **DEFINE** | [DEFINE_REFINAMENTO_VISUAL.md](../features/DEFINE_REFINAMENTO_VISUAL.md) |
| **DESIGN** | [DESIGN_REFINAMENTO_VISUAL.md](../features/DESIGN_REFINAMENTO_VISUAL.md) |
| **Status** | ✅ Complete — app atualizado em http://localhost:5173 (confirmação visual pendente) |

---

## Summary

| Metric | Value |
|--------|-------|
| **Tasks Completed** | 8/8 arquivos (1 novo, 7 modificações) |
| **Lines changed** | ~230 (frontend) + ~20 (pipeline) |
| **Tests Passing** | 8/8 (pytest) · typecheck TS limpo |
| **Tiles de dados** | inalterados (só basemap regenerado) |
| **Agents Used** | 0 (build direto) |

---

## Task Execution

| Arquivo | Ação | Status | Notas |
|---------|------|--------|-------|
| `pipeline/datasets.yaml` | Modify | ✅ | `basemap.maxzoom: 8 → 13` |
| `pipeline/src/geo_pipeline/cli.py` | Modify | ✅ | flag `--basemap-only` (pula datasets) |
| `web/src/map/layers.ts` | Modify | ✅ | paleta nova + outline/label builders; UF vira contorno |
| `web/src/map/selection.ts` | Create | ✅ | fonte GeoJSON + 3 layers de highlight (fill/line/point) |
| `web/src/map/MapView.tsx` | Modify | ✅ | selection no clique; toggle por `SUBLAYER_SUFFIXES` |
| `web/src/panels/LayerPanel.tsx` | Modify | ✅ | legenda shape-aware (dot/outline/área) + hint |
| `web/src/styles.css` | Modify | ✅ | variantes de swatch + `.panel__hint` |
| `pipeline/README.md` | Modify | ✅ | documenta `--basemap-only` |

---

## Verification Results

### Lint (ruff)

```text
All checks passed!
```
**Status:** ✅ Pass

### Tests (pytest)

```text
8 passed in 0.90s
```
**Status:** ✅ 8/8 Pass (suíte da Fase 1 intacta)

### Typecheck (TypeScript)

```text
> tsc --noEmit
(sem erros)
```
**Status:** ✅ Pass

### E2E

- `geo-pipeline build --basemap-only` → regenerou **basemap.pmtiles z13** sem tocar nos tiles de dados.
- App 200 · `basemap.pmtiles` HTTP 206 (range) · módulos novos (`layers.ts`, `selection.ts`) servidos · typecheck limpo no container.

---

## Performance Notes / Premissas validadas

| Premissa | Resultado |
|----------|-----------|
| A-001 `pmtiles extract --maxzoom` | ✅ Suportado (já em `basemap.py`) |
| A-002 Tamanho do basemap z13 | ⚠️ **1.4 GB** (vs 20 MB no z8). Download do extract ~1.5 GB / 780.501 tiles. Disco do VPS a considerar; **banda por usuário não muda** (range requests) |
| A-003 `queryRenderedFeatures` → geometria | ✅ Usada para o highlight |
| A-004 Corte de borda no highlight | 🟡 A observar no browser (aceitável por design) |

> **Decisão pendente do usuário (A-002):** manter z13 (1.4 GB, ruas ricas) ou recuar para z11–12 (menor disco, menos detalhe). Trivial: trocar `basemap.maxzoom` e `--basemap-only`.

---

## Acceptance Test Verification

| ID | Cenário | Status | Evidência |
|----|---------|--------|-----------|
| AT-001 Ruas no zoom próximo | 🟢 Servindo | basemap z13 gerado; confirmar visual |
| AT-002 Visão nacional simples | 🟢 Servindo | vector tiles por-zoom (automático) |
| AT-003 Paleta legível | 🟢 Código | nova paleta em `layers.ts`; confirmar visual |
| AT-004 Highlight polígono | 🟢 Código | `selection-fill`/`selection-line` |
| AT-005 Highlight ponto | 🟢 Código | `selection-point` |
| AT-006 Limpar/trocar realce | 🟢 Código | `setData(EMPTY)` no clique vazio |
| AT-007 Rótulos UF/município | 🟢 Código | symbol layers `__label` (z4+/z8+) |
| AT-008 Legenda | 🟢 Código | swatches shape-aware no LayerPanel |

🟢 = implementado e servindo; aguarda confirmação visual no browser.

---

## Deviations from Design

| Desvio | Razão | Impacto |
|--------|-------|---------|
| `selection.ts` tem **3** layers (fill+line+point), não 2 | Fill translúcido melhora a leitura do polígono realçado | Visual melhor |
| UF: `fill-opacity: 0` (não removido) | Mantém UF **clicável** sem "lavar" o município (mitigação prevista na Decisão 4) | Clique de UF preservado |
| `text-font: ["Noto Sans Regular"]` | Fontstack disponível nos assets Protomaps | Rótulos renderizam |

---

## Issues Encountered

| # | Issue | Resolução |
|---|-------|-----------|
| 1 | `build` reprocessaria o setor (28 min) ao mexer no basemap | flag `--basemap-only` (Decisão 1) |
| 2 | Basemap z13 = 1.4 GB | Registrado p/ decisão do usuário (z13 vs z11–12); range requests evitam custo de banda por acesso |

---

## Final Status

### Overall: ✅ COMPLETE — falta confirmação visual no browser

**Checklist:**

- [x] 8 arquivos do manifesto
- [x] ruff + pytest (8/8) + typecheck TS
- [x] basemap z13 regenerado (dados intactos)
- [x] app servindo o estado novo
- [ ] Confirmação visual (AT-001..008) no browser
- [ ] Decisão A-002: manter z13 (1.4 GB) ou recuar z11–12

---

## Next Step

**Confirmar no browser** (recarregar http://localhost:5173) e decidir o `maxzoom` do basemap.

**Quando aprovado:** `/ship .claude/sdd/features/DEFINE_REFINAMENTO_VISUAL.md`

**Se ajustar algo:** `/iterate DESIGN_REFINAMENTO_VISUAL.md "{ajuste}"`
