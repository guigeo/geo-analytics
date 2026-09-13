import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlocoDeEquipamentos } from "./blocos";
import type { BlocoEquipamentos } from "./api";

const base: BlocoEquipamentos = {
  disponivel: true,
  cobertura_pct: 100,
  ensino: { enderecos: 12, coordenadas_imprecisas: 1 },
  saude: { enderecos: 7, coordenadas_imprecisas: 0 },
  fonte: "CNEFE 2022 — IBGE",
  periodo: "2022",
  metodo: "contagem de pontos dentro do desenho, sem rateio",
  cobertura: "37 municípios da concentração urbana de São Paulo",
  avisos: ["1 endereço usa coordenada menos precisa"],
};

describe("BlocoDeEquipamentos", () => {
  it("mostra as contagens separadas e a proveniência", () => {
    render(<BlocoDeEquipamentos dados={base} />);
    expect(screen.getByText("Ensino")).toBeInTheDocument();
    expect(screen.getByText("Saúde")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(/sem rateio/)).toBeInTheDocument();
  });

  it("não transforma ausência de cobertura em dois zeros", () => {
    render(
      <BlocoDeEquipamentos
        dados={{ ...base, disponivel: false, cobertura_pct: 0, avisos: ["fora da cobertura"] }}
      />,
    );
    expect(screen.getByText(/ainda não cobre esta área/)).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });
});
