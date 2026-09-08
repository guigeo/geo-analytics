/**
 * A escala de cor do contraste interno.
 *
 * **É a escala DESTE desenho, não uma escala global.** No catálogo, a pintura por
 * número tem mínimo e máximo fixos (`h3_domicilios` vai de 0 a 820, o p99 medido), e
 * ali isso é certo: a cor significa a mesma coisa em qualquer lugar do mapa. Aqui é o
 * contrário — o bloco existe para mostrar a variação DENTRO do recorte, e uma escala
 * global esmagaria num tom só justamente o desenho homogêneo que precisa parecer
 * homogêneo, ou o desenho todo pobre que precisa mostrar seu próprio contraste.
 *
 * O preço é que duas telas com a mesma cor não significam o mesmo valor, e a legenda
 * tem de dizer isso com todas as letras. Cor comparável entre desenhos seria outra
 * feature, e passaria por escolher a régua (município? país?) — que é decisão de
 * produto, não de componente.
 */

/** Os cinco tons da escala, do menor ao maior. Mesma família azul do `h3_domicilios`. */
export const TONS = ["#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a8a"] as const;

/** Setor sem valor não é setor de valor zero — cinza, e a legenda o nomeia. */
export const SEM_VALOR = "#94a3b8";

export interface Escala {
  minimo: number;
  maximo: number;
  /** Os limites superiores de cada tom, para a legenda desenhar a mesma régua. */
  cortes: number[];
  cor: (valor: number | null | undefined) => string;
}

/**
 * Divide o intervalo observado em cinco faixas iguais.
 *
 * Faixas iguais e não quantis: quantil sempre pinta um quinto dos setores de cada cor,
 * inclusive quando todos valem quase a mesma coisa — e aí a tela inventa um contraste
 * que o dado não tem. O bloco perde a graça se mentir para o lado do drama.
 */
export function escalaDe(valores: readonly (number | null | undefined)[]): Escala {
  const numeros = valores.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const minimo = numeros.length ? Math.min(...numeros) : 0;
  const maximo = numeros.length ? Math.max(...numeros) : 0;
  const amplitude = maximo - minimo;
  const cortes = TONS.map((_, i) => minimo + (amplitude * (i + 1)) / TONS.length);

  return {
    minimo,
    maximo,
    cortes,
    cor(valor) {
      if (typeof valor !== "number" || !Number.isFinite(valor)) return SEM_VALOR;
      // Amplitude zero: todo mundo vale o mesmo. Um tom só, e o do meio — pintar tudo
      // do tom mais escuro sugeriria "tudo alto", que não é o que o dado diz.
      if (amplitude === 0) return TONS[Math.floor(TONS.length / 2)];
      const posicao = (valor - minimo) / amplitude;
      const indice = Math.min(TONS.length - 1, Math.floor(posicao * TONS.length));
      return TONS[indice];
    },
  };
}
