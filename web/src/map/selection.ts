import type {
  GeoJSONSourceSpecification,
  LayerSpecification,
} from "maplibre-gl";

// Fonte e camadas de realce da feição clicada (Abordagem A: GeoJSON de seleção).
// A geometria vem do queryRenderedFeatures; nenhum tile de dados é alterado.
export const SELECTION_SOURCE_ID = "selection";

export const EMPTY_SELECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export const selectionSource: GeoJSONSourceSpecification = {
  type: "geojson",
  data: EMPTY_SELECTION,
};

const HIGHLIGHT = "#00b3ff";

export const selectionLayers: LayerSpecification[] = [
  {
    id: "selection-fill",
    type: "fill",
    source: SELECTION_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": HIGHLIGHT, "fill-opacity": 0.15 },
  },
  {
    id: "selection-line",
    type: "line",
    source: SELECTION_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "line-color": HIGHLIGHT, "line-width": 3 },
  },
  {
    id: "selection-point",
    type: "circle",
    source: SELECTION_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 8,
      "circle-color": "rgba(0,179,255,0.25)",
      "circle-stroke-color": HIGHLIGHT,
      "circle-stroke-width": 3,
    },
  },
];
