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

/**
 * Teto do raio do buffer: 50 km.
 *
 * Não é limite geográfico — a Decisão 4 do DESIGN diz para avisar, não recusar, e um
 * buffer de 64 segmentos custa o mesmo payload em qualquer raio. É limite de CAMPO DE
 * TEXTO, que é outra coisa: digitar 500000 querendo 500 é escorregão, não intenção, e
 * a diferença entre os dois é invisível depois de salvo. 50 km é o maior que foi
 * medido (49.185 setores em 640 ms), então é o maior que se sabe que responde.
 */
export const MAX_RAIO_M = 50_000;

export interface Invalidez {
  motivo: string;
}

/**
 * Diz se o traçado pode virar desenho, e por que não quando não pode.
 *
 * Devolve o motivo em vez de um booleano porque a mensagem é a metade útil: um
 * polígono recusado sem explicação leva a pessoa a clicar de novo do mesmo jeito.
 */
export function validar(
  modo: ModoDesenho,
  coordenadas: readonly Coordenada[],
  raioM: number | null = null,
): Invalidez | null {
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
  // O buffer é o único modo em que a geometria não sai só dos cliques: sem raio há um
  // centro e mais nada. A regra vive aqui junto das outras, e não no `estado.ts`, para
  // "o que falta para poder salvar" ter um dono só.
  if (modo === "buffer") {
    if (raioM === null || Number.isNaN(raioM)) return { motivo: "Informe o raio em metros." };
    if (raioM <= 0) return { motivo: "O raio precisa ser maior que zero." };
    if (raioM > MAX_RAIO_M) {
      return { motivo: `O raio máximo é ${MAX_RAIO_M / 1000} km.` };
    }
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

/**
 * Círculo geodésico em volta de um ponto, para PRÉ-VISUALIZAR enquanto se digita o raio.
 *
 * **Não é a geometria que fica.** Quem gera a definitiva é o PostGIS, com
 * `ST_Buffer` sobre `geography`, no momento de salvar (Decisão 2 do DESIGN): lá o
 * cálculo é sobre o elipsoide, aqui sobre uma esfera de raio médio — a mesma
 * aproximação de `map/medicao.ts`, cujo erro foi medido em -0,11% a +0,45%. Meio
 * metro num raio de 500 m não muda o que se vê na tela, e mudaria o que se responde
 * sobre a área; por isso os dois cálculos existem, cada um onde importa.
 *
 * 64 segmentos: abaixo disso o polígono aparece como polígono num zoom de rua.
 */
export function circuloAproximado(centro: Coordenada, raioM: number): Coordenada[] {
  const SEGMENTOS = 64;
  const RAIO_DA_TERRA_M = 6_371_008.8;
  const [lon, lat] = centro;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const angular = raioM / RAIO_DA_TERRA_M;

  const pontos: Coordenada[] = [];
  for (let i = 0; i < SEGMENTOS; i += 1) {
    // Fórmula do ponto de destino: a partir do centro, a `angular` radianos, no rumo
    // `azimute`. Trabalhar em rumo e não em "lon + delta" é o que mantém o círculo
    // redondo longe do equador — em latitude alta, um grau de longitude é bem mais
    // curto que um de latitude, e somar deltas iguais daria uma elipse.
    const azimute = (2 * Math.PI * i) / SEGMENTOS;
    const latPonto = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(azimute),
    );
    const lonPonto =
      lonRad +
      Math.atan2(
        Math.sin(azimute) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(latPonto),
      );
    pontos.push([(lonPonto * 180) / Math.PI, (latPonto * 180) / Math.PI]);
  }
  return pontos;
}

/** A área do traçado em texto legível, ou `null` enquanto não há área a mostrar. */
export function areaFormatada(
  modo: ModoDesenho,
  coordenadas: readonly Coordenada[],
  raioM: number | null = null,
): string | null {
  if (modo === "buffer") {
    if (coordenadas.length === 0 || !raioM || raioM <= 0) return null;
    // Do círculo aproximado, e não de πr²: é a área da geometria que está NA TELA,
    // e é ela que a pessoa está conferindo. O número definitivo vem do servidor
    // depois de salvar, e difere em fração de por cento.
    return formatarMedida("area", areaEmMetrosQuadrados(circuloAproximado(coordenadas[0], raioM)));
  }
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
