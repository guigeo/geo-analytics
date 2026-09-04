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

  // A cara do cliente 1 é a que sempre esteve no `styles.css`. A fase 4 move a
  // decisão para cá sem mexer num pixel: os dois valores são os tokens
  // `--primary` de hoje, copiados em oklch para não perder nada na conversão.
  // Sem símbolo — o cabeçalho segue com o globo padrão da casca.
  cidadeExemplo: "Curitiba",

  tema: {
    marca: "oklch(0.55 0.2 257)",
    marcaEscura: "oklch(0.72 0.15 230)",
    forma: "quadrado",
    fontes: { titulo: "sistema", texto: "sistema" },
    // Sem `raio`, `claros` nem `escuros`: fica com os neutros do `styles.css`,
    // que é a aparência que este cliente tem em produção desde sempre.
  },

  mapa: {
    // Centro geográfico aproximado do Brasil, com o país inteiro na tela.
    centro: [-52.5, -14.5],
    zoomInicial: 3.5,
  },

  // A aplicação da casa não tem "acervo do cliente": quem desenha aqui é quem
  // desenvolve, e "Desenhos" descreve exatamente isso.
  acervo: { rotulo: "Desenhos" },

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
    CATALOGO.zoneamento_sp,
  ],
};
