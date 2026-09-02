import type { FilterSpecification, LayerSpecification, Map } from "maplibre-gl";
import type { DefinicaoCamada } from "@/configuracao";

// Destaques do agente (Fase 2): pinta municipios/distritos/bairros/setores POR CODIGO via filtro nas
// proprias fontes PMTiles. Diferente do selection.ts (clique), nao depende de
// queryRenderedFeatures — funciona para codigos fora do viewport atual, e as camadas
// ficam sempre visiveis (independem do toggle da camada base).
export interface Destaques {
  camada: "municipio" | "setor" | "bairro" | "distrito";
  codigos: string[];
}

const CODE_FIELDS = {
  municipio: "CD_MUN",
  setor: "CD_SETOR",
  bairro: "CD_BAIRRO",
  distrito: "CD_DIST",
} as const;

const HIGHLIGHT = "#00b3ff";

function codeFilter(field: string, codigos: string[]): FilterSpecification {
  return ["in", ["get", field], ["literal", codigos]] as FilterSpecification;
}

/**
 * Destaques só para as camadas que ESTE cliente enxerga.
 *
 * O filtro por `camadas` não é detalhe: um style que referencia fonte
 * inexistente é recusado inteiro pelo MapLibre, e o mapa não sobe — não é uma
 * camada que some, é o mapa todo. Foi o que aconteceu com o primeiro cliente
 * derivado, que não tem `distrito`: a lista aqui era fixa, e a tela ficou vazia
 * sem nenhum pedido de tile (2026-08-29).
 */
export function highlightLayers(camadas: DefinicaoCamada[]): LayerSpecification[] {
  const disponiveis = new Set(camadas.map((c) => c.id));
  return Object.entries(CODE_FIELDS)
    .filter(([id]) => disponiveis.has(id))
    .flatMap(([id, field]) => [
      {
        id: `${id}__highlight-fill`,
        type: "fill",
        source: id,
        "source-layer": id,
        filter: codeFilter(field, []),
        paint: { "fill-color": HIGHLIGHT, "fill-opacity": 0.25 },
      } satisfies LayerSpecification,
      {
        id: `${id}__highlight-line`,
        type: "line",
        source: id,
        "source-layer": id,
        filter: codeFilter(field, []),
        paint: { "line-color": HIGHLIGHT, "line-width": 2.5 },
      } satisfies LayerSpecification,
    ]);
}

/**
 * Aplica os destaques. Devolve `false` quando o style ainda não tem as camadas.
 *
 * O retorno existe para quem chama poder tentar de novo: aplicar destaque antes de o
 * style ser parseado não dá erro, dá silêncio — e um destaque perdido em silêncio é
 * uma resposta do agente que o mapa ignorou.
 */
export function applyHighlights(map: Map, destaques: Destaques | null) {
  let achou = false;
  for (const [camada, field] of Object.entries(CODE_FIELDS)) {
    const codigos = destaques?.camada === camada ? destaques.codigos : [];
    const filter = codeFilter(field, codigos);
    for (const kind of ["fill", "line"] as const) {
      const id = `${camada}__highlight-${kind}`;
      if (map.getLayer(id)) {
        map.setFilter(id, filter);
        achou = true;
      }
    }
  }
  return achou;
}
