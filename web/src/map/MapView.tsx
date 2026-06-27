import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { registerPMTiles } from "../lib/pmtiles";
import {
  basemapLayers,
  basemapSource,
  BASEMAP_SOURCE_ID,
  GLYPHS_URL,
  SPRITE_URL,
} from "./basemap";
import {
  dataLayers,
  dataSources,
  INTERACTIVE_LAYER_IDS,
  LAYERS,
  SUBLAYER_SUFFIXES,
} from "./layers";
import {
  EMPTY_SELECTION,
  selectionLayers,
  selectionSource,
  SELECTION_SOURCE_ID,
} from "./selection";

export interface SelectedFeature {
  layerId: string;
  properties: Record<string, unknown>;
}

interface Props {
  visible: Record<string, boolean>;
  onSelect: (feature: SelectedFeature | null) => void;
}

const BRAZIL_CENTER: [number, number] = [-52.5, -14.5];

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: SPRITE_URL,
    sources: {
      [BASEMAP_SOURCE_ID]: basemapSource,
      ...dataSources(),
      [SELECTION_SOURCE_ID]: selectionSource,
    },
    layers: [...basemapLayers(), ...dataLayers(), ...selectionLayers],
  };
}

export function MapView({ visible, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Ref de visibilidade para os handlers do mapa, que sao registrados apenas 1x.
  const visibleRef = useRef(visible);

  useEffect(() => {
    if (!containerRef.current) return;
    registerPMTiles();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: BRAZIL_CENTER,
      zoom: 3.5,
    });
    map.addControl(new maplibregl.NavigationControl({}), "top-left");
    mapRef.current = map;

    const activeLayers = () =>
      INTERACTIVE_LAYER_IDS.filter((id) => visibleRef.current[id]);

    const selection = () =>
      map.getSource(SELECTION_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

    map.on("click", (e) => {
      const active = activeLayers();
      const hits = active.length
        ? map.queryRenderedFeatures(e.point, { layers: active })
        : [];
      if (hits.length) {
        const f = hits[0];
        selection()?.setData({ type: "Feature", geometry: f.geometry, properties: {} });
        onSelect({ layerId: f.layer.id, properties: f.properties ?? {} });
      } else {
        selection()?.setData(EMPTY_SELECTION);
        onSelect(null);
      }
    });

    map.on("mousemove", (e) => {
      const active = activeLayers();
      const hits = active.length
        ? map.queryRenderedFeatures(e.point, { layers: active })
        : [];
      map.getCanvas().style.cursor = hits.length ? "pointer" : "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    visibleRef.current = visible;
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once("load", () => applyVisibility(map, visible));
      return;
    }
    applyVisibility(map, visible);
  }, [visible]);

  return <div ref={containerRef} className="map" />;
}

function applyVisibility(map: maplibregl.Map, visible: Record<string, boolean>) {
  for (const l of LAYERS) {
    const value = visible[l.id] ? "visible" : "none";
    for (const suffix of SUBLAYER_SUFFIXES) {
      const id = l.id + suffix;
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", value);
    }
  }
}
