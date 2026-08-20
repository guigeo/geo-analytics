import themeLayers from "protomaps-themes-base";
import type {
  LayerSpecification,
  RasterSourceSpecification,
  VectorSourceSpecification,
} from "maplibre-gl";
import { tileUrl } from "./tileHost";

// Basemap Protomaps auto-hospedado (gerado pelo ETL; servido pelo host de tiles).
export const BASEMAP_SOURCE_ID = "basemap";

export type BasemapTheme = "light" | "dark";

export const basemapSource: VectorSourceSpecification = {
  type: "vector",
  url: tileUrl("basemap"),
};

export function basemapLayers(theme: BasemapTheme = "light"): LayerSpecification[] {
  return themeLayers(BASEMAP_SOURCE_ID, theme, "pt") as LayerSpecification[];
}

// Satélite: raster XYZ público (Esri, sem API key), direto do navegador —
// não hospedamos essa cobertura na VPS (disco apertado).
export const SATELLITE_SOURCE_ID = "satellite";

export const satelliteSource: RasterSourceSpecification = {
  type: "raster",
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  tileSize: 256,
  maxzoom: 19,
  attribution: "Esri, Maxar, Earthstar Geographics",
};

export function satelliteLayer(): LayerSpecification {
  return { id: SATELLITE_SOURCE_ID, type: "raster", source: SATELLITE_SOURCE_ID };
}

// Modo híbrido (satélite ligado): mantém vias, limites, rótulos e POIs do
// basemap por cima do raster — só os preenchimentos (terra, água, edificações)
// ficam redundantes sobre a imagem e são escondidos.
export function basemapOverlayLayers(theme: BasemapTheme = "light"): LayerSpecification[] {
  return basemapLayers(theme).filter((l) => l.type !== "fill" && l.type !== "background");
}

// Fontes/sprites do tema (assets publicos do Protomaps; podem ser auto-hospedados no futuro).
export const GLYPHS_URL =
  "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";

export function spriteUrl(theme: BasemapTheme = "light"): string {
  return `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`;
}
