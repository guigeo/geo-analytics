/**
 * Configuração do cliente 1 — o `geo-analytics`, publicado como Geo Intelligence.
 *
 * Este arquivo nasceu do `map/layers.ts` e do `map/MapView.tsx` em 2026-08-29,
 * na fase 1 do plano de derivação: os valores são **exatamente** os que já
 * estavam no código, sem nenhum ajuste de passagem. O snapshot em
 * `map/layers.test.ts` é o que prova isso — se ele mudou, alguma coisa aqui
 * saiu diferente do que estava lá.
 */
import { ANTENNA_ICON } from "@/map/icons";
import type { ConfiguracaoCliente } from "@/configuracao/esquema";

export const clienteGeoAnalytics: ConfiguracaoCliente = {
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

  // Paleta clara (GIS moderno). UF é contorno: preenchimento invisível, mas clicável.
  camadas: [
    {
      id: "uf",
      rotulo: "UF",
      camadaFonte: "uf",
      geometria: "poligono",
      cor: "#3a5a8c",
      opacidadePreenchimento: 0,
      contorno: { cor: "#3a5a8c", largura: 2 },
      rotuloNoMapa: { campo: "NM_UF", zoomMinimo: 4, tamanho: 12, cor: "#27406b" },
      visivelPorPadrao: false,
      atributos: [
        { chave: "NM_UF", rotulo: "Nome" },
        { chave: "SIGLA_UF", rotulo: "UF" },
        { chave: "CD_UF", rotulo: "Código" },
      ],
    },
    {
      id: "municipio",
      rotulo: "Município",
      camadaFonte: "municipio",
      geometria: "poligono",
      cor: "#2e8b6f",
      opacidadePreenchimento: 0.15,
      contorno: { cor: "#1d6b52", largura: 1 },
      rotuloNoMapa: { campo: "NM_MUN", zoomMinimo: 8, tamanho: 11, cor: "#16432f" },
      visivelPorPadrao: false,
      atributos: [
        { chave: "NM_MUN", rotulo: "Nome" },
        { chave: "CD_MUN", rotulo: "Código IBGE" },
        { chave: "SIGLA_UF", rotulo: "UF" },
      ],
    },
    {
      id: "distrito",
      rotulo: "Distrito",
      camadaFonte: "distrito",
      geometria: "poligono",
      cor: "#b8577d",
      opacidadePreenchimento: 0.16,
      contorno: { cor: "#8f3a5c", largura: 0.8 },
      visivelPorPadrao: false,
      atributos: [
        { chave: "NM_DIST", rotulo: "Distrito" },
        { chave: "NM_MUN", rotulo: "Município" },
        { chave: "NM_UF", rotulo: "UF" },
      ],
    },
    {
      id: "bairro",
      rotulo: "Bairro",
      camadaFonte: "bairro",
      geometria: "poligono",
      cor: "#8e5bd0",
      opacidadePreenchimento: 0.18,
      contorno: { cor: "#6f3fb0", largura: 0.6 },
      visivelPorPadrao: false,
      atributos: [
        { chave: "NM_BAIRRO", rotulo: "Bairro" },
        { chave: "NM_MUN", rotulo: "Município" },
        { chave: "NM_UF", rotulo: "UF" },
      ],
    },
    {
      id: "setor",
      rotulo: "Setor censitário",
      camadaFonte: "setor",
      geometria: "poligono",
      cor: "#e08a3c",
      opacidadePreenchimento: 0.18,
      contorno: { cor: "#c46a1f", largura: 0.4 },
      visivelPorPadrao: false,
      atributos: [
        { chave: "CD_SETOR", rotulo: "Setor" },
        { chave: "NM_MUN", rotulo: "Município" },
        { chave: "SITUACAO", rotulo: "Situação" },
      ],
    },
    {
      id: "antenas",
      rotulo: "Antenas de telefonia",
      camadaFonte: "antenas",
      geometria: "ponto",
      cor: "#d7263d",
      icone: ANTENNA_ICON,
      ancoraIcone: "base",
      iconesPodemSobrepor: true,
      visivelPorPadrao: false,
      atributos: [
        { chave: "operadora", rotulo: "Operadora" },
        { chave: "tecnologia", rotulo: "Tecnologia" },
        { chave: "frequencia", rotulo: "Frequência" },
      ],
    },
    {
      id: "rodovias",
      rotulo: "Rodovias",
      camadaFonte: "rodovias",
      geometria: "linha",
      cor: "#c2410c",
      larguraLinha: 1.8,
      visivelPorPadrao: false,
      atributos: [
        { chave: "sigla", rotulo: "Rodovia" },
        { chave: "tipovia", rotulo: "Tipo" },
        { chave: "jurisdicao", rotulo: "Jurisdição" },
        { chave: "revestimento", rotulo: "Revestimento" },
      ],
    },
    {
      id: "ferrovias",
      rotulo: "Ferrovias",
      camadaFonte: "ferrovias",
      geometria: "linha",
      cor: "#4b5563",
      larguraLinha: 1.4,
      visivelPorPadrao: false,
      atributos: [
        { chave: "nome", rotulo: "Ferrovia" },
        { chave: "bitola", rotulo: "Bitola" },
        { chave: "situacaofisica", rotulo: "Situação" },
      ],
    },
  ],
};
