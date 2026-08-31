/**
 * Medição de distância e área sobre o mapa.
 *
 * O último dos dezesseis artefatos do `webgis-core` (ver `webgis/docs/HERANCA.md`,
 * §1). Lá ele era opcional, ligado por `capabilities` de cada aplicação. Aqui não
 * é: **medir é da casca, e todo cliente recebe**. A regra 1 do ADR-0001 diz que o
 * que *difere* entre clientes é dado, não que tudo precise ser configuração —
 * ferramenta que nenhum cliente quer desligar não é ponto de variação, e virar
 * campo de configuração só criaria uma chave para alguém errar.
 *
 * Entrou traduzido, não copiado: a decisão de 2026-08-29 (HERANCA §7, pendência 2)
 * é português em tudo, sem fronteira de idioma dentro do código.
 *
 * O cálculo é geodésico e mora fora do React e do MapLibre de propósito — dá para
 * conferir metro a metro sem subir navegador nem WebGL, que é o mesmo motivo pelo
 * qual `estilo.ts` não vive dentro do `MapView`.
 */
import type { GeoJSONSourceSpecification, LayerSpecification } from "maplibre-gl";

/** [longitude, latitude] — a ordem do GeoJSON e do MapLibre, não a do senso comum. */
export type Coordenada = [number, number];

export type ModoMedicao = "distancia" | "area";

export interface EstadoMedicao {
  modo: ModoMedicao | null;
  coordenadas: Coordenada[];
  /** Metros ou metros quadrados. `null` enquanto faltam vértices. */
  valor: number | null;
  /** O mesmo valor já em unidade legível. `null` pelo mesmo motivo. */
  formatado: string | null;
}

/**
 * Raio médio da Terra (IUGG).
 *
 * O planeta entra como esfera, e o erro disso foi medido contra o PostGIS — que
 * calcula no elipsoide — e não estimado: **de -0,11% a +0,45%** nos quatro casos
 * de `medicao.test.ts`. É a mesma aproximação que o Turf.js usa, e num terreno de
 * 500 m² ela vale pouco mais de um metro quadrado.
 *
 * O que isso obriga é o painel não prometer precisão de levantamento: a ferramenta
 * é para estimar em tela, não para fechar escritura. Trocar por Vincenty é possível
 * e não se paga enquanto ninguém pedir.
 */
const RAIO_DA_TERRA_M = 6_371_008.8;
const GRAUS_PARA_RADIANOS = Math.PI / 180;

/** Vértices mínimos para haver o que medir: dois para uma linha, três para uma área. */
export const VERTICES_MINIMOS: Record<ModoMedicao, number> = { distancia: 2, area: 3 };

/**
 * Normaliza a diferença de longitude para (-π, π].
 *
 * Sem isso, um polígono que cruza a antimeridiana soma uma volta inteira do globo
 * e devolve uma área absurda. Não acontece no Brasil; acontece no dia em que
 * alguém arrastar o mapa duas voltas para o lado, que o MapLibre permite.
 */
function deltaDeLongitudeNormalizado(delta: number) {
  if (delta > Math.PI) return delta - 2 * Math.PI;
  if (delta < -Math.PI) return delta + 2 * Math.PI;
  return delta;
}

/** Distância acumulada pela linha, por haversine, em metros. */
export function distanciaEmMetros(coordenadas: readonly Coordenada[]) {
  let distancia = 0;

  for (let i = 1; i < coordenadas.length; i += 1) {
    const [lonAnterior, latAnterior] = coordenadas[i - 1];
    const [lon, lat] = coordenadas[i];
    const deltaLat = (lat - latAnterior) * GRAUS_PARA_RADIANOS;
    const deltaLon = (lon - lonAnterior) * GRAUS_PARA_RADIANOS;
    const latAnteriorRad = latAnterior * GRAUS_PARA_RADIANOS;
    const latRad = lat * GRAUS_PARA_RADIANOS;
    const h =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(latAnteriorRad) * Math.cos(latRad) * Math.sin(deltaLon / 2) ** 2;

    distancia += 2 * RAIO_DA_TERRA_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  return distancia;
}

/**
 * Área do polígono fechado pelos vértices, em metros quadrados.
 *
 * Excesso esférico: o anel é percorrido fechando o último vértice no primeiro —
 * quem chama não precisa repetir o ponto inicial. O valor sai em módulo, então a
 * ordem dos vértices (horária ou anti-horária) não muda o resultado.
 */
export function areaEmMetrosQuadrados(coordenadas: readonly Coordenada[]) {
  if (coordenadas.length < 3) return 0;

  let soma = 0;
  for (let i = 0; i < coordenadas.length; i += 1) {
    const [lon, lat] = coordenadas[i];
    const [proximaLon, proximaLat] = coordenadas[(i + 1) % coordenadas.length];
    const deltaLon = deltaDeLongitudeNormalizado((proximaLon - lon) * GRAUS_PARA_RADIANOS);
    soma +=
      deltaLon *
      (2 + Math.sin(lat * GRAUS_PARA_RADIANOS) + Math.sin(proximaLat * GRAUS_PARA_RADIANOS));
  }

  return Math.abs((soma * RAIO_DA_TERRA_M ** 2) / 2);
}

function formatarNumero(valor: number, casas: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: casas,
    minimumFractionDigits: casas,
  }).format(valor);
}

/**
 * Escolhe a unidade pela grandeza: metro embaixo, quilômetro em cima.
 *
 * O corte de área é em 1 km² (1.000.000 m²) e não em 10.000 m²: hectare seria a
 * unidade natural de terreno, mas mistura três unidades numa leitura só e obriga
 * quem lê a converter de cabeça para comparar dois números.
 */
export function formatarMedida(modo: ModoMedicao, valor: number) {
  if (modo === "distancia") {
    return valor < 1_000
      ? `${formatarNumero(valor, 0)} m`
      : `${formatarNumero(valor / 1_000, 2)} km`;
  }

  return valor < 1_000_000
    ? `${formatarNumero(valor, 0)} m²`
    : `${formatarNumero(valor / 1_000_000, 2)} km²`;
}

/**
 * O estado completo da medição a partir do modo e dos vértices.
 *
 * Função pura: o `App` guarda modo e vértices, e tudo o que a tela mostra sai
 * daqui. Enquanto faltarem vértices, `valor` e `formatado` são `null` — a
 * distinção entre "ainda não dá para medir" e "mediu zero" é o que o painel usa
 * para pedir mais pontos em vez de anunciar 0 m.
 */
export function criarEstadoMedicao(
  modo: ModoMedicao | null,
  coordenadas: readonly Coordenada[] = [],
): EstadoMedicao {
  if (!modo) return { modo: null, coordenadas: [], valor: null, formatado: null };

  if (coordenadas.length < VERTICES_MINIMOS[modo]) {
    return { modo, coordenadas: [...coordenadas], valor: null, formatado: null };
  }

  const valor =
    modo === "distancia" ? distanciaEmMetros(coordenadas) : areaEmMetrosQuadrados(coordenadas);

  return { modo, coordenadas: [...coordenadas], valor, formatado: formatarMedida(modo, valor) };
}

// ---------------------------------------------------------------------------
// O desenho no mapa
// ---------------------------------------------------------------------------

export const MEDICAO_SOURCE_ID = "medicao";

export const MEDICAO_VAZIA: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Laranja fixo, e não a cor do cliente.
 *
 * Anotação de ferramenta precisa de duas coisas que a marca não garante: sobreviver
 * ao basemap claro, ao escuro e à imagem de satélite, e não ser confundida com a
 * seleção (o ciano de `selection.ts`) nem com as camadas de dado, cuja cor vem da
 * configuração e varia por cliente. Marca aqui seria a cor colidindo com o dado
 * exatamente no cliente em que a marca é azul-acinzentado.
 */
const TRACO = "#ff7a1a";

/** Traduz o estado para o que o MapLibre desenha: área, linha e vértices. */
export function geometriaDaMedicao(estado: EstadoMedicao): GeoJSON.FeatureCollection {
  const { modo, coordenadas } = estado;
  if (!modo || coordenadas.length === 0) return MEDICAO_VAZIA;

  const feicoes: GeoJSON.Feature[] = coordenadas.map((c) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: c },
    properties: {},
  }));

  // A área fecha o anel repetindo o primeiro vértice, como o GeoJSON exige — e o
  // polígono só existe a partir de três, senão o MapLibre recebe anel degenerado.
  if (modo === "area" && coordenadas.length >= 3) {
    feicoes.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...coordenadas, coordenadas[0]]] },
      properties: {},
    });
  }

  if (coordenadas.length >= 2) {
    const linha = modo === "area" ? [...coordenadas, coordenadas[0]] : coordenadas;
    feicoes.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: linha },
      properties: {},
    });
  }

  return { type: "FeatureCollection", features: feicoes };
}

export const fonteMedicao: GeoJSONSourceSpecification = { type: "geojson", data: MEDICAO_VAZIA };

export const camadasMedicao: LayerSpecification[] = [
  {
    id: "medicao-area",
    type: "fill",
    source: MEDICAO_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": TRACO, "fill-opacity": 0.15 },
  },
  {
    id: "medicao-linha",
    type: "line",
    source: MEDICAO_SOURCE_ID,
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": TRACO, "line-width": 2.5 },
  },
  {
    id: "medicao-vertice",
    type: "circle",
    source: MEDICAO_SOURCE_ID,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 5,
      "circle-color": "#ffffff",
      "circle-stroke-color": TRACO,
      "circle-stroke-width": 2.5,
    },
  },
];
