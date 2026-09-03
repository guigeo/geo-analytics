/**
 * Os desenhos do cliente, prontos para virar folhas da árvore de camadas.
 *
 * Saem da MESMA coleção que alimenta o mapa (`/api/desenhos/geometrias`), e não de
 * uma lista paginada à parte. É o que garante que o painel e o mapa nunca discordem —
 * antes eram duas cargas com ritmos diferentes, e a de baixo paginava enquanto a de
 * cima mostrava tudo.
 *
 * Houve um passo intermediário em que cada CATEGORIA virava uma camada e os desenhos
 * ficavam dentro dela. Com duas áreas e uma categoria só, aquele nível não separava
 * nada: era um clique a mais para chegar no mesmo lugar. A categoria continua no dado
 * e aparece nos Atributos; ela só não é mais um degrau da árvore.
 */

/** Um desenho do acervo, do jeito que o painel precisa dele. */
export interface ItemDoAcervo {
  id: string;
  nome: string;
  cor: string;
  /** `ponto`, `poligono` ou `buffer` — decide a forma da amostra e o zoom ao focalizar. */
  tipo: string;
  geometria: GeoJSON.Geometry;
}

const COR_PADRAO = "#2563eb";

/**
 * Os desenhos, na ordem em que o servidor os devolve (mais antigo primeiro).
 *
 * A ordem é do servidor de propósito: painel que se reordena sozinho obriga a
 * procurar de novo o que já se sabia onde estava.
 */
export function itensDoAcervo(colecao: GeoJSON.FeatureCollection): ItemDoAcervo[] {
  const itens: ItemDoAcervo[] = [];
  for (const feicao of colecao.features) {
    const p = feicao.properties ?? {};
    // Sem id não há como esconder nem apagar: a feição existe no mapa e seria uma
    // linha morta no painel. Melhor não listar do que listar o que não responde.
    if (typeof p.id !== "string" || !feicao.geometry) continue;
    itens.push({
      id: p.id,
      nome: typeof p.nome === "string" && p.nome !== "" ? p.nome : "(sem nome)",
      cor: typeof p.cor === "string" && p.cor !== "" ? p.cor : COR_PADRAO,
      tipo: typeof p.tipo === "string" ? p.tipo : "poligono",
      geometria: feicao.geometry,
    });
  }
  return itens;
}
