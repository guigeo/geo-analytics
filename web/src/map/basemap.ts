import themeLayers from "protomaps-themes-base";
import type { LayerSpecification, VectorSourceSpecification } from "maplibre-gl";

// Basemap Protomaps auto-hospedado (gerado pelo ETL em web/public/tiles/basemap.pmtiles).
export const BASEMAP_SOURCE_ID = "basemap";

export const basemapSource: VectorSourceSpecification = {
  type: "vector",
  url: "pmtiles:///tiles/basemap.pmtiles",
};

export function basemapLayers(): LayerSpecification[] {
  return themeLayers(BASEMAP_SOURCE_ID, "light", "pt") as LayerSpecification[];
}

// Fontes/sprites do tema (assets publicos do Protomaps; podem ser auto-hospedados no futuro).
export const GLYPHS_URL =
  "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
export const SPRITE_URL =
  "https://protomaps.github.io/basemaps-assets/sprites/v4/light";
