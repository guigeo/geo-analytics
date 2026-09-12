/**
 * Tradução de camada configurada para especificação do MapLibre.
 *
 * A lista de camadas não mora mais aqui: ela é configuração de cliente, e vem de
 * `@/configuracao` (fase 1 do plano de derivação, 2026-08-29). O que ficou neste
 * arquivo é só a tradução — dado do cliente entra, `LayerSpecification` sai —, e
 * ela é igual para todos os clientes.
 *
 * O snapshot em `layers.test.ts` congela a saída daqui. Ele existe justamente
 * porque a lista mudou de lugar: se a especificação gerada mudou junto, o
 * refactor deixou de ser refactor.
 */
import type {
  DataDrivenPropertyValueSpecification,
  LayerSpecification,
  SourceSpecification,
} from "maplibre-gl";
import { camadas, type DefinicaoCamada, type TemaNumerico } from "@/configuracao";
import { tileUrl } from "./tileHost";

/** Sufixos das sub-camadas companheiras (o toggle herda do id base). */
export const SUFIXOS_SUBCAMADA = ["", "__faixa", "__outline", "__label"] as const;

/** Só os ids base são clicáveis — contorno e rótulo não respondem a clique. */
export const IDS_CLICAVEIS = camadas.map((c) => c.id);

/** O MapLibre nomeia âncora em inglês; a configuração, em português. */
const ANCORA_MAPLIBRE = { centro: "center", base: "bottom" } as const;
const NEUTRO_SEM_ZONA = "#94a3b8";

function corDoPreenchimento(camada: DefinicaoCamada): DataDrivenPropertyValueSpecification<string> {
  if (camada.pinturaPorCategoria) {
    const { campo, entradas } = camada.pinturaPorCategoria;
    return [
      "match",
      ["get", campo],
      ...entradas.flatMap((entrada) => [entrada.codigo, entrada.cor]),
      NEUTRO_SEM_ZONA,
    ] as unknown as DataDrivenPropertyValueSpecification<string>;
  }
  if (camada.temasNumericos) return expressaoDeCorNumerica(camada.temasNumericos[0]);
  return camada.cor;
}

/**
 * A cor de um tema numérico, como expressão do MapLibre.
 *
 * É a MESMA função na criação do style e na troca em runtime (`setPaintProperty`), de
 * propósito: com duas, o mapa criado e o mapa repintado poderiam divergir sem erro
 * nenhum — bastaria alguém corrigir a escala de um lado.
 */
export function expressaoDeCorNumerica(
  tema: TemaNumerico,
): DataDrivenPropertyValueSpecification<string> {
  return [
    "interpolate",
    ["linear"],
    ["to-number", ["get", tema.campo], tema.minimo],
    tema.minimo,
    tema.corInicial,
    tema.maximo,
    tema.corFinal,
  ] as unknown as DataDrivenPropertyValueSpecification<string>;
}

/**
 * O tema ativo de uma camada, ou o primeiro.
 *
 * O fallback não é zelo: id guardado no estado pode não existir mais depois de uma
 * mudança no catálogo, e sem ele a camada ficaria sem cor — apagada no mapa, sem erro.
 */
export function temaDaCamada(
  camada: DefinicaoCamada,
  idDoTema: string | undefined,
): TemaNumerico | null {
  const temas = camada.temasNumericos;
  if (!temas?.length) return null;
  return temas.find((t) => t.id === idDoTema) ?? temas[0];
}

export function fontesDeDados(
  lista: DefinicaoCamada[] = camadas,
): Record<string, SourceSpecification> {
  const fontes: Record<string, SourceSpecification> = {};
  for (const c of lista) {
    fontes[c.id] = { type: "vector", url: tileUrl(c.id) };
  }
  return fontes;
}

function camadaBase(c: DefinicaoCamada, visibility: "visible" | "none"): LayerSpecification {
  if (c.geometria === "ponto") {
    if (c.icone) {
      // Ponto com ícone (antena = torre).
      const sobrepoe = c.iconesPodemSobrepor ?? false;
      return {
        id: c.id,
        type: "symbol",
        source: c.id,
        "source-layer": c.camadaFonte,
        layout: {
          visibility,
          "icon-image": c.icone,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 12, 0.9],
          "icon-anchor": ANCORA_MAPLIBRE[c.ancoraIcone ?? "centro"],
          "icon-allow-overlap": sobrepoe,
          "icon-ignore-placement": sobrepoe,
        },
      } satisfies LayerSpecification;
    }
    // Ponto sem ícone: círculo colorido, raio cresce com o zoom.
    return {
      id: c.id,
      type: "circle",
      source: c.id,
      "source-layer": c.camadaFonte,
      layout: { visibility },
      paint: {
        "circle-color": c.cor,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 12, 5.5],
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 0.6,
      },
    } satisfies LayerSpecification;
  }
  if (c.geometria === "linha") {
    return {
      id: c.id,
      type: "line",
      source: c.id,
      "source-layer": c.camadaFonte,
      // Ponta reta quando há tracejado: com a ponta redonda, tracinho curto vira
      // bolinha, e o trilho se lê como pontilhado em vez de dormente.
      layout: {
        visibility,
        "line-cap": c.tracejado ? "butt" : "round",
        "line-join": "round",
      },
      paint: {
        "line-color": c.cor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 12, c.larguraLinha ?? 1.6],
        ...(c.tracejado ? { "line-dasharray": [...c.tracejado] } : {}),
      },
    } satisfies LayerSpecification;
  }
  return {
    id: c.id,
    type: "fill",
    source: c.id,
    "source-layer": c.camadaFonte,
    layout: { visibility },
    paint: {
      "fill-color": corDoPreenchimento(c),
      "fill-opacity": c.opacidadePreenchimento ?? 0.15,
    },
  } satisfies LayerSpecification;
}

function camadaContorno(
  c: DefinicaoCamada,
  visibility: "visible" | "none",
): LayerSpecification | null {
  if (!c.contorno) return null;
  return {
    id: `${c.id}__outline`,
    type: "line",
    source: c.id,
    "source-layer": c.camadaFonte,
    layout: { visibility },
    paint: { "line-color": c.contorno.cor, "line-width": c.contorno.largura },
  } satisfies LayerSpecification;
}

/**
 * A faixa central de uma linha: a divisória branca por cima da pista.
 *
 * Some no zoom baixo de propósito (`zoomMinimo`): a rodovia nacional tem menos de um
 * pixel ali, e pintar uma faixa dentro dela só suja o traço. A largura acompanha o
 * zoom pelo mesmo motivo — ela nasce fina e engorda junto com a pista.
 */
function camadaFaixaCentral(
  c: DefinicaoCamada,
  visibility: "visible" | "none",
): LayerSpecification | null {
  if (c.geometria !== "linha" || !c.faixaCentral) return null;
  const { cor, largura, tracejado, zoomMinimo = 9 } = c.faixaCentral;
  return {
    id: `${c.id}__faixa`,
    type: "line",
    source: c.id,
    "source-layer": c.camadaFonte,
    minzoom: zoomMinimo,
    layout: { visibility, "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": cor,
      "line-width": ["interpolate", ["linear"], ["zoom"], zoomMinimo, largura * 0.5, 14, largura],
      ...(tracejado ? { "line-dasharray": [...tracejado] } : {}),
    },
  } satisfies LayerSpecification;
}

function camadaRotulo(
  c: DefinicaoCamada,
  visibility: "visible" | "none",
): LayerSpecification | null {
  if (!c.rotuloNoMapa) return null;
  return {
    id: `${c.id}__label`,
    type: "symbol",
    source: c.id,
    "source-layer": c.camadaFonte,
    minzoom: c.rotuloNoMapa.zoomMinimo,
    layout: {
      visibility,
      "text-field": ["get", c.rotuloNoMapa.campo],
      "text-size": c.rotuloNoMapa.tamanho,
      "text-font": ["Noto Sans Regular"],
      "text-padding": 4,
      "text-max-width": 8,
    },
    paint: {
      "text-color": c.rotuloNoMapa.cor,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.2,
    },
  } satisfies LayerSpecification;
}

/** Ordem: preenchimentos e contornos primeiro, rótulos por último (ficam por cima). */
export function camadasDoMapa(lista: DefinicaoCamada[] = camadas): LayerSpecification[] {
  const base: LayerSpecification[] = [];
  const rotulos: LayerSpecification[] = [];
  for (const c of lista) {
    // Sempre `none`: o style nasce com tudo apagado e quem acende é o painel. Ver
    // `visibilidadeInicial` no App — a regra é da casca, não do cliente.
    const visibility = "none" as const;
    base.push(camadaBase(c, visibility));
    const faixa = camadaFaixaCentral(c, visibility);
    if (faixa) base.push(faixa);
    const contorno = camadaContorno(c, visibility);
    if (contorno) base.push(contorno);
    const rotulo = camadaRotulo(c, visibility);
    if (rotulo) rotulos.push(rotulo);
  }
  return [...base, ...rotulos];
}
