/**
 * As camadas do acervo: uma por categoria, derivadas do próprio dado.
 *
 * O catálogo (`configuracao/catalogo.ts`) guarda o dado universal, igual para todo
 * cliente, e diz em uma linha que camada do cliente não entra nele. Este arquivo é o
 * outro lado dessa frase: a camada do cliente **não se declara, se descobre**. Ela sai
 * da `categoria` que os desenhos já carregam, e KMZ novo com categoria nova vira camada
 * nova sem ninguém editar configuração — que é a diferença entre dado do cliente e dado
 * da casa.
 *
 * Puro de propósito, como `geometria.ts` e `estado.ts`: recebe a coleção e devolve a
 * lista. Quem fala com o MapLibre é o `fonte.ts`, quem desenha é o `LayerPanel`.
 */

/**
 * A categoria de quem não tem categoria.
 *
 * Desenho feito à mão pode não ter nenhuma, e sem um balde para ele o desenho sumiria
 * do painel de camadas — visível no mapa e invisível na lista que governa o mapa, que
 * é a pior das combinações. O prefixo esquisito é para nunca colidir com uma categoria
 * de verdade: ela vem de texto livre.
 */
export const SEM_CATEGORIA = "__sem_categoria__";

export interface CamadaDoAcervo {
  /** A categoria, ou `SEM_CATEGORIA`. É o valor que o filtro do mapa compara. */
  id: string;
  rotulo: string;
  /** A cor mais usada dentro da categoria — a amostra do painel precisa significar algo. */
  cor: string;
  quantidade: number;
}

const COR_PADRAO = "#2563eb";

/** A categoria de uma feição, com nulo e vazio caindo no mesmo balde. */
function categoriaDe(feicao: GeoJSON.Feature): string {
  const bruta = feicao.properties?.categoria;
  if (typeof bruta !== "string") return SEM_CATEGORIA;
  const limpa = bruta.trim();
  return limpa === "" ? SEM_CATEGORIA : limpa;
}

/**
 * Uma camada por categoria, mais frequente primeiro.
 *
 * A ordem é a mesma que `/api/desenhos/categorias` já usa nos chips da lista — duas
 * ordens diferentes para o mesmo conjunto na mesma tela fariam o olho procurar duas
 * vezes. "Sem categoria" fica por último sempre: é o resto, não a maior.
 */
export function camadasDoAcervo(colecao: GeoJSON.FeatureCollection): CamadaDoAcervo[] {
  const grupos = new Map<string, { quantidade: number; cores: Map<string, number> }>();

  for (const feicao of colecao.features) {
    const categoria = categoriaDe(feicao);
    const grupo = grupos.get(categoria) ?? { quantidade: 0, cores: new Map() };
    grupo.quantidade += 1;
    const cor = feicao.properties?.cor;
    if (typeof cor === "string" && cor !== "") {
      grupo.cores.set(cor, (grupo.cores.get(cor) ?? 0) + 1);
    }
    grupos.set(categoria, grupo);
  }

  return [...grupos.entries()]
    .map(([id, { quantidade, cores }]) => ({
      id,
      rotulo: id === SEM_CATEGORIA ? "Sem categoria" : id,
      cor: corDominante(cores),
      quantidade,
    }))
    .sort((a, b) => {
      if (a.id === SEM_CATEGORIA) return 1;
      if (b.id === SEM_CATEGORIA) return -1;
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
      return a.rotulo.localeCompare(b.rotulo, "pt-BR");
    });
}

/** A cor mais frequente. Empate fica com a primeira vista — estável entre recargas. */
function corDominante(cores: Map<string, number>): string {
  let escolhida = COR_PADRAO;
  let maior = 0;
  for (const [cor, n] of cores) {
    if (n > maior) {
      escolhida = cor;
      maior = n;
    }
  }
  return escolhida;
}
