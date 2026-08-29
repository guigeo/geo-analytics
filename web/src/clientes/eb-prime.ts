/**
 * Cliente 2 — EB Prime, imobiliária.
 *
 * **Tudo aqui é provisório e existe para o mecanismo aparecer.** O nome exibido,
 * as cores e o recorte de camadas foram escolhidos por mim, não pelo cliente:
 * a fase 2 do plano de derivação prova que a base produz duas aplicações
 * diferentes, e a fase 4 é que define a cara de verdade, com ele olhando.
 *
 * O que este arquivo demonstra: o recorte de camadas é dele. Distrito, antenas e
 * ferrovias não aparecem — decisão que não tem efeito nenhum sobre o cliente 1.
 */
import { CATALOGO, com } from "@/configuracao/catalogo";
import type { ConfiguracaoCliente } from "@/configuracao/esquema";

export const cliente: ConfiguracaoCliente = {
  id: "eb-prime",

  identidade: {
    nome: "EB Prime",
    subtitulo: "Inteligência geográfica · imóveis",
  },

  mapa: {
    // Provisório: o país inteiro, como o cliente 1. A região de atuação define
    // isto, e ainda não foi levantada — inventar cidade seria inventar fato.
    centro: [-52.5, -14.5],
    zoomInicial: 3.5,
  },

  chat: {
    habilitado: true,
    sugestoes: [
      "Qual a renda média por setor censitário de Curitiba?",
      "Quais bairros têm maior renda média?",
      "Quantos domicílios tem este município?",
    ],
  },

  // Recorte imobiliário: o que informa decisão de preço e de público, mais as
  // vias, que informam acesso. Sem distrito, antenas e ferrovias.
  camadas: [
    CATALOGO.uf,
    com(CATALOGO.municipio, { visivelPorPadrao: true }),
    CATALOGO.bairro,
    com(CATALOGO.setor, { cor: "#1f6f8b" }),
    CATALOGO.rodovias,
  ],
};
