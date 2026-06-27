# DESIGN: Refinamento Visual do Mapa

> Design técnico do polish visual: basemap z13, paleta refinada, rótulos UF/município, highlight ao clicar e legenda.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | REFINAMENTO_VISUAL |
| **Date** | 2026-06-27 |
| **Author** | design-agent |
| **DEFINE** | [DEFINE_REFINAMENTO_VISUAL.md](./DEFINE_REFINAMENTO_VISUAL.md) |
| **Status** | ✅ Shipped (2026-06-27) |

---

## Architecture Overview

```text
BUILD-TIME (ETL, só basemap)                 RUN-TIME (frontend — sem mudança de tiles de dados)
┌──────────────────────────┐                 ┌───────────────────────────────────────────────┐
│ datasets.yaml            │                 │  MapView (MapLibre)                            │
│   basemap.maxzoom: 8→13  │                 │   style = basemap + camadas(novo paint)        │
│          │               │                 │            + rótulos(symbol) + outline(line)   │
│          ▼               │                 │            + selection (GeoJSON highlight)     │
│ geo-pipeline build       │  pmtiles        │                                                │
│   --basemap-only ────────┼───extract z13──▶│  click → queryRenderedFeatures                 │
│                          │  basemap.pmtiles│        → setData(selection, geometria)         │
└──────────────────────────┘                 │        → AttributePanel + realce no mapa       │
   (tiles de dados intactos)                  │  LayerPanel (toggle + legenda de cores)        │
                                              └───────────────────────────────────────────────┘
```

---

## Components

| Componente | Mudança | Tecnologia |
|-----------|---------|------------|
| `datasets.yaml` (basemap) | `maxzoom: 8 → 13` | YAML |
| `cli.py` | flag `--basemap-only` (regenera só o basemap) | argparse |
| `layers.ts` | nova paleta + config de outline/rótulo + builders | TS |
| `selection.ts` (novo) | fonte GeoJSON de seleção + layers de highlight | TS, maplibre-gl |
| `MapView.tsx` | injeta selection no clique; toggle de sub-layers | React, maplibre-gl |
| `LayerPanel.tsx` | legenda (swatches refletindo a paleta) | React |

---

## Key Decisions

### Decision 1: `--basemap-only` no CLI (regenerar basemap sem re-tilar dados)

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** Subir o basemap para z13 exige rerodar o `pmtiles extract`, mas o `build` atual processa **todos** os datasets — re-tilaria o setor (~28 min) à toa.

**Choice:** Adicionar a flag `--basemap-only` ao `build`: quando presente, pula o loop de datasets e executa apenas `build_basemap`. Tiles de dados permanecem intactos.

**Rationale:** Mudança mínima no CLI; respeita a restrição "não regenerar tiles de dados". Reaproveita `build_basemap` e a checagem do binário `pmtiles`.

**Alternatives Rejected:**
1. `build` completo — rejeitado: re-tila o setor sem necessidade.
2. Editar o `.pmtiles` existente — inviável: zoom é definido na extração.

**Consequences:**
- (+) Regen do basemap em segundos/minutos. (−) Mais uma flag no CLI (documentar).

---

### Decision 2: Highlight via fonte GeoJSON de seleção

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** Realçar a feição clicada (polígono ou ponto) sem regenerar tiles (sem `feature-state`/`promoteId`).

**Choice:** Uma fonte GeoJSON `selection` (inicialmente vazia) + duas layers de realce: `selection-line` (filtro Polygon, contorno contrastante) e `selection-point` (filtro Point, círculo realçado). No clique, `queryRenderedFeatures` retorna a geometria da feição → `getSource("selection").setData(feature)`. Clique vazio → `setData(FeatureCollection vazia)`.

**Rationale:** Uniforme para polígono e ponto; zero mudança nos tiles; simples e contido no frontend (Abordagem A do brainstorm).

**Alternatives Rejected:**
1. `feature-state` + `promoteId` — rejeitado: exige id único por camada + re-tilar tudo.

**Consequences:**
- (+) Highlight imediato, sem custo de ETL. (−) Geometria pode vir cortada nas bordas de tile (aceitável; evoluível para feature-state se incomodar — premissa A-004).

---

### Decision 3: Sub-layers companheiras (`__outline`, `__label`) com toggle herdado

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Context:** Outline crisp e rótulos exigem layers MapLibre adicionais, mas o modelo da Fase 1 (1 layer pickable por dataset; clique/toggle por `id`) precisa continuar funcionando.

**Choice:** Cada dataset gera 1 layer **pickable** (fill/circle, id = `<name>`) e, opcionalmente, layers companheiras `\<name>__outline` (line) e `\<name>__label` (symbol). A visibilidade é aplicada a **todas** as layers cujo id começa com `<name>`. O clique continua consultando só `INTERACTIVE_LAYER_IDS` (os ids base).

**Rationale:** Mantém o contrato de clique/toggle da Fase 1; adiciona polish sem reescrever a interação.

**Alternatives Rejected:**
1. Fundir tudo numa layer — impossível (symbol/line/fill são tipos distintos).
2. `fill-outline-color` apenas (1px) — mantido como base, mas insuficiente p/ UF/município.

**Consequences:**
- (+) Interação intacta; estilo rico. (−) `applyVisibility` passa a iterar por prefixo de id.

---

### Decision 4: Paleta clara (GIS moderno) — definição

| Attribute | Value |
|-----------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-27 |

**Choice (ajuste fino no build):**

| Camada | Fill | Outline | Opacidade fill | Rótulo |
|--------|------|---------|----------------|--------|
| UF | — (sem fill) | `#3a5a8c` (line w2) | — | NM_UF (z4–7) |
| Município | `#2e8b6f` | `#1d6b52` (line w1) | 0.15 | NM_MUN (z8–13) |
| Bairro | `#8e5bd0` | `#6f3fb0` | 0.18 | — |
| Setor | `#e08a3c` | `#c46a1f` | 0.18 | — |
| Antenas | `#d7263d` (circle) | `#7a1020` (stroke) | 0.85 | — |
| **Highlight** | `rgba(0,179,255,.15)` | `#00b3ff` (w3) | — | — |

**Rationale:** UF vira **contorno** (referência), não fill (evita "lavar" sobre município). Cores distintas e harmônicas; highlight ciano contrasta com a paleta quente/fria das camadas.

**Consequences:** (+) Legibilidade. (−) UF deixa de ser preenchível — clique de UF passa a depender da linha; mitigação: manter um fill UF transparente pickable (opacidade 0) se necessário para o clique.

---

## File Manifest

| # | File | Action | Purpose | Agent | Deps |
|---|------|--------|---------|-------|------|
| 1 | `pipeline/datasets.yaml` | Modify | `basemap.maxzoom: 8 → 13` | @ai-data-engineer | None |
| 2 | `pipeline/src/geo_pipeline/cli.py` | Modify | flag `--basemap-only` | @python-developer | None |
| 3 | `web/src/map/layers.ts` | Modify | nova paleta + outline/label config + builders | @frontend-developer | None |
| 4 | `web/src/map/selection.ts` | Create | fonte + layers de highlight; helper de Feature | @frontend-developer | None |
| 5 | `web/src/map/MapView.tsx` | Modify | injeta selection no clique; toggle por prefixo | @frontend-developer | 3,4 |
| 6 | `web/src/panels/LayerPanel.tsx` | Modify | legenda (swatch por tipo/cor da nova paleta) | @frontend-developer | 3 |
| 7 | `web/src/styles.css` | Modify | ajustes de legenda/realce (se necessário) | @frontend-developer | 6 |
| 8 | `pipeline/README.md` | Modify | documentar `--basemap-only` | @code-documenter | 2 |

**Total Files:** 8 (1 novo, 7 modificações)

---

## Agent Assignment Rationale

| Agent | Files | Why |
|-------|-------|-----|
| @frontend-developer | 3,4,5,6,7 | Estilo MapLibre, symbol/line, highlight, React |
| @python-developer | 2 | Flag de CLI |
| @ai-data-engineer | 1 | Config do basemap |
| @code-documenter | 8 | README |

---

## Code Patterns

### Pattern 1: `--basemap-only` no CLI

```python
# cli.py — no parser do build:
build.add_argument("--basemap-only", action="store_true",
                   help="regenera apenas o basemap (nao re-tila dados)")

# em _build(...):
if args_basemap_only:
    _check_binaries((BASEMAP_BINARY,))
    if cfg.basemap:
        build_basemap(cfg.basemap, cfg.output)
    return
```

### Pattern 2: Fonte + layers de seleção (highlight)

```ts
// selection.ts
import type { GeoJSONSourceSpecification, LayerSpecification } from "maplibre-gl";

export const SELECTION_SOURCE_ID = "selection";
export const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export const selectionSource: GeoJSONSourceSpecification = { type: "geojson", data: EMPTY };

export const selectionLayers: LayerSpecification[] = [
  {
    id: "selection-line", type: "line", source: SELECTION_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "line-color": "#00b3ff", "line-width": 3 },
  },
  {
    id: "selection-point", type: "circle", source: SELECTION_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 7, "circle-color": "rgba(0,179,255,0.25)",
      "circle-stroke-color": "#00b3ff", "circle-stroke-width": 3,
    },
  },
];
```

### Pattern 3: Atualizar seleção no clique (MapView)

```ts
import { SELECTION_SOURCE_ID, EMPTY } from "./selection";

map.on("click", (e) => {
  const active = activeLayers();
  const hits = active.length ? map.queryRenderedFeatures(e.point, { layers: active }) : [];
  const src = map.getSource(SELECTION_SOURCE_ID) as maplibregl.GeoJSONSource;
  if (hits.length) {
    const f = hits[0];
    src.setData({ type: "Feature", geometry: f.geometry, properties: {} });
    onSelect({ layerId: f.layer.id, properties: f.properties ?? {} });
  } else {
    src.setData(EMPTY);
    onSelect(null);
  }
});
```

### Pattern 4: Camadas com outline + rótulo (layers.ts builder)

```ts
// Para cada DataLayer, emite [fill/circle base] (+ outline line) (+ symbol label).
// Ex.: município
{ id: "municipio", type: "fill", source: "municipio", "source-layer": "municipio",
  layout: { visibility }, paint: { "fill-color": "#2e8b6f", "fill-opacity": 0.15 } }
{ id: "municipio__outline", type: "line", source: "municipio", "source-layer": "municipio",
  layout: { visibility }, paint: { "line-color": "#1d6b52", "line-width": 1 } }
{ id: "municipio__label", type: "symbol", source: "municipio", "source-layer": "municipio",
  minzoom: 8, layout: { visibility, "text-field": ["get", "NM_MUN"], "text-size": 11 },
  paint: { "text-color": "#16432f", "text-halo-color": "#fff", "text-halo-width": 1.2 } }
```

### Pattern 5: Toggle por prefixo de id

```ts
function applyVisibility(map, visible) {
  for (const l of LAYERS) {
    const v = visible[l.id] ? "visible" : "none";
    for (const sub of ["", "__outline", "__label"]) {
      const id = l.id + sub;
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    }
  }
}
```

---

## Data Flow

```text
1. Editar datasets.yaml (basemap.maxzoom: 13)
   │
   ▼
2. docker compose run --rm pipeline build --basemap-only  → web/public/tiles/basemap.pmtiles (z13)
   │  (tiles de dados intactos)
   ▼
3. Frontend: style com paleta nova + outline + labels + selection source
   │
   ▼
4. click → queryRenderedFeatures → setData(selection) + AttributePanel
   toggle → visibility em <id> + <id>__outline + <id>__label
```

---

## Testing Strategy

| Tipo | Escopo | Ferramentas | Meta |
|------|--------|-------------|------|
| Build ETL | `--basemap-only` gera basemap.pmtiles z13 | Docker | Tamanho medido (A-002) |
| Typecheck | Frontend compila | `npm run typecheck` / build | Sem erros TS |
| E2E manual | AT-001..008 no browser | navegador | Ruas no zoom, paleta, highlight, rótulos, legenda |

> Sem testes unitários novos (mudança é visual/estilo). `pytest` existente continua válido.

---

## Error Handling

| Erro | Estratégia |
|------|-----------|
| `pmtiles extract --maxzoom` não suportado | Já validado (basemap.py usa); se falhar, fixar versão do binário |
| Basemap z13 muito grande (disco/VPS) | Recuar `maxzoom` para 11–12 no YAML (A-002) |
| `queryRenderedFeatures` sem geometria | `setData(EMPTY)`; highlight no-op (A-003) |
| Rótulos sem glyphs | `GLYPHS_URL` já configurado (Protomaps assets) |

---

## Security Considerations

- Sem novas superfícies: mudança é estilo/estático. Mantém "sem backend/auth".

---

## Observability

| Aspecto | Implementação |
|---------|---------------|
| Logging | `build_basemap` já loga tamanho final do `.pmtiles` (registrar A-002) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-27 | design-agent | Versão inicial a partir de DEFINE_REFINAMENTO_VISUAL |

---

## Next Step

**Ready for:** `/build .claude/sdd/features/DESIGN_REFINAMENTO_VISUAL.md`
