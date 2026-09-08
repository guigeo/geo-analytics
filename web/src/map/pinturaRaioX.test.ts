import { describe, expect, it, vi } from "vitest";
import type { Map } from "maplibre-gl";
import { camadas } from "@/configuracao";
import { aplicarPinturaRaioX, camadasDoRaioX } from "./pinturaRaioX";

const setor = camadas.filter((c) => c.id === "setor");

describe("camadasDoRaioX", () => {
  it("cria preenchimento e contorno para camada com campo de destaque", () => {
    const ids = camadasDoRaioX(setor).map((c) => c.id);
    expect(ids).toEqual(["setor__raiox-fill", "setor__raiox-line"]);
  });

  it("ignora camada sem campo de destaque — style com fonte inexistente derruba o mapa inteiro", () => {
    expect(camadasDoRaioX(camadas.filter((c) => !c.campoDestaque))).toEqual([]);
  });
});

describe("aplicarPinturaRaioX", () => {
  function mapaFalso() {
    return {
      getLayer: vi.fn(() => ({})),
      setFilter: vi.fn(),
      setPaintProperty: vi.fn(),
    } as unknown as Map & {
      setPaintProperty: ReturnType<typeof vi.fn>;
      setFilter: ReturnType<typeof vi.fn>;
    };
  }

  it("monta o match de código para cor", () => {
    const map = mapaFalso();
    aplicarPinturaRaioX(map, { camada: "setor", cores: { "355030805000001": "#1d4ed8" } }, setor);
    const [, , expressao] = map.setPaintProperty.mock.calls[0];
    expect(expressao).toEqual([
      "match",
      ["get", "CD_SETOR"],
      "355030805000001",
      "#1d4ed8",
      "transparent",
    ]);
  });

  it("pintura nula apaga sem deixar match inválido", () => {
    const map = mapaFalso();
    expect(aplicarPinturaRaioX(map, null, setor)).toBe(true);
    const [, , expressao] = map.setPaintProperty.mock.calls[0];
    expect(expressao).toBe("transparent");
  });
});
