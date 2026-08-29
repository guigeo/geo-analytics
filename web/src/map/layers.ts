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
import type { LayerSpecification, SourceSpecification } from "maplibre-gl";
import { camadas, type DefinicaoCamada } from "@/configuracao";
import { tileUrl } from "./tileHost";

/** Sufixos das sub-camadas companheiras (o toggle herda do id base). */
export const SUFIXOS_SUBCAMADA = ["", "__outline", "__label"] as const;

/** Só os ids base são clicáveis — contorno e rótulo não respondem a clique. */
export const IDS_CLICAVEIS = camadas.map((c) => c.id);

/** O MapLibre nomeia âncora em inglês; a configuração, em português. */
const ANCORA_MAPLIBRE = { centro: "center", base: "bottom" } as const;

export function fontesDeDados(): Record<string, SourceSpecification> {
  const fontes: Record<string, SourceSpecification> = {};
  for (const c of camadas) {
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
      layout: { visibility, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": c.cor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 12, c.larguraLinha ?? 1.6],
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
      "fill-color": c.cor,
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
export function camadasDoMapa(): LayerSpecification[] {
  const base: LayerSpecification[] = [];
  const rotulos: LayerSpecification[] = [];
  for (const c of camadas) {
    const visibility = c.visivelPorPadrao ? "visible" : "none";
    base.push(camadaBase(c, visibility));
    const contorno = camadaContorno(c, visibility);
    if (contorno) base.push(contorno);
    const rotulo = camadaRotulo(c, visibility);
    if (rotulo) rotulos.push(rotulo);
  }
  return [...base, ...rotulos];
}
