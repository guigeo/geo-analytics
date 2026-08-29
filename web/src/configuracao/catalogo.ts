/**
 * Catálogo das camadas do dado universal.
 *
 * Estas oito camadas vêm dos tiles compartilhados (`tiles.averisen.com`, host do
 * `webgis`): são as malhas e os pontos do IBGE e da infraestrutura, iguais para
 * todo cliente. Por isso a definição mora aqui, e não no arquivo de cada um —
 * repetir a lista por cliente seria o mesmo fork silencioso que o ADR-0001
 * proíbe para o dado, agora na forma de configuração.
 *
 * O cliente **escolhe** quais enxerga, e em que ordem. Tirar `bairro` de um não
 * tem efeito nenhum sobre o outro.
 *
 * Camada nova aqui só se ela existir no host de tiles compartilhado. Camada que
 * é do cliente — a que ele sobe, desenha ou importa — não entra neste arquivo.
 */
import { ANTENNA_ICON } from "@/map/icons";
import type { DefinicaoCamada } from "./esquema";

/** Ajusta uma camada do catálogo para um cliente, sem tocar no catálogo. */
export function com(
  camada: DefinicaoCamada,
  ajustes: Partial<Pick<DefinicaoCamada, "rotulo" | "cor" | "visivelPorPadrao">>,
): DefinicaoCamada {
  return { ...camada, ...ajustes };
}

// Paleta clara (GIS moderno). UF é contorno: preenchimento invisível, mas clicável.
export const CATALOGO = {
  uf: {
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
  municipio: {
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
  distrito: {
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
  bairro: {
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
  setor: {
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
  antenas: {
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
  rodovias: {
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
  ferrovias: {
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
} satisfies Record<string, DefinicaoCamada>;

export type IdDeCamada = keyof typeof CATALOGO;
