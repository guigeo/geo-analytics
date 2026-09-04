/**
 * Cores das zonas do Mapa 1 da Lei 18.177/2024. É dado, não algoritmo: a
 * revisão de cada cor acontece no diff, e não só depois de abrir o mapa.
 */
export interface EntradaDePaleta {
  codigo: string;
  cor: string;
  familia: string;
}

export const PALETA_ZONEAMENTO: EntradaDePaleta[] = [
  { codigo: "AC-1", cor: "#64748b", familia: "Clubes" },
  { codigo: "AC-2", cor: "#94a3b8", familia: "Clubes" },
  { codigo: "ZC", cor: "#b45309", familia: "Centralidades" },
  { codigo: "ZC-ZEIS", cor: "#d97706", familia: "Centralidades" },
  { codigo: "ZCa", cor: "#f59e0b", familia: "Centralidades" },
  { codigo: "ZCOR-1", cor: "#6d28d9", familia: "Corredores" },
  { codigo: "ZCOR-2", cor: "#7c3aed", familia: "Corredores" },
  { codigo: "ZCOR-3", cor: "#8b5cf6", familia: "Corredores" },
  { codigo: "ZCORa", cor: "#a78bfa", familia: "Corredores" },
  { codigo: "ZDE-1", cor: "#0369a1", familia: "Desenvolvimento econômico" },
  { codigo: "ZDE-2", cor: "#0284c7", familia: "Desenvolvimento econômico" },
  { codigo: "ZEIS-1", cor: "#1e4e8c", familia: "Interesse social" },
  { codigo: "ZEIS-2", cor: "#2f6bb0", familia: "Interesse social" },
  { codigo: "ZEIS-3", cor: "#3b82c4", familia: "Interesse social" },
  { codigo: "ZEIS-4", cor: "#5b9bd5", familia: "Interesse social" },
  { codigo: "ZEIS-5", cor: "#7db4e6", familia: "Interesse social" },
  { codigo: "ZEM", cor: "#0f766e", familia: "Eixos metropolitanos" },
  { codigo: "ZEMP", cor: "#14b8a6", familia: "Eixos metropolitanos" },
  { codigo: "ZEP", cor: "#166534", familia: "Preservação" },
  { codigo: "ZEPAM", cor: "#22c55e", familia: "Preservação" },
  { codigo: "ZER-1", cor: "#9f1239", familia: "Exclusivamente residencial" },
  { codigo: "ZER-2", cor: "#be123c", familia: "Exclusivamente residencial" },
  { codigo: "ZERa", cor: "#fb7185", familia: "Exclusivamente residencial" },
  { codigo: "ZEU", cor: "#0e7490", familia: "Eixos urbanos" },
  { codigo: "ZEUP", cor: "#0891b2", familia: "Eixos urbanos" },
  { codigo: "ZEUPa", cor: "#22b8cf", familia: "Eixos urbanos" },
  { codigo: "ZEUa", cor: "#67e8f9", familia: "Eixos urbanos" },
  { codigo: "ZM", cor: "#a16207", familia: "Mistas" },
  { codigo: "ZMIS", cor: "#ca8a04", familia: "Mistas" },
  { codigo: "ZMISa", cor: "#eab308", familia: "Mistas" },
  { codigo: "ZMa", cor: "#facc15", familia: "Mistas" },
  { codigo: "ZOE", cor: "#475569", familia: "Ocupação especial" },
  { codigo: "ZPDS", cor: "#15803d", familia: "Preservação e desenvolvimento sustentável" },
  { codigo: "ZPDSr", cor: "#4ade80", familia: "Preservação e desenvolvimento sustentável" },
  { codigo: "ZPI-1", cor: "#334155", familia: "Industrial" },
  { codigo: "ZPI-2", cor: "#52525b", familia: "Industrial" },
  { codigo: "ZPR", cor: "#c2410c", familia: "Predominantemente residencial" },
];
