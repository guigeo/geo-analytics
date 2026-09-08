import type { FilterSpecification, LayerSpecification, Map } from "maplibre-gl";
import { camadas as camadasAtivas, type DefinicaoCamada } from "@/configuracao";

/**
 * A pintura do contraste interno: cor por setor, sobre a fonte PMTiles que já existe.
 *
 * Mesmo caminho do `highlight.ts`, e pelo mesmo motivo — pintar por CÓDIGO na própria
 * fonte funciona para setor fora do viewport, sem `queryRenderedFeatures`. A diferença
 * é que o destaque do agente é um filtro (dentro ou fora) e aqui a informação está na
 * COR, então o `match` vai no `fill-color` em vez de no filtro.
 *
 * O que isso evita: mandar geometria de setor no payload do Raio-X. O polígono já está
 * no tile; repetir centenas de kB dele no JSON seria pagar duas vezes pela mesma coisa.
 * O teto de 500 setores da rota mantém o `match` num tamanho trivial.
 */
export interface PinturaRaioX {
  /** Camada onde pintar. Hoje sempre o setor censitário, mas o campo não é fixo aqui. */
  camada: string;
  /** Cor final de cada código. A escala já foi resolvida em `raiox/escala.ts`. */
  cores: Record<string, string>;
}

const NEUTRO = "transparent";

function codigos(pintura: PinturaRaioX | null, camada: string): string[] {
  if (!pintura || pintura.camada !== camada) return [];
  return Object.keys(pintura.cores);
}

function filtroDe(campo: string, lista: string[]): FilterSpecification {
  return ["in", ["get", campo], ["literal", lista]] as FilterSpecification;
}

/**
 * `match` de código para cor. Com a lista vazia o `match` seria inválido, então o
 * `case` do MapLibre não entra: devolvemos a cor neutra direto.
 */
function corDe(campo: string, pintura: PinturaRaioX | null, camada: string) {
  const lista = codigos(pintura, camada);
  if (!lista.length || !pintura) return NEUTRO;
  return [
    "match",
    ["get", campo],
    ...lista.flatMap((codigo) => [codigo, pintura.cores[codigo]]),
    NEUTRO,
  ];
}

/**
 * As camadas do Raio-X, uma por camada que tenha campo de destaque.
 *
 * O filtro por `camadas` do cliente é a mesma guarda do `highlight.ts`, e pela mesma
 * razão dura: style que referencia fonte inexistente é recusado INTEIRO pelo MapLibre —
 * não some uma camada, some o mapa.
 */
export function camadasDoRaioX(camadas: DefinicaoCamada[]): LayerSpecification[] {
  return camadas
    .flatMap((camada) => (camada.campoDestaque ? [[camada.id, camada.campoDestaque] as const] : []))
    .flatMap(([id, campo]) => [
      {
        id: `${id}__raiox-fill`,
        type: "fill",
        source: id,
        "source-layer": id,
        filter: filtroDe(campo, []),
        paint: { "fill-color": NEUTRO, "fill-opacity": 0.75 },
      } as LayerSpecification,
      {
        id: `${id}__raiox-line`,
        type: "line",
        source: id,
        "source-layer": id,
        filter: filtroDe(campo, []),
        paint: { "line-color": "#0f172a", "line-width": 0.6, "line-opacity": 0.5 },
      } as LayerSpecification,
    ]);
}

/**
 * Aplica a pintura. Devolve `false` quando o style ainda não tem as camadas — o mesmo
 * contrato do `applyHighlights`, para quem chama poder tentar de novo em vez de perder
 * a pintura em silêncio.
 */
export function aplicarPinturaRaioX(
  map: Map,
  pintura: PinturaRaioX | null,
  lista: DefinicaoCamada[] = camadasAtivas,
): boolean {
  let achou = false;
  for (const camada of lista) {
    if (!camada.campoDestaque) continue;
    const campo = camada.campoDestaque;
    const filtro = filtroDe(campo, codigos(pintura, camada.id));
    const preenchimento = `${camada.id}__raiox-fill`;
    const contorno = `${camada.id}__raiox-line`;
    if (map.getLayer(preenchimento)) {
      map.setFilter(preenchimento, filtro);
      map.setPaintProperty(preenchimento, "fill-color", corDe(campo, pintura, camada.id));
      achou = true;
    }
    if (map.getLayer(contorno)) {
      map.setFilter(contorno, filtro);
      achou = true;
    }
  }
  return achou;
}
