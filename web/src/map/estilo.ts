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
import { camadasMedicao, fonteMedicao, MEDICAO_SOURCE_ID } from "./medicao";
import {
  camadasDesenhos,
  camadasTracado,
  DESENHOS_SOURCE_ID,
  fonteDesenhos,
  fonteTracado,
  TRACADO_SOURCE_ID,
} from "@/desenho/fonte";

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
      [MEDICAO_SOURCE_ID]: fonteMedicao,
      [DESENHOS_SOURCE_ID]: fonteDesenhos,
      [TRACADO_SOURCE_ID]: fonteTracado,
    },
    layers: [
      ...(satelite
        ? [satelliteLayer(), ...(sobreporVias ? basemapOverlayLayers(tema) : [])]
        : basemapLayers(tema)),
      ...camadasDoMapa(camadas),
      ...highlightLayers(camadas),
      // Os desenhos ficam acima do dado universal e abaixo da seleção: são dado do
      // CLIENTE, então valem mais que o recorte do IBGE debaixo deles — mas menos
      // que o realce do que a pessoa acabou de clicar, que é resposta a um gesto de
      // agora e sumiria embaixo de uma área grande.
      ...camadasDesenhos,
      ...selectionLayers,
      // O traçado em andamento e a medição são a mesma natureza — anotação sendo
      // feita — e por isso vêm por cima de tudo. A ordem entre os dois não decide
      // nada: as ferramentas se excluem, e entrar numa desliga a outra.
      ...camadasTracado,
      ...camadasMedicao,
    ],
  };
}
