import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlocoDeEquipamentos } from "./blocos";
import type { BlocoEquipamentos } from "./api";

const recorteSaude =
  "assistência (atenção básica, especialidade, hospital e urgência); farmácia e apoio diagnóstico ficam no mapa, fora desta manchete";

const base: BlocoEquipamentos = {
  disponivel: true,
  ensino: { total: 12, recorte: "escolas da educação básica, todas as redes" },
  saude: { total: 7, total_no_mapa: 11, recorte: recorteSaude },
  fonte: "Inep · Censo Escolar 2025 · CNES · DATASUS",
  periodo: "2025 (escolas) · 2026-09 (saúde)",
  metodo: "contagem de pontos oficiais dentro do desenho, sem rateio",
  cobertura: "nacional",
  avisos: [],
};

describe("BlocoDeEquipamentos", () => {
  it("mostra as contagens oficiais, a procedência e o recorte da manchete", () => {
    render(<BlocoDeEquipamentos dados={base} />);
    expect(screen.getByText("Ensino")).toBeInTheDocument();
    expect(screen.getByText("Saúde")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(/CNES · DATASUS/)).toBeInTheDocument();
    expect(screen.getByText(/Inep · Censo Escolar 2025/)).toBeInTheDocument();
    expect(screen.getByText(/farmácia e apoio diagnóstico/i)).toBeInTheDocument();
  });

  it("mostra zero real, distinto de falta de cobertura", () => {
    render(
      <BlocoDeEquipamentos
        dados={{
          ...base,
          ensino: { ...base.ensino, total: 0 },
          saude: { ...base.saude, total: 0, total_no_mapa: 0 },
        }}
      />,
    );
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(screen.queryByText(/ainda não cobre/i)).not.toBeInTheDocument();
  });
});
