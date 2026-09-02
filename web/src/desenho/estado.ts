/**
 * A máquina do traçado: o que acontece entre ativar uma ferramenta e ter geometria.
 *
 * Separada de `geometria.ts` (que só valida e converte) e do `MapView` (que só
 * repassa cliques) porque é aqui que mora a única regra com jeito de produto: **um
 * clique errado não pode obrigar a recomeçar**. Daí `desfazer`, que é a razão de
 * existir um estado em vez de um array solto no componente.
 */
import {
  circuloAproximado,
  paraGeoJSON,
  validar,
  VERTICES_MINIMOS,
  type Coordenada,
  type ModoDesenho,
} from "./geometria";

export interface EstadoDesenho {
  modo: ModoDesenho | null;
  coordenadas: Coordenada[];
  /** Raio em metros, só no modo buffer. */
  raioM: number | null;
  /** `true` quando já dá para salvar — o painel usa isto para habilitar o botão. */
  completo: boolean;
  /** Por que ainda não dá para salvar. `null` quando dá, ou quando nem começou. */
  impedimento: string | null;
}

export const DESENHO_OCIOSO: EstadoDesenho = {
  modo: null,
  coordenadas: [],
  raioM: null,
  completo: false,
  impedimento: null,
};

export function criarEstadoDesenho(
  modo: ModoDesenho | null,
  coordenadas: readonly Coordenada[] = [],
  raioM: number | null = null,
): EstadoDesenho {
  if (!modo) return DESENHO_OCIOSO;

  const base = { modo, coordenadas: [...coordenadas], raioM };
  if (coordenadas.length === 0) {
    // Nem começou: não é impedimento, é o estado inicial. A distinção importa porque
    // o painel mostra o impedimento como aviso, e avisar antes do primeiro clique
    // seria repreender quem ainda não fez nada.
    return { ...base, completo: false, impedimento: null };
  }

  const problema = validar(modo, coordenadas, raioM);
  return { ...base, completo: problema === null, impedimento: problema?.motivo ?? null };
}

/**
 * Acrescenta um vértice.
 *
 * No modo ponto — e no buffer, que também tem um centro só — o novo clique SUBSTITUI o
 * anterior em vez de acumular: quem clicou no lugar errado está corrigindo, não
 * desenhando. Só o polígono acumula.
 */
export function comVertice(estado: EstadoDesenho, coordenada: Coordenada): EstadoDesenho {
  if (!estado.modo) return estado;
  const acumula = estado.modo === "poligono";
  const coordenadas = acumula ? [...estado.coordenadas, coordenada] : [coordenada];
  return criarEstadoDesenho(estado.modo, coordenadas, estado.raioM);
}

/** Desfaz o último vértice. Sem isto, um clique errado obriga a recomeçar o traçado. */
export function semUltimoVertice(estado: EstadoDesenho): EstadoDesenho {
  if (!estado.modo || estado.coordenadas.length === 0) return estado;
  return criarEstadoDesenho(estado.modo, estado.coordenadas.slice(0, -1), estado.raioM);
}

export function comRaio(estado: EstadoDesenho, raioM: number | null): EstadoDesenho {
  return criarEstadoDesenho(estado.modo, estado.coordenadas, raioM);
}

/**
 * O que vai ao servidor, ou `null` se o traçado ainda não fecha.
 *
 * No buffer sai o CENTRO, um Point — e não o círculo. A geometria definitiva é gerada
 * pelo PostGIS com `ST_Buffer` sobre `geography` (Decisão 2 do DESIGN), e mandar o
 * círculo aproximado daqui faria o servidor guardar a aproximação em vez de calcular
 * a boa. O raio viaja ao lado, em `raioM`.
 */
export function geometriaParaSalvar(estado: EstadoDesenho): GeoJSON.Geometry | null {
  if (!estado.modo || !estado.completo) return null;
  if (estado.modo === "buffer") {
    return { type: "Point", coordinates: estado.coordenadas[0] };
  }
  return paraGeoJSON(estado.modo, estado.coordenadas);
}

/**
 * O que o mapa desenha do traçado: os vértices marcados e o anel a fechar.
 *
 * Separa as duas coisas porque no buffer elas divergem — o vértice é UM (o centro que
 * a pessoa clicou) e o anel tem 64 pontos que ninguém clicou. Desenhar bolinha em
 * cada um deles sugeriria que dá para arrastá-los.
 */
export function tracadoParaDesenhar(estado: EstadoDesenho): {
  vertices: Coordenada[];
  anel: Coordenada[] | null;
} {
  if (!estado.modo || estado.coordenadas.length === 0) return { vertices: [], anel: null };
  if (estado.modo === "buffer") {
    const anel =
      estado.raioM && estado.raioM > 0
        ? circuloAproximado(estado.coordenadas[0], estado.raioM)
        : null;
    return { vertices: [estado.coordenadas[0]], anel };
  }
  return {
    vertices: [...estado.coordenadas],
    anel: estado.modo === "poligono" && estado.coordenadas.length >= 2 ? estado.coordenadas : null,
  };
}

/** Quantos vértices ainda faltam. Zero quando já dá para salvar. */
export function faltam(estado: EstadoDesenho): number {
  if (!estado.modo) return 0;
  return Math.max(0, VERTICES_MINIMOS[estado.modo] - estado.coordenadas.length);
}
