/**
 * As camadas configuradas, arrumadas nos combos do painel.
 *
 * Puro e separado do componente pelo motivo de sempre: a regra ("grupo vazio não
 * aparece", "a ordem é a da declaração") é testável sem montar React, e o componente
 * fica só com o desenho.
 */
import { GRUPOS_DE_CAMADA, type DefinicaoCamada, type IdDeGrupo } from "@/configuracao";

export interface GrupoDeCamadas {
  id: IdDeGrupo;
  rotulo: string;
  abertoPorPadrao: boolean;
  camadas: DefinicaoCamada[];
}

/**
 * Um combo por grupo que TEM camada naquele cliente.
 *
 * Grupo vazio some em vez de aparecer vazio: o cliente 2 não enxerga antenas, e se as
 * outras duas de infraestrutura também saíssem, um combo "Infraestrutura" sem nada
 * dentro seria pior do que combo nenhum — sugere que algo não carregou.
 *
 * A ordem dos combos é a de `GRUPOS_DE_CAMADA`, e a das camadas dentro de cada um é a
 * que o cliente declarou. As duas são estáveis de propósito: painel que se reordena
 * sozinho obriga a procurar de novo o que já se sabia onde estava.
 */
export function agruparCamadas(camadas: readonly DefinicaoCamada[]): GrupoDeCamadas[] {
  return Object.entries(GRUPOS_DE_CAMADA)
    .map(([id, grupo]) => ({
      id: id as IdDeGrupo,
      rotulo: grupo.rotulo,
      abertoPorPadrao: grupo.abertoPorPadrao,
      camadas: camadas.filter((c) => c.grupo === id),
    }))
    .filter((grupo) => grupo.camadas.length > 0);
}
