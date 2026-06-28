import type {
  LayerSpecification,
  SourceSpecification,
} from "maplibre-gl";
import { ANTENNA_ICON } from "./icons";

export interface AttributeField {
  key: string;
  label: string;
}

export interface LabelDef {
  field: string;
  minzoom: number;
  size: number;
  color: string;
}

export interface DataLayer {
  id: string;
  label: string;
  sourceLayer: string;
  geometry: "polygon" | "point";
  /** Cor representativa (legenda + base). */
  color: string;
  /** Polígonos: opacidade do preenchimento (0 = sem fill visível, mas clicável). */
  fillOpacity?: number;
  outline?: { color: string; width: number };
  labelDef?: LabelDef;
  defaultVisible: boolean;
  attributes: AttributeField[];
}

// Paleta clara (GIS moderno). UF é contorno (fill invisível, mas clicável).
export const LAYERS: DataLayer[] = [
  {
    id: "uf",
    label: "UF",
    sourceLayer: "uf",
    geometry: "polygon",
    color: "#3a5a8c",
    fillOpacity: 0,
    outline: { color: "#3a5a8c", width: 2 },
    labelDef: { field: "NM_UF", minzoom: 4, size: 12, color: "#27406b" },
    defaultVisible: false,
    attributes: [
      { key: "NM_UF", label: "Nome" },
      { key: "SIGLA_UF", label: "UF" },
      { key: "CD_UF", label: "Código" },
    ],
  },
  {
    id: "municipio",
    label: "Município",
    sourceLayer: "municipio",
    geometry: "polygon",
    color: "#2e8b6f",
    fillOpacity: 0.15,
    outline: { color: "#1d6b52", width: 1 },
    labelDef: { field: "NM_MUN", minzoom: 8, size: 11, color: "#16432f" },
    defaultVisible: false,
    attributes: [
      { key: "NM_MUN", label: "Nome" },
      { key: "CD_MUN", label: "Código IBGE" },
      { key: "SIGLA_UF", label: "UF" },
    ],
  },
  {
    id: "bairro",
    label: "Bairro",
    sourceLayer: "bairro",
    geometry: "polygon",
    color: "#8e5bd0",
    fillOpacity: 0.18,
    outline: { color: "#6f3fb0", width: 0.6 },
    defaultVisible: false,
    attributes: [
      { key: "NM_BAIRRO", label: "Bairro" },
      { key: "NM_MUN", label: "Município" },
      { key: "NM_UF", label: "UF" },
    ],
  },
  {
    id: "setor",
    label: "Setor censitário",
    sourceLayer: "setor",
    geometry: "polygon",
    color: "#e08a3c",
    fillOpacity: 0.18,
    outline: { color: "#c46a1f", width: 0.4 },
    defaultVisible: false,
    attributes: [
      { key: "CD_SETOR", label: "Setor" },
      { key: "NM_MUN", label: "Município" },
      { key: "SITUACAO", label: "Situação" },
    ],
  },
  {
    id: "antenas",
    label: "Antenas de telefonia",
    sourceLayer: "antenas",
    geometry: "point",
    color: "#d7263d",
    defaultVisible: false,
    attributes: [
      { key: "operadora", label: "Operadora" },
      { key: "tecnologia", label: "Tecnologia" },
      { key: "frequencia", label: "Frequência" },
    ],
  },
];

// Sufixos das sub-layers companheiras (toggle herda do id base).
export const SUBLAYER_SUFFIXES = ["", "__outline", "__label"] as const;

// Só os ids base são clicáveis (preserva o contrato de clique da Fase 1).
export const INTERACTIVE_LAYER_IDS = LAYERS.map((l) => l.id);

export function dataSources(): Record<string, SourceSpecification> {
  const sources: Record<string, SourceSpecification> = {};
  for (const l of LAYERS) {
    sources[l.id] = { type: "vector", url: `pmtiles:///tiles/${l.id}.pmtiles` };
  }
  return sources;
}

function baseLayer(l: DataLayer, visibility: "visible" | "none"): LayerSpecification {
  if (l.geometry === "point") {
    // Antenas representadas por um ícone de torre (registrado em icons.ts).
    return {
      id: l.id,
      type: "symbol",
      source: l.id,
      "source-layer": l.sourceLayer,
      layout: {
        visibility,
        "icon-image": ANTENNA_ICON,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.45, 12, 1],
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    } satisfies LayerSpecification;
  }
  return {
    id: l.id,
    type: "fill",
    source: l.id,
    "source-layer": l.sourceLayer,
    layout: { visibility },
    paint: {
      "fill-color": l.color,
      "fill-opacity": l.fillOpacity ?? 0.15,
    },
  } satisfies LayerSpecification;
}

function outlineLayer(l: DataLayer, visibility: "visible" | "none"): LayerSpecification | null {
  if (!l.outline) return null;
  return {
    id: `${l.id}__outline`,
    type: "line",
    source: l.id,
    "source-layer": l.sourceLayer,
    layout: { visibility },
    paint: { "line-color": l.outline.color, "line-width": l.outline.width },
  } satisfies LayerSpecification;
}

function labelLayer(l: DataLayer, visibility: "visible" | "none"): LayerSpecification | null {
  if (!l.labelDef) return null;
  return {
    id: `${l.id}__label`,
    type: "symbol",
    source: l.id,
    "source-layer": l.sourceLayer,
    minzoom: l.labelDef.minzoom,
    layout: {
      visibility,
      "text-field": ["get", l.labelDef.field],
      "text-size": l.labelDef.size,
      "text-font": ["Noto Sans Regular"],
      "text-padding": 4,
      "text-max-width": 8,
    },
    paint: {
      "text-color": l.labelDef.color,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.2,
    },
  } satisfies LayerSpecification;
}

// Ordem: preenchimentos/contornos primeiro, rótulos por último (ficam por cima).
export function dataLayers(): LayerSpecification[] {
  const base: LayerSpecification[] = [];
  const labels: LayerSpecification[] = [];
  for (const l of LAYERS) {
    const visibility = l.defaultVisible ? "visible" : "none";
    base.push(baseLayer(l, visibility));
    const outline = outlineLayer(l, visibility);
    if (outline) base.push(outline);
    const label = labelLayer(l, visibility);
    if (label) labels.push(label);
  }
  return [...base, ...labels];
}
