import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { registerPMTiles } from "../lib/pmtiles";
import {
  basemapLayers,
  basemapOverlayLayers,
  basemapSource,
  BASEMAP_SOURCE_ID,
  GLYPHS_URL,
  satelliteLayer,
  satelliteSource,
  SATELLITE_SOURCE_ID,
  spriteUrl,
  type BasemapTheme,
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
import { applyHighlights, highlightLayers, type Destaques } from "./highlight";
import { ensureIcon, loadIcons } from "./icons";

export interface SelectedFeature {
  layerId: string;
  properties: Record<string, unknown>;
}

export interface Viewport {
  bbox: [number, number, number, number]; // oeste, sul, leste, norte
  zoom: number;
  centro: [number, number]; // lon, lat
}

export interface MapFocus {
  bbox: [number, number, number, number];
  /** Muda a cada seleção (ex.: Date.now()) para re-disparar o fitBounds no mesmo alvo. */
  key: number;
  /** Teto de zoom do fitBounds (default 12 — cidade). Endereço usa algo maior (nível de rua). */
  maxZoom?: number;
}

interface Props {
  visible: Record<string, boolean>;
  theme: BasemapTheme;
  /** Satélite (Esri, raster) no lugar do basemap vetorial. */
  satellite: boolean;
  /** Com satélite ligado: mantém vias/limites/rótulos por cima (modo híbrido). */
  satelliteOverlay: boolean;
  onSelect: (feature: SelectedFeature | null) => void;
  /** Destaques do agente (chat): pinta municipios/setores por codigo. */
  highlights?: Destaques | null;
  /** Voa até um bbox (busca do header). */
  focus?: MapFocus | null;
  /** Notifica o viewport (moveend) — vira o contexto do mapa enviado ao agente. */
  onViewportChange?: (viewport: Viewport) => void;
}

const BRAZIL_CENTER: [number, number] = [-52.5, -14.5];

function buildStyle(
  theme: BasemapTheme,
  satellite: boolean,
  satelliteOverlay: boolean,
): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: spriteUrl(theme),
    sources: {
      [BASEMAP_SOURCE_ID]: basemapSource,
      [SATELLITE_SOURCE_ID]: satelliteSource,
      ...dataSources(),
      [SELECTION_SOURCE_ID]: selectionSource,
    },
    layers: [
      ...(satellite
        ? [satelliteLayer(), ...(satelliteOverlay ? basemapOverlayLayers(theme) : [])]
        : basemapLayers(theme)),
      ...dataLayers(),
      ...highlightLayers(),
      ...selectionLayers,
    ],
  };
}

export function MapView({
  visible,
  theme,
  satellite,
  satelliteOverlay,
  onSelect,
  highlights,
  focus,
  onViewportChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Ref de visibilidade para os handlers do mapa, que sao registrados apenas 1x.
  const visibleRef = useRef(visible);
  // Destaques atuais em ref: reaplicados apos setStyle (troca de tema) sem re-registrar nada.
  const highlightsRef = useRef<Destaques | null>(highlights ?? null);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  // Tema/satélite iniciais fixados na montagem; trocas posteriores via setStyle (efeito separado).
  const initialThemeRef = useRef(theme);
  const initialSatelliteRef = useRef(satellite);
  const initialSatelliteOverlayRef = useRef(satelliteOverlay);

  useEffect(() => {
    if (!containerRef.current) return;
    registerPMTiles();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(
        initialThemeRef.current,
        initialSatelliteRef.current,
        initialSatelliteOverlayRef.current,
      ),
      center: BRAZIL_CENTER,
      zoom: 3.5,
    });
    map.addControl(new maplibregl.NavigationControl({}), "top-left");
    mapRef.current = map;

    // Ícones das camadas de ponto (antena/escola/saúde): rasteriza uma vez e
    // (re)registra sempre que o style pedir. `styleimagemissing` cobre a carga
    // inicial e o setStyle do toggle de tema.
    let icons = new Map<string, ImageData>();
    loadIcons()
      .then((loaded) => {
        icons = loaded;
        for (const [id, img] of loaded) ensureIcon(map, id, img);
      })
      .catch((err) => console.error(err));
    map.on("styleimagemissing", (e) => {
      const img = icons.get(e.id);
      if (img) ensureIcon(map, e.id, img);
    });

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

    const reportViewport = () => {
      const b = map.getBounds();
      const c = map.getCenter();
      onViewportChangeRef.current?.({
        bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        zoom: map.getZoom(),
        centro: [c.lng, c.lat],
      });
    };
    map.on("moveend", reportViewport);
    map.once("load", reportViewport);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.fitBounds(focus.bbox, { padding: 48, duration: 1200, maxZoom: focus.maxZoom ?? 12 });
  }, [focus]);

  useEffect(() => {
    highlightsRef.current = highlights ?? null;
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once("load", () => applyHighlights(map, highlightsRef.current));
      return;
    }
    applyHighlights(map, highlightsRef.current);
  }, [highlights]);

  // Troca de tema ou satélite: reconstrói o style (basemap claro/escuro/satélite
  // + sprite) sem recriar o mapa. O handler de clique vive no mapa, então sobrevive
  // ao setStyle; só a visibilidade das camadas precisa ser reaplicada quando o novo
  // style carrega.
  const firstThemeRender = useRef(true);
  useEffect(() => {
    if (firstThemeRender.current) {
      firstThemeRender.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildStyle(theme, satellite, satelliteOverlay));
    map.once("idle", () => {
      applyVisibility(map, visibleRef.current);
      applyHighlights(map, highlightsRef.current);
    });
  }, [theme, satellite, satelliteOverlay]);

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
