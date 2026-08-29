/**
 * Cliente 1 — o `geo-analytics`, publicado como Geo Intelligence.
 *
 * É a aplicação da casa: onde se experimenta camada nova e cara nova antes de
 * qualquer cliente ver. No vocabulário do ADR-0001 ela é o "cliente 1", por
 * decisão de 2026-08-29, mesmo não sendo contrato.
 *
 * Enxerga o catálogo inteiro, e é isso que a distingue: cliente vê o recorte que
 * o negócio dele pede, ela vê tudo.
 */
import { CATALOGO } from "@/configuracao/catalogo";
import type { ConfiguracaoCliente } from "@/configuracao/esquema";

export const cliente: ConfiguracaoCliente = {
  id: "geo-analytics",

  identidade: {
    nome: "Geo Intelligence",
    subtitulo: "Mapa interativo · Brasil",
  },

  mapa: {
    // Centro geográfico aproximado do Brasil, com o país inteiro na tela.
    centro: [-52.5, -14.5],
    zoomInicial: 3.5,
  },

  chat: {
    habilitado: true,
    sugestoes: [
      "Top 10 municípios do Brasil por população",
      "Quais métricas você consegue consultar?",
      "Qual a população de Curitiba?",
    ],
  },

  // A ordem importa: é a de desenho no mapa e a da legenda.
  camadas: [
    CATALOGO.uf,
    CATALOGO.municipio,
    CATALOGO.distrito,
    CATALOGO.bairro,
    CATALOGO.setor,
    CATALOGO.antenas,
    CATALOGO.rodovias,
    CATALOGO.ferrovias,
  ],
};
