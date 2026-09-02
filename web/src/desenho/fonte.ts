/**
 * O que o MapLibre desenha: os desenhos salvos e o traçado em andamento.
 *
 * São DUAS fontes, e a separação não é arrumação: os salvos vêm do servidor e mudam
 * quando alguém grava algo; o traçado muda a cada clique. Numa fonte só, cada vértice
 * novo obrigaria a reenviar o acervo inteiro ao GPU.
 *
 * Segue o padrão de `map/selection.ts` e `map/medicao.ts` — fonte GeoJSON, nunca
 * tile. Desenho de cliente **não vai para o host de tiles**, que é aberto na internet
 * (medido em 2026-08-31: `206` sem credencial nenhuma) e só recebe dado público.
 *
 * Os salvos chegam prontos: `/api/desenhos/geometrias` já devolve `FeatureCollection`,
 * com `cor` nas propriedades. Converter de novo aqui daria duas montagens da mesma
 * coleção — e a de baixo, a do servidor, é a que o `properties` das camadas espera.
 */
import type { GeoJSONSourceSpecification, LayerSpecification } from "maplibre-gl";

export const DESENHOS_SOURCE_ID = "desenhos";
export const TRACADO_SOURCE_ID = "desenho-tracado";

export const COLECAO_VAZIA: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Laranja do traçado, o mesmo da medição — e de propósito.
 *
 * As duas são a mesma coisa para quem olha: anotação do usuário sobre o mapa,
 * enquanto está sendo feita. Cor diferente sugeriria natureza diferente. Já o
 * desenho SALVO usa a cor que o cliente escolheu, que vem do dado.
 */
const TRACO = "#ff7a1a";

export const fonteDesenhos: GeoJSONSourceSpecification = { type: "geojson", data: COLECAO_VAZIA };
export const fonteTracado: GeoJSONSourceSpecification = { type: "geojson", data: COLECAO_VAZIA };

/**
 * A cor sai de `properties.cor` de cada feição, com `["get", "cor"]`.
 *
 * Sem isso seria uma camada por desenho — 500 camadas no volume-alvo, o que o
 * MapLibre aguenta mal e recompila a cada mudança. Uma camada, a cor vindo do dado.
 */
export const camadasDesenhos: LayerSpecification[] = [
  {
    id: "desenhos-area",
    type: "fill",
    source: DESENHOS_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": ["get", "cor"], "fill-opacity": 0.2 },
  },
  {
    id: "desenhos-contorno",
    type: "line",
    source: DESENHOS_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Polygon"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "cor"], "line-width": 2 },
  },
  {
    id: "desenhos-ponto",
    type: "circle",
    source: DESENHOS_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 6,
      "circle-color": ["get", "cor"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  },
];

export const camadasTracado: LayerSpecification[] = [
  {
    id: "desenho-tracado-area",
    type: "fill",
    source: TRACADO_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": TRACO, "fill-opacity": 0.15 },
  },
  {
    id: "desenho-tracado-linha",
    type: "line",
    source: TRACADO_SOURCE_ID,
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-cap": "round", "line-join": "round" },
    // Tracejado separa o que ainda está sendo feito do que já está salvo — a
    // diferença que a cor sozinha não daria, porque um desenho salvo pode ser laranja.
    paint: { "line-color": TRACO, "line-width": 2.5, "line-dasharray": [2, 1.5] },
  },
  {
    id: "desenho-tracado-vertice",
    type: "circle",
    source: TRACADO_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 5,
      "circle-color": "#ffffff",
      "circle-stroke-color": TRACO,
      "circle-stroke-width": 2.5,
    },
  },
];

/**
 * O traçado em andamento: os vértices marcados, e o anel que eles (ou o raio) formam.
 *
 * Recebe os dois separados porque no buffer eles divergem — um vértice clicado, 64
 * pontos de círculo — e quem sabe dessa diferença é o `estado.ts`, com
 * `tracadoParaDesenhar`. Aqui só se traduz para o que o MapLibre consome.
 *
 * O anel fecha repetindo o primeiro ponto, como o GeoJSON exige; sem isso o MapLibre
 * recebe polígono degenerado.
 */
export function geometriaDoTracado(
  vertices: readonly [number, number][],
  anel: readonly [number, number][] | null = null,
): GeoJSON.FeatureCollection {
  if (vertices.length === 0 && !anel) return COLECAO_VAZIA;

  const feicoes: GeoJSON.Feature[] = vertices.map((c) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: c },
    properties: {},
  }));

  if (anel && anel.length >= 3) {
    feicoes.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...anel, anel[0]]] },
      properties: {},
    });
  }
  if (anel && anel.length >= 2) {
    feicoes.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [...anel, anel[0]] },
      properties: {},
    });
  }
  return { type: "FeatureCollection", features: feicoes };
}
