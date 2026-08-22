import type {
  LayerSpecification,
  SourceSpecification,
} from "maplibre-gl";
import { ANTENNA_ICON } from "./icons";
import { tileUrl } from "./tileHost";

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
  geometry: "polygon" | "line" | "point";
  /** Cor representativa (legenda + base). */
  color: string;
  /** Polígonos: opacidade do preenchimento (0 = sem fill visível, mas clicável). */
  fillOpacity?: number;
  outline?: { color: string; width: number };
  /** Linhas: largura do traço (default 1.2). */
  lineWidth?: number;
  /** Pontos: ícone registrado (ex.: antenas). Sem ícone → círculo colorido. */
  icon?: string;
  /** Pontos com ícone: âncora ("center" default; "bottom" p/ a torre da antena). */
  iconAnchor?: "center" | "bottom";
  /** Pontos com ícone: deixar ícones sobrepostos (default false = colisão declutter). */
  iconAllowOverlap?: boolean;
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
    id: "distrito",
    label: "Distrito",
    sourceLayer: "distrito",
    geometry: "polygon",
    color: "#b8577d",
    fillOpacity: 0.16,
    outline: { color: "#8f3a5c", width: 0.8 },
    defaultVisible: false,
    attributes: [
      { key: "NM_DIST", label: "Distrito" },
      { key: "NM_MUN", label: "Município" },
      { key: "NM_UF", label: "UF" },
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
    icon: ANTENNA_ICON,
    iconAnchor: "bottom",
    iconAllowOverlap: true,
    defaultVisible: false,
    attributes: [
      { key: "operadora", label: "Operadora" },
      { key: "tecnologia", label: "Tecnologia" },
      { key: "frequencia", label: "Frequência" },
    ],
  },
  {
    id: "rodovias",
    label: "Rodovias",
    sourceLayer: "rodovias",
    geometry: "line",
    color: "#c2410c",
    lineWidth: 1.8,
    defaultVisible: false,
    attributes: [
      { key: "sigla", label: "Rodovia" },
      { key: "tipovia", label: "Tipo" },
      { key: "jurisdicao", label: "Jurisdição" },
      { key: "revestimento", label: "Revestimento" },
    ],
  },
  {
    id: "ferrovias",
    label: "Ferrovias",
    sourceLayer: "ferrovias",
    geometry: "line",
    color: "#4b5563",
    lineWidth: 1.4,
    defaultVisible: false,
    attributes: [
      { key: "nome", label: "Ferrovia" },
      { key: "bitola", label: "Bitola" },
      { key: "situacaofisica", label: "Situação" },
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
    sources[l.id] = { type: "vector", url: tileUrl(l.id) };
  }
  return sources;
}

function baseLayer(l: DataLayer, visibility: "visible" | "none"): LayerSpecification {
  if (l.geometry === "point") {
    if (l.icon) {
      // Ponto com ícone (antena = torre; escola = capelo; saúde = cruz).
      const overlap = l.iconAllowOverlap ?? false;
      return {
        id: l.id,
        type: "symbol",
        source: l.id,
        "source-layer": l.sourceLayer,
        layout: {
          visibility,
          "icon-image": l.icon,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 12, 0.9],
          "icon-anchor": l.iconAnchor ?? "center",
          "icon-allow-overlap": overlap,
          "icon-ignore-placement": overlap,
        },
      } satisfies LayerSpecification;
    }
    // Ponto genérico (CNES/INEP): círculo colorido, raio cresce com o zoom.
    return {
      id: l.id,
      type: "circle",
      source: l.id,
      "source-layer": l.sourceLayer,
      layout: { visibility },
      paint: {
        "circle-color": l.color,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 12, 5.5],
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 0.6,
      },
    } satisfies LayerSpecification;
  }
  if (l.geometry === "line") {
    return {
      id: l.id,
      type: "line",
      source: l.id,
      "source-layer": l.sourceLayer,
      layout: { visibility, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": l.color,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 12, l.lineWidth ?? 1.6],
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
