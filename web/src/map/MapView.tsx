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
import {
  COLECAO_VAZIA,
  DESENHOS_SOURCE_ID,
  geometriaDoTracado,
  IDS_CAMADAS_DESENHOS,
  TRACADO_SOURCE_ID,
} from "@/desenho/fonte";
import { tracadoParaDesenhar, type EstadoDesenho } from "@/desenho/estado";

/**
 * Faz `tentar` acontecer assim que o style existir — que **não** é o mesmo que ele
 * estar carregado.
 *
 * Aqui morava um defeito que só o uso pegou (2026-09-02: nenhum desenho aparecia no
 * mapa). O código pedia `map.isStyleLoaded()` e, quando falso, agendava em
 * `map.once("load", …)`. As duas metades estão erradas:
 *
 * - `Style.loaded()` devolve **false enquanto qualquer tile estiver carregando**, e
 *   também logo depois de um `setData` — nada disso impede escrever numa fonte. O que
 *   `setData` precisa é que a FONTE exista, e ela existe assim que o style é parseado.
 * - `once("load")` dispara uma vez só, no primeiro carregamento. Agendar nele depois
 *   disso é agendar para nunca — e era exatamente o caso: o acervo chega da rede
 *   enquanto os PMTiles ainda carregam, então caía sempre no ramo que não roda.
 *
 * `styledata` dispara a cada mudança de style, inclusive no `setStyle` do tema, e o
 * ouvinte se remove quando consegue. `tentar` devolve se conseguiu.
 */
function assimQuePuder(map: maplibregl.Map, tentar: () => boolean) {
  if (tentar()) return;
  const aoMudarOStyle = () => {
    if (tentar()) map.off("styledata", aoMudarOStyle);
  };
  map.on("styledata", aoMudarOStyle);
}

/** Escreve numa fonte GeoJSON. Devolve `false` se ela ainda não existe. */
function escreverNaFonte(map: maplibregl.Map, id: string, dados: GeoJSON.FeatureCollection) {
  const fonte = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  fonte?.setData(dados);
  return fonte !== undefined;
}

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
  /** Desenho em andamento. Como a medição, ele toma o clique do mapa. */
  desenho: EstadoDesenho;
  /** Um clique no mapa durante o desenho. */
  onVerticeDesenho: (coordenada: Coordenada) => void;
  /** Esc: cancela o traçado. */
  onCancelarDesenho: () => void;
  /**
   * Duplo clique ou Enter: encerra o traçado e vai para o formulário.
   *
   * Recebe `duplicouUltimo` porque o duplo clique deixa lixo: o MapLibre dispara
   * `click` nas DUAS batidas antes do `dblclick`, então o último vértice entrou duas
   * vezes. Quem decide o que fazer com isso é o `App`, que é dono dos vértices.
   */
  onEncerrarDesenho: (duplicouUltimo: boolean) => void;
  /**
   * O acervo do cliente, como `/api/desenhos/geometrias` o devolve. Vem vazio também
   * quando o acervo está fora do ar — o mapa segue de pé (AT-012).
   */
  desenhos: GeoJSON.FeatureCollection;
  /** Liga e desliga o acervo no mapa, como o painel de camadas faz com as camadas. */
  desenhosVisiveis: boolean;
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
  desenho,
  onVerticeDesenho,
  onCancelarDesenho,
  onEncerrarDesenho,
  desenhos,
  desenhosVisiveis,
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
  // O desenho segue o mesmo arranjo da medição, e pelo mesmo motivo: os handlers do
  // mapa são registrados uma vez só e precisam enxergar o estado de agora.
  const desenhoRef = useRef(desenho);
  desenhoRef.current = desenho;
  const onVerticeDesenhoRef = useRef(onVerticeDesenho);
  onVerticeDesenhoRef.current = onVerticeDesenho;
  const onCancelarDesenhoRef = useRef(onCancelarDesenho);
  onCancelarDesenhoRef.current = onCancelarDesenho;
  const onEncerrarDesenhoRef = useRef(onEncerrarDesenho);
  onEncerrarDesenhoRef.current = onEncerrarDesenho;
  const desenhosRef = useRef(desenhos);
  desenhosRef.current = desenhos;
  const desenhosVisiveisRef = useRef(desenhosVisiveis);
  desenhosVisiveisRef.current = desenhosVisiveis;
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
      // Desenhando vale a mesma regra, e as duas ferramentas nunca estão ligadas ao
      // mesmo tempo — o `App` desliga uma ao entrar na outra. A ordem aqui só existe
      // para que o dia em que isso mudar tenha uma resposta em vez de duas.
      if (desenhoRef.current.modo) {
        onVerticeDesenhoRef.current([e.lngLat.lng, e.lngLat.lat]);
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

    // Duplo clique encerra o traçado — o gesto que toda ferramenta de desenho tem, e
    // que só existe aqui porque o zoom de duplo clique está desligado enquanto se
    // desenha. Sem ele, terminar um polígono exige tirar a mão do mapa e achar um
    // botão, no meio de um gesto que é todo de mapa.
    map.on("dblclick", () => {
      if (!desenhoRef.current.modo) return;
      onEncerrarDesenhoRef.current(desenhoRef.current.modo === "poligono");
    });

    map.on("mousemove", (e) => {
      if (medicaoRef.current.modo || desenhoRef.current.modo) {
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
      if (ev.key === "Escape") {
        if (medicaoRef.current.modo) onEncerrarRef.current();
        if (desenhoRef.current.modo) onCancelarDesenhoRef.current();
        return;
      }
      // Enter encerra pelo teclado. Existe porque duplo clique num mapa não tem
      // equivalente para quem não usa mouse — e porque quem está digitando o raio do
      // buffer já está no teclado, e sair dele para clicar duas vezes é um passo a mais.
      // `false`: nenhum vértice foi duplicado, ao contrário do duplo clique.
      if (ev.key === "Enter" && desenhoRef.current.modo && desenhoRef.current.completo) {
        onEncerrarDesenhoRef.current(false);
      }
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
    assimQuePuder(map, () => applyVisibility(map, visible));
  }, [visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.fitBounds(focus.bbox, { padding: 48, duration: 1200, maxZoom: focus.maxZoom ?? 12 });
  }, [focus]);

  // Duplo clique e cursor: uma decisão só, valendo para as duas ferramentas.
  //
  // Cada efeito cuidava do seu, e o resultado passou a depender da ordem em que
  // rodavam: com o desenho ligado, o efeito da medição reabilitava o zoom um
  // instante antes de o do desenho desligá-lo de novo. Ter uma ferramenta ativa é
  // uma pergunta só, e por isso mora num lugar só.
  //
  // Desligar o zoom não é detalhe: marcar dois vértices próximos em sequência é o
  // gesto normal de quem contorna um terreno, e com o zoom ligado isso salta o mapa
  // para debaixo do cursor no meio do traçado.
  const ferramentaAtiva = medicao.modo !== null || desenho.modo !== null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (ferramentaAtiva) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    }
  }, [ferramentaAtiva]);

  // Desenha a medição na sua fonte.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    assimQuePuder(map, () =>
      escreverNaFonte(
        map,
        MEDICAO_SOURCE_ID,
        medicao.modo ? geometriaDaMedicao(medicao) : MEDICAO_VAZIA,
      ),
    );
  }, [medicao]);

  // O traçado em andamento. Fonte separada da dos desenhos salvos porque muda a cada
  // clique: numa fonte só, cada vértice novo reenviaria o acervo inteiro ao GPU.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const { vertices, anel } = tracadoParaDesenhar(desenho);
    assimQuePuder(map, () =>
      escreverNaFonte(
        map,
        TRACADO_SOURCE_ID,
        desenho.modo ? geometriaDoTracado(vertices, anel) : COLECAO_VAZIA,
      ),
    );
  }, [desenho]);

  // O acervo salvo. Muda quando alguém grava ou apaga algo, e não a cada clique.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    assimQuePuder(map, () => escreverNaFonte(map, DESENHOS_SOURCE_ID, desenhos));
  }, [desenhos]);

  // Ligar e desligar o acervo. É `visibility` e não uma fonte vazia de propósito: com
  // a fonte vazia, religar exigiria buscar tudo de novo, e o mapa piscaria em cada
  // clique do interruptor. O dado continua carregado; o que muda é o que se pinta.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const valor = desenhosVisiveis ? "visible" : "none";
    assimQuePuder(map, () => {
      if (!map.getLayer(IDS_CAMADAS_DESENHOS[0])) return false;
      for (const id of IDS_CAMADAS_DESENHOS) map.setLayoutProperty(id, "visibility", valor);
      return true;
    });
  }, [desenhosVisiveis]);

  useEffect(() => {
    highlightsRef.current = highlights ?? null;
    const map = mapRef.current;
    if (!map) return;
    assimQuePuder(map, () => applyHighlights(map, highlightsRef.current));
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
      // O acervo e o traçado pelo mesmo motivo — e aqui o esquecimento seria pior:
      // trocar o tema apagaria da tela desenhos que continuam salvos no banco, o que
      // parece perda de dado a quem olha.
      const desenhoAtual = desenhoRef.current;
      const fonteTracado = map.getSource(TRACADO_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      const tracado = tracadoParaDesenhar(desenhoAtual);
      fonteTracado?.setData(
        desenhoAtual.modo ? geometriaDoTracado(tracado.vertices, tracado.anel) : COLECAO_VAZIA,
      );
      escreverNaFonte(map, DESENHOS_SOURCE_ID, desenhosRef.current);
      // O style novo nasce com as camadas visíveis: sem isto, trocar o tema religaria
      // um acervo que a pessoa tinha desligado.
      const valor = desenhosVisiveisRef.current ? "visible" : "none";
      for (const id of IDS_CAMADAS_DESENHOS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", valor);
      }
    });
  }, [theme, satellite, satelliteOverlay]);

  return <div ref={containerRef} className="map" />;
}

/** Aplica a visibilidade. Devolve `false` enquanto o style não tem as camadas. */
function applyVisibility(map: maplibregl.Map, visible: Record<string, boolean>) {
  let achou = false;
  for (const c of camadas) {
    const value = visible[c.id] ? "visible" : "none";
    for (const suffix of SUFIXOS_SUBCAMADA) {
      const id = c.id + suffix;
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", value);
        achou = true;
      }
    }
  }
  return achou;
}
