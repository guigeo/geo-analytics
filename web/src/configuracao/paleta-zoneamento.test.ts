import { describe, expect, it } from "vitest";
import { PALETA_ZONEAMENTO } from "./paleta-zoneamento";

const CODIGOS_DE_ZONA = [
  "AC-1",
  "AC-2",
  "ZC",
  "ZC-ZEIS",
  "ZCOR-1",
  "ZCOR-2",
  "ZCOR-3",
  "ZCORa",
  "ZCa",
  "ZDE-1",
  "ZDE-2",
  "ZEIS-1",
  "ZEIS-2",
  "ZEIS-3",
  "ZEIS-4",
  "ZEIS-5",
  "ZEM",
  "ZEMP",
  "ZEP",
  "ZEPAM",
  "ZER-1",
  "ZER-2",
  "ZERa",
  "ZEU",
  "ZEUP",
  "ZEUPa",
  "ZEUa",
  "ZM",
  "ZMIS",
  "ZMISa",
  "ZMa",
  "ZOE",
  "ZPDS",
  "ZPDSr",
  "ZPI-1",
  "ZPI-2",
  "ZPR",
];

describe("paleta do zoneamento", () => {
  it("cobre todos os códigos de zona e não trata Praça/Canteiro como zona", () => {
    expect(PALETA_ZONEAMENTO.map((entrada) => entrada.codigo).sort()).toEqual(
      CODIGOS_DE_ZONA.sort(),
    );
    expect(PALETA_ZONEAMENTO.map((entrada) => entrada.codigo)).not.toContain("Praça/Canteiro");
  });

  it("tem uma cor hexadecimal e família em cada entrada", () => {
    for (const entrada of PALETA_ZONEAMENTO) {
      expect(entrada.cor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(entrada.familia).not.toBe("");
    }
  });
});
