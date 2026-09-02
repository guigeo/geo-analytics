/**
 * Geometria dos desenhos do cliente: tipos, validação e conversão para GeoJSON.
 *
 * Puro, fora do React e do MapLibre, pelo mesmo motivo de `map/medicao.ts`: dá para
 * conferir vértice a vértice sem subir navegador nem WebGL. O cálculo de área vem de
 * lá em vez de ser reescrito — é o mesmo problema, já conferido contra o PostGIS
 * (erro de -0,11% a +0,45%), e duas implementações da mesma esfera divergiriam no
 * dia em que só uma fosse corrigida.
 *
 * **O que o navegador produz é WGS84**, e é isso que sai daqui. A conversão para
 * SIRGAS 2000 — o CRS da casa — acontece no servidor, num lugar só.
 */
import { areaEmMetrosQuadrados, formatarMedida, type Coordenada } from "@/map/medicao";

export type { Coordenada };

/** Os três modos. `buffer` produz um polígono, então só existe como modo, não como saída. */
export type ModoDesenho = "ponto" | "poligono" | "buffer";

/** O que o servidor guarda. `poligono` cobre também o resultado de um buffer. */
export type TipoDesenho = "ponto" | "poligono" | "buffer";

export interface Desenho {
  id: string;
  tipo: TipoDesenho;
  nome: string;
  categoria: string | null;
  cor: string;
  observacao: string | null;
  origem: "desenho" | "carga";
  geometria: GeoJSON.Geometry;
  area_m2: number | null;
  raio_m: number | null;
  criado_em: string;
  atualizado_em: string;
}

/** Vértices mínimos por modo — o mesmo contrato de `VERTICES_MINIMOS` da medição. */
export const VERTICES_MINIMOS: Record<ModoDesenho, number> = {
  ponto: 1,
  buffer: 1,
  poligono: 3,
};

/**
 * Teto de payload, não de geografia.
 *
 * Espelha o `MAX_VERTICES` do backend e o CHECK da tabela. Aqui ele existe para o
 * usuário saber antes de a requisição sair; lá para o banco não aceitar o que passar
 * por cima. Três travas para o mesmo número, porque só a de trás não explica nada e
 * só a da frente não protege.
 */
export const MAX_VERTICES = 50_000;

export interface Invalidez {
  motivo: string;
}

/**
 * Diz se o traçado pode virar desenho, e por que não quando não pode.
 *
 * Devolve o motivo em vez de um booleano porque a mensagem é a metade útil: um
 * polígono recusado sem explicação leva a pessoa a clicar de novo do mesmo jeito.
 */
export function validar(modo: ModoDesenho, coordenadas: readonly Coordenada[]): Invalidez | null {
  const minimo = VERTICES_MINIMOS[modo];
  if (coordenadas.length < minimo) {
    return {
      motivo:
        minimo === 1
          ? "Clique num ponto do mapa."
          : `Uma área precisa de pelo menos ${minimo} pontos.`,
    };
  }
  if (coordenadas.length > MAX_VERTICES) {
    return { motivo: `O desenho tem ${coordenadas.length} pontos; o limite é ${MAX_VERTICES}.` };
  }
  if (modo === "poligono") {
    if (temVerticesRepetidosSeguidos(coordenadas)) {
      return { motivo: "Há pontos repetidos no traçado." };
    }
    if (autoIntersecta(coordenadas)) {
      return { motivo: "O contorno cruza a si mesmo. Refaça o trecho que se cruza." };
    }
  }
  return null;
}

/** Dois cliques no mesmo lugar produzem anel degenerado, que o PostGIS recusa. */
function temVerticesRepetidosSeguidos(coordenadas: readonly Coordenada[]): boolean {
  return coordenadas.some((c, i) => {
    if (i === 0) return false;
    const anterior = coordenadas[i - 1];
    return c[0] === anterior[0] && c[1] === anterior[1];
  });
}

/**
 * Um polígono que cruza a si mesmo é inválido no PostGIS (`ST_IsValid`).
 *
 * Recusar aqui é mais barato que deixar o INSERT falhar: lá o erro chega como uma
 * violação de constraint, com texto que o usuário não entende e sem indicar qual
 * trecho está errado. O anel é fechado antes de testar, porque o segmento de volta
 * também pode cruzar — é justamente o mais fácil de errar arrastando o último ponto.
 */
export function autoIntersecta(coordenadas: readonly Coordenada[]): boolean {
  const anel = [...coordenadas, coordenadas[0]];
  for (let i = 0; i < anel.length - 1; i++) {
    for (let j = i + 2; j < anel.length - 1; j++) {
      // Vizinhos compartilham vértice por construção, e o primeiro com o último
      // fecham o anel: nenhum dos dois pares é cruzamento.
      if (i === 0 && j === anel.length - 2) continue;
      if (segmentosCruzam(anel[i], anel[i + 1], anel[j], anel[j + 1])) return true;
    }
  }
  return false;
}

function orientacao(a: Coordenada, b: Coordenada, c: Coordenada): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(v) < 1e-12 ? 0 : Math.sign(v);
}

function segmentosCruzam(a: Coordenada, b: Coordenada, c: Coordenada, d: Coordenada): boolean {
  const o1 = orientacao(a, b, c);
  const o2 = orientacao(a, b, d);
  const o3 = orientacao(c, d, a);
  const o4 = orientacao(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

/**
 * Traduz o traçado para a geometria que vai ao servidor.
 *
 * O anel do polígono fecha repetindo o primeiro vértice, como o GeoJSON exige — a
 * mesma regra que `geometriaDaMedicao` aplica para desenhar na tela.
 */
export function paraGeoJSON(
  modo: ModoDesenho,
  coordenadas: readonly Coordenada[],
): GeoJSON.Geometry {
  if (modo === "ponto") return { type: "Point", coordinates: coordenadas[0] };
  return { type: "Polygon", coordinates: [[...coordenadas, coordenadas[0]]] };
}

/** A área do traçado em texto legível, ou `null` enquanto não há área a mostrar. */
export function areaFormatada(
  modo: ModoDesenho,
  coordenadas: readonly Coordenada[],
): string | null {
  if (modo === "ponto" || coordenadas.length < 3) return null;
  return formatarMedida("area", areaEmMetrosQuadrados(coordenadas));
}

/**
 * A caixa que envolve a geometria, no formato do `fitBounds`: oeste, sul, leste, norte.
 *
 * Existe para a lista poder voar até um desenho sem pedir nada ao servidor — a
 * geometria já veio junto de cada item. Um ponto devolve caixa degenerada (os quatro
 * cantos iguais), e o `fitBounds` lida com isso pelo `maxZoom`, sem caso especial.
 */
export function bboxDe(geometria: GeoJSON.Geometry): [number, number, number, number] | null {
  let oeste = Infinity;
  let sul = Infinity;
  let leste = -Infinity;
  let norte = -Infinity;

  const visitar = (valor: unknown): void => {
    if (!Array.isArray(valor)) return;
    if (typeof valor[0] === "number" && typeof valor[1] === "number") {
      const [lon, lat] = valor as [number, number];
      oeste = Math.min(oeste, lon);
      leste = Math.max(leste, lon);
      sul = Math.min(sul, lat);
      norte = Math.max(norte, lat);
      return;
    }
    for (const item of valor) visitar(item);
  };

  if (!("coordinates" in geometria)) return null;
  visitar(geometria.coordinates);
  return Number.isFinite(oeste) ? [oeste, sul, leste, norte] : null;
}
