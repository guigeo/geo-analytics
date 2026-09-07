import { describe, expect, it, vi } from "vitest";
import { camadas } from "@/configuracao";
import { applyHighlights, highlightLayers } from "./highlight";

describe("destaque por camada", () => {
  it("cria o par de destaque H3 pelo índice, não por um código territorial", () => {
    const h3 = camadas.filter((camada) => camada.id === "h3_domicilios");
    const ids = highlightLayers(h3).map((camada) => camada.id);

    expect(ids).toEqual(["h3_domicilios__highlight-fill", "h3_domicilios__highlight-line"]);
    const primeira = highlightLayers(h3)[0] as { filter: unknown };
    expect(primeira.filter).toEqual(["in", ["get", "H3_R9"], ["literal", []]]);
  });

  it("aplica o índice recebido pelo agente apenas na camada H3", () => {
    const h3 = camadas.filter((camada) => camada.id === "h3_domicilios");
    const setFilter = vi.fn();
    const mapa = {
      getLayer: (id: string) => ({ id }),
      setFilter,
    };

    expect(
      applyHighlights(mapa as never, { camada: "h3_domicilios", codigos: ["89a8100d2c7ffff"] }, h3),
    ).toBe(true);
    expect(setFilter).toHaveBeenCalledTimes(2);
    expect(setFilter).toHaveBeenLastCalledWith("h3_domicilios__highlight-line", [
      "in",
      ["get", "H3_R9"],
      ["literal", ["89a8100d2c7ffff"]],
    ]);
  });
});
