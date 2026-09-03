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
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
} from "maplibre-gl";

import { SEM_CATEGORIA } from "./camadas";

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
/**
 * Que geometria cada camada do acervo pinta. Existe como dado, e não só dentro das
 * specs abaixo, porque o filtro precisa ser REMONTADO quando alguém esconde um desenho
 * — e remontar exige saber qual era a metade fixa do filtro.
 */
const GEOMETRIA_DA_CAMADA = {
  "desenhos-area": "Polygon",
  "desenhos-contorno": "Polygon",
  "desenhos-ponto": "Point",
} as const;

export const IDS_CAMADAS_DESENHOS = Object.keys(
  GEOMETRIA_DA_CAMADA,
) as (keyof typeof GEOMETRIA_DA_CAMADA)[];

/**
 * A categoria de uma feição, com nulo e vazio caindo no mesmo balde.
 *
 * É a mesma regra do `categoriaDe` em `camadas.ts`, dita outra vez em expressão do
 * MapLibre porque é aqui que ela precisa valer. As duas têm de concordar: se o painel
 * agrupasse um desenho sem categoria e o mapa não, desligar "Sem categoria" deixaria o
 * desenho aceso — e o painel estaria mentindo sobre o mapa.
 *
 * O `coalesce` troca nulo por vazio, e o `case` manda os dois para o mesmo lugar.
 */
const CATEGORIA_DA_FEICAO: ExpressionSpecification = [
  "case",
  ["==", ["coalesce", ["get", "categoria"], ""], ""],
  SEM_CATEGORIA,
  ["get", "categoria"],
];

/**
 * O filtro de uma camada do acervo, escondendo o que foi pedido.
 *
 * Esconder por FILTRO e não por `visibility` é o que torna o liga/desliga unitário: a
 * visibilidade é da camada inteira, e as três camadas servem os quinhentos desenhos.
 * O id vem de `properties.id`, que o servidor põe em cada feição.
 *
 * São DUAS dimensões, e de propósito não viram uma: a categoria é a *camada*, o id é a
 * *feição* dentro dela. Traduzir categoria escondida para uma lista de ids daria a
 * mesma tela e perderia a distinção — religar a camada teria de adivinhar quais ids a
 * pessoa havia escondido um a um antes de desligá-la.
 */
export function filtroDoAcervo(
  camada: keyof typeof GEOMETRIA_DA_CAMADA,
  ocultos: readonly string[] = [],
  categoriasOcultas: readonly string[] = [],
): FilterSpecification {
  // `ExpressionSpecification` e não `FilterSpecification`: o segundo ainda inclui as
  // formas antigas (`["!has", …]`), que o `all` não aceita como operando.
  const base: ExpressionSpecification = ["==", ["geometry-type"], GEOMETRIA_DA_CAMADA[camada]];
  const clausulas: ExpressionSpecification[] = [base];
  if (ocultos.length > 0) {
    clausulas.push(["!", ["in", ["get", "id"], ["literal", [...ocultos]]]]);
  }
  if (categoriasOcultas.length > 0) {
    clausulas.push(["!", ["in", CATEGORIA_DA_FEICAO, ["literal", [...categoriasOcultas]]]]);
  }
  return clausulas.length === 1 ? base : ["all", ...clausulas];
}

export const camadasDesenhos: LayerSpecification[] = [
  {
    id: "desenhos-area",
    type: "fill",
    source: DESENHOS_SOURCE_ID,
    filter: filtroDoAcervo("desenhos-area"),
    paint: { "fill-color": ["get", "cor"], "fill-opacity": 0.2 },
  },
  {
    id: "desenhos-contorno",
    type: "line",
    source: DESENHOS_SOURCE_ID,
    filter: filtroDoAcervo("desenhos-contorno"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "cor"], "line-width": 2 },
  },
  {
    id: "desenhos-ponto",
    type: "circle",
    source: DESENHOS_SOURCE_ID,
    filter: filtroDoAcervo("desenhos-ponto"),
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
