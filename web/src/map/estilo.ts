/**
 * Montagem do style do MapLibre.
 *
 * Mora fora do `MapView` de propósito: assim dá para conferir o style de
 * qualquer cliente sem subir navegador nem WebGL. Foi o que faltava em
 * 2026-08-29, quando o primeiro cliente derivado subiu com a tela vazia porque
 * o style citava uma fonte (`distrito`) que ele não tem — **style com fonte
 * inexistente é recusado inteiro pelo MapLibre**, então o defeito não some uma
 * camada, some o mapa. `estilo.test.ts` cobre isso para todo cliente.
 */
import type { StyleSpecification } from "maplibre-gl";
import type { DefinicaoCamada } from "@/configuracao";
import {
  basemapLayers,
  basemapOverlayLayers,
  basemapSource,
  BASEMAP_SOURCE_ID,
  GLYPHS_URL,
  satelliteLayer,
  satelliteSource,
  SATELLITE_SOURCE_ID,
  spriteUrl,
  type BasemapTheme,
} from "./basemap";
import { camadasDoMapa, fontesDeDados } from "./layers";
import { highlightLayers } from "./highlight";
import { selectionLayers, selectionSource, SELECTION_SOURCE_ID } from "./selection";

export interface OpcoesDeEstilo {
  camadas: DefinicaoCamada[];
  tema: BasemapTheme;
  satelite: boolean;
  /** Com satélite ligado: mantém vias, limites e rótulos por cima (modo híbrido). */
  sobreporVias: boolean;
}

export function montarEstilo({
  camadas,
  tema,
  satelite,
  sobreporVias,
}: OpcoesDeEstilo): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: spriteUrl(tema),
    sources: {
      [BASEMAP_SOURCE_ID]: basemapSource,
      [SATELLITE_SOURCE_ID]: satelliteSource,
      ...fontesDeDados(camadas),
      [SELECTION_SOURCE_ID]: selectionSource,
    },
    layers: [
      ...(satelite
        ? [satelliteLayer(), ...(sobreporVias ? basemapOverlayLayers(tema) : [])]
        : basemapLayers(tema)),
      ...camadasDoMapa(camadas),
      ...highlightLayers(camadas),
      ...selectionLayers,
    ],
  };
}
