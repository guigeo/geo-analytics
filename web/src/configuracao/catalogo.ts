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
import { PALETA_ZONEAMENTO } from "./paleta-zoneamento";
import type { DefinicaoCamada } from "./esquema";

/** Ajusta uma camada do catálogo para um cliente, sem tocar no catálogo. */
export function com(
  camada: DefinicaoCamada,
  ajustes: Partial<Pick<DefinicaoCamada, "rotulo" | "cor">>,
): DefinicaoCamada {
  return { ...camada, ...ajustes };
}

// Paleta clara (GIS moderno). UF é contorno: preenchimento invisível, mas clicável.
export const CATALOGO = {
  uf: {
    id: "uf",
    rotulo: "UF",
    fonte: "IBGE · malha 2022",
    grupo: "ibge",
    camadaFonte: "uf",
    geometria: "poligono",
    cor: "#3a5a8c",
    opacidadePreenchimento: 0,
    contorno: { cor: "#3a5a8c", largura: 2 },
    rotuloNoMapa: { campo: "NM_UF", zoomMinimo: 4, tamanho: 12, cor: "#27406b" },
    atributos: [
      { chave: "NM_UF", rotulo: "Nome" },
      { chave: "SIGLA_UF", rotulo: "UF" },
      { chave: "CD_UF", rotulo: "Código" },
    ],
  },
  municipio: {
    id: "municipio",
    rotulo: "Município",
    fonte: "IBGE · malha 2022",
    grupo: "ibge",
    camadaFonte: "municipio",
    geometria: "poligono",
    cor: "#2e8b6f",
    campoDestaque: "CD_MUN",
    opacidadePreenchimento: 0.15,
    contorno: { cor: "#1d6b52", largura: 1 },
    rotuloNoMapa: { campo: "NM_MUN", zoomMinimo: 8, tamanho: 11, cor: "#16432f" },
    atributos: [
      { chave: "NM_MUN", rotulo: "Nome" },
      { chave: "CD_MUN", rotulo: "Código IBGE" },
      { chave: "SIGLA_UF", rotulo: "UF" },
    ],
  },
  distrito: {
    id: "distrito",
    rotulo: "Distrito",
    fonte: "IBGE · malha 2022",
    grupo: "ibge",
    camadaFonte: "distrito",
    geometria: "poligono",
    cor: "#b8577d",
    campoDestaque: "CD_DIST",
    opacidadePreenchimento: 0.16,
    contorno: { cor: "#8f3a5c", largura: 0.8 },
    atributos: [
      { chave: "NM_DIST", rotulo: "Distrito" },
      { chave: "NM_MUN", rotulo: "Município" },
      { chave: "NM_UF", rotulo: "UF" },
    ],
  },
  bairro: {
    id: "bairro",
    rotulo: "Bairro",
    fonte: "IBGE · malha 2022",
    grupo: "ibge",
    camadaFonte: "bairro",
    geometria: "poligono",
    cor: "#8e5bd0",
    campoDestaque: "CD_BAIRRO",
    // Medição de docs/bairro.md no servidor-dados-gis, em 2026-09-03.
    cobertura: "895 de 5.571 municípios · São Paulo não tem bairro nesta malha",
    opacidadePreenchimento: 0.18,
    contorno: { cor: "#6f3fb0", largura: 0.6 },
    atributos: [
      { chave: "NM_BAIRRO", rotulo: "Bairro" },
      { chave: "NM_MUN", rotulo: "Município" },
      { chave: "NM_UF", rotulo: "UF" },
    ],
  },
  setor: {
    id: "setor",
    rotulo: "Setor censitário",
    fonte: "IBGE · Censo 2022",
    grupo: "ibge",
    camadaFonte: "setor",
    geometria: "poligono",
    cor: "#e08a3c",
    campoDestaque: "CD_SETOR",
    opacidadePreenchimento: 0.18,
    contorno: { cor: "#c46a1f", largura: 0.4 },
    atributos: [
      { chave: "CD_SETOR", rotulo: "Setor" },
      { chave: "NM_MUN", rotulo: "Município" },
      { chave: "SITUACAO", rotulo: "Situação" },
    ],
  },
  antenas: {
    id: "antenas",
    rotulo: "Antenas de telefonia",
    grupo: "infraestrutura",
    camadaFonte: "antenas",
    geometria: "ponto",
    cor: "#d7263d",
    icone: ANTENNA_ICON,
    ancoraIcone: "base",
    iconesPodemSobrepor: true,
    atributos: [
      { chave: "operadora", rotulo: "Operadora" },
      { chave: "tecnologia", rotulo: "Tecnologia" },
      { chave: "frequencia", rotulo: "Frequência" },
    ],
  },
  rodovias: {
    id: "rodovias",
    rotulo: "Rodovias",
    grupo: "infraestrutura",
    camadaFonte: "rodovias",
    geometria: "linha",
    cor: "#c2410c",
    // Mais grossa que antes (1,8) para a divisória caber dentro dela sem virar borrão.
    larguraLinha: 3.4,
    faixaCentral: { cor: "#ffffff", largura: 0.9, tracejado: [2, 2], zoomMinimo: 9 },
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
    grupo: "infraestrutura",
    camadaFonte: "ferrovias",
    geometria: "linha",
    cor: "#4b5563",
    larguraLinha: 2.2,
    // Os "dormentes": tracinhos curtos e juntos. Com a linha mais grossa que a da
    // rodovia, o trilho se lê como trilho mesmo em zoom baixo, e não como estrada fina.
    tracejado: [1, 1],
    atributos: [
      { chave: "nome", rotulo: "Ferrovia" },
      { chave: "bitola", rotulo: "Bitola" },
      { chave: "situacaofisica", rotulo: "Situação" },
    ],
  },
  zoneamento_sp: {
    id: "zoneamento_sp",
    rotulo: "Zoneamento de São Paulo",
    fonte: "Lei 18.177/2024 · 28/03/2025",
    grupo: "regulacao",
    camadaFonte: "zoneamento_sp",
    geometria: "poligono",
    cor: "#1e4e8c",
    campoDestaque: "COD_ZONA",
    pinturaPorCategoria: { campo: "COD_ZONA", entradas: PALETA_ZONEAMENTO },
    cobertura: "São Paulo (capital)",
    opacidadePreenchimento: 0.62,
    contorno: { cor: "#475569", largura: 0.35 },
    atributos: [
      { chave: "COD_ZONA", rotulo: "Zona" },
      { chave: "NM_ZONA", rotulo: "Descrição" },
      { chave: "LEI", rotulo: "Legislação" },
      { chave: "DT_ATUALIZACAO", rotulo: "Atualizado em" },
    ],
  },
  h3_domicilios: {
    id: "h3_domicilios",
    rotulo: "Domicílios em apartamento (H3)",
    fonte: "CNEFE 2022 · célula H3 r9",
    grupo: "indicadores",
    camadaFonte: "h3_domicilios",
    geometria: "poligono",
    cor: "#1d4ed8",
    campoDestaque: "H3_R9",
    // Medido no geodata local em 2026-09-07: 0 / p95 216 / p99 820 / máximo 5.524.
    // Acima de 820 a cor satura: preserva contraste nos 99% restantes sem esconder dado.
    pinturaPorNumero: {
      campo: "DOM_APARTAMENTO",
      minimo: 0,
      maximo: 820,
      corInicial: "#eff6ff",
      corFinal: "#1d4ed8",
      rotulo: "Domicílios em apartamento",
    },
    cobertura: "37 municípios da concentração urbana de São Paulo",
    opacidadePreenchimento: 0.72,
    contorno: { cor: "#1e40af", largura: 0.25 },
    atributos: [
      { chave: "H3_R9", rotulo: "Célula H3 (resolução 9)" },
      { chave: "DOM_APARTAMENTO", rotulo: "Domicílios em apartamento" },
      { chave: "DOM_CASA", rotulo: "Domicílios em casa" },
      { chave: "DOMICILIOS_PARTICULARES", rotulo: "Domicílios particulares" },
      { chave: "COORD_ORIGINAL", rotulo: "Coordenadas originais de campo" },
      { chave: "COORD_MODIFICADA", rotulo: "Coordenadas modificadas no mesmo endereço" },
      { chave: "COORD_ESTIMADA", rotulo: "Coordenadas estimadas" },
      { chave: "COORD_FACE_QUADRA", rotulo: "Coordenadas na face de quadra" },
      { chave: "COORD_LOCALIDADE", rotulo: "Coordenadas na localidade" },
      { chave: "COORD_SETOR", rotulo: "Coordenadas no setor" },
    ],
  },
} satisfies Record<string, DefinicaoCamada>;

export type IdDeCamada = keyof typeof CATALOGO;
