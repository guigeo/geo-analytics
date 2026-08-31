import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { registerPMTiles } from "../lib/pmtiles";
import type { BasemapTheme } from "./basemap";
import { IDS_CLICAVEIS, SUFIXOS_SUBCAMADA } from "./layers";
import { montarEstilo } from "./estilo";
import { camadas, configuracaoMapa } from "@/configuracao";
import { EMPTY_SELECTION, SELECTION_SOURCE_ID } from "./selection";
import { applyHighlights, type Destaques } from "./highlight";
import { ensureIcon, loadIcons } from "./icons";
import {
  geometriaDaMedicao,
  MEDICAO_SOURCE_ID,
  MEDICAO_VAZIA,
  type Coordenada,
  type EstadoMedicao,
} from "./medicao";

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
  /** Medição ativa. Com ela ligada, o clique marca vértice em vez de selecionar. */
  medicao: EstadoMedicao;
  /** Um clique no mapa durante a medição. */
  onVerticeMedicao: (coordenada: Coordenada) => void;
  /** Esc: encerra a medição sem passar pelo painel. */
  onEncerrarMedicao: () => void;
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
  medicao,
  onVerticeMedicao,
  onEncerrarMedicao,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Ref de visibilidade para os handlers do mapa, que sao registrados apenas 1x.
  const visibleRef = useRef(visible);
  // Destaques atuais em ref: reaplicados apos setStyle (troca de tema) sem re-registrar nada.
  const highlightsRef = useRef<Destaques | null>(highlights ?? null);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  // Medição em ref pelo mesmo motivo da visibilidade: os handlers do mapa são
  // registrados uma vez só, na montagem, e precisam enxergar o valor de agora.
  const medicaoRef = useRef(medicao);
  medicaoRef.current = medicao;
  const onVerticeRef = useRef(onVerticeMedicao);
  onVerticeRef.current = onVerticeMedicao;
  const onEncerrarRef = useRef(onEncerrarMedicao);
  onEncerrarRef.current = onEncerrarMedicao;
  // Tema/satélite iniciais fixados na montagem; trocas posteriores via setStyle (efeito separado).
  const initialThemeRef = useRef(theme);
  const initialSatelliteRef = useRef(satellite);
  const initialSatelliteOverlayRef = useRef(satelliteOverlay);

  useEffect(() => {
    if (!containerRef.current) return;
    registerPMTiles();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: montarEstilo({
        camadas,
        tema: initialThemeRef.current,
        satelite: initialSatelliteRef.current,
        sobreporVias: initialSatelliteOverlayRef.current,
      }),
      center: configuracaoMapa.centro,
      zoom: configuracaoMapa.zoomInicial,
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

    const activeLayers = () => IDS_CLICAVEIS.filter((id) => visibleRef.current[id]);

    const selection = () =>
      map.getSource(SELECTION_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

    map.on("click", (e) => {
      // Medindo, o clique é do vértice e de mais ninguém. Selecionar junto abriria
      // o painel de atributos a cada ponto marcado, e o mapa passaria a responder
      // duas coisas ao mesmo gesto.
      if (medicaoRef.current.modo) {
        onVerticeRef.current([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      const active = activeLayers();
      const hits = active.length ? map.queryRenderedFeatures(e.point, { layers: active }) : [];
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
      if (medicaoRef.current.modo) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }
      const active = activeLayers();
      const hits = active.length ? map.queryRenderedFeatures(e.point, { layers: active }) : [];
      map.getCanvas().style.cursor = hits.length ? "pointer" : "";
    });

    // Esc encerra. Vai no documento, e não no canvas, porque quem acabou de clicar
    // no botão do cabeçalho está com o foco lá — e o atalho tem de valer mesmo
    // assim, que é o que o painel promete em texto.
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && medicaoRef.current.modo) onEncerrarRef.current();
    };
    document.addEventListener("keydown", aoTeclar);

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
      document.removeEventListener("keydown", aoTeclar);
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

  // Desenha a medição e ajusta o que o mapa faz enquanto ela está ligada.
  //
  // O duplo clique é desligado de propósito: marcar dois vértices próximos em
  // sequência é o gesto normal de quem contorna um terreno, e com o zoom ligado
  // isso salta o mapa para debaixo do cursor no meio da medição.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (medicao.modo) map.doubleClickZoom.disable();
    else {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    }

    const desenhar = () => {
      const fonte = map.getSource(MEDICAO_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      fonte?.setData(medicao.modo ? geometriaDaMedicao(medicao) : MEDICAO_VAZIA);
    };

    if (!map.isStyleLoaded()) {
      map.once("load", desenhar);
      return;
    }
    desenhar();
  }, [medicao]);

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
    map.setStyle(
      montarEstilo({ camadas, tema: theme, satelite: satellite, sobreporVias: satelliteOverlay }),
    );
    map.once("idle", () => {
      applyVisibility(map, visibleRef.current);
      applyHighlights(map, highlightsRef.current);
      // O setStyle troca as fontes por novas e vazias: sem isto, alternar tema ou
      // ligar o satélite no meio de uma medição apaga o desenho e deixa o painel
      // anunciando uma área que não está mais na tela.
      const medicaoAtual = medicaoRef.current;
      const fonte = map.getSource(MEDICAO_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      fonte?.setData(medicaoAtual.modo ? geometriaDaMedicao(medicaoAtual) : MEDICAO_VAZIA);
    });
  }, [theme, satellite, satelliteOverlay]);

  return <div ref={containerRef} className="map" />;
}

function applyVisibility(map: maplibregl.Map, visible: Record<string, boolean>) {
  for (const c of camadas) {
    const value = visible[c.id] ? "visible" : "none";
    for (const suffix of SUFIXOS_SUBCAMADA) {
      const id = c.id + suffix;
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", value);
    }
  }
}
