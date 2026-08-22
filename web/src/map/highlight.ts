import type { FilterSpecification, LayerSpecification, Map } from "maplibre-gl";

// Destaques do agente (Fase 2): pinta municipios/distritos/bairros/setores POR CODIGO via filtro nas
// proprias fontes PMTiles. Diferente do selection.ts (clique), nao depende de
// queryRenderedFeatures — funciona para codigos fora do viewport atual, e as camadas
// ficam sempre visiveis (independem do toggle da camada base).
export interface Destaques {
  camada: "municipio" | "setor" | "bairro" | "distrito";
  codigos: string[];
}

const CODE_FIELDS = {
  municipio: "CD_MUN",
  setor: "CD_SETOR",
  bairro: "CD_BAIRRO",
  distrito: "CD_DIST",
} as const;

const HIGHLIGHT = "#00b3ff";

function codeFilter(field: string, codigos: string[]): FilterSpecification {
  return ["in", ["get", field], ["literal", codigos]] as FilterSpecification;
}

export function highlightLayers(): LayerSpecification[] {
  return Object.entries(CODE_FIELDS).flatMap(([id, field]) => [
    {
      id: `${id}__highlight-fill`,
      type: "fill",
      source: id,
      "source-layer": id,
      filter: codeFilter(field, []),
      paint: { "fill-color": HIGHLIGHT, "fill-opacity": 0.25 },
    } satisfies LayerSpecification,
    {
      id: `${id}__highlight-line`,
      type: "line",
      source: id,
      "source-layer": id,
      filter: codeFilter(field, []),
      paint: { "line-color": HIGHLIGHT, "line-width": 2.5 },
    } satisfies LayerSpecification,
  ]);
}

export function applyHighlights(map: Map, destaques: Destaques | null) {
  for (const [camada, field] of Object.entries(CODE_FIELDS)) {
    const codigos = destaques?.camada === camada ? destaques.codigos : [];
    const filter = codeFilter(field, codigos);
    for (const kind of ["fill", "line"] as const) {
      const id = `${camada}__highlight-${kind}`;
      if (map.getLayer(id)) map.setFilter(id, filter);
    }
  }
}
