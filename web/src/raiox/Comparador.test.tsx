import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Comparador } from "./Comparador";
import type { RaioX } from "./api";

function raioX(ensino: number, saude: number): RaioX {
  return {
    escala: {
      area_km2: 1.25,
      populacao: 2_000,
      domicilios_ocupados: 800,
      densidade_hab_km2: 1_600,
    },
    perfil: { renda_media: 3_500 },
    classe_social: { pct_a: 12.5, pct_b: 28.4 },
    equipamentos: {
      disponivel: true,
      ensino: { enderecos: ensino },
      saude: { enderecos: saude },
    },
  } as RaioX;
}

describe("Comparador", () => {
  it("mantém os valores de cada área lado a lado, sem criar score", () => {
    render(
      <Comparador
        primeiroNome="Área central"
        primeiro={raioX(8, 3)}
        segundoNome="Área de expansão"
        segundo={raioX(2, 6)}
      />,
    );

    expect(screen.getByText("Duas áreas, mesma régua")).toBeInTheDocument();
    expect(screen.getByText("Área central")).toBeInTheDocument();
    expect(screen.getByText("Área de expansão")).toBeInTheDocument();
    expect(screen.getByText("Endereços de ensino")).toBeInTheDocument();
    expect(screen.getByText("Endereços de saúde")).toBeInTheDocument();
    expect(screen.getByText(/não cria um score/i)).toBeInTheDocument();
  });

  it("declara a falta de cobertura em vez de exibir zero", () => {
    const foraDaCobertura = raioX(0, 0);
    foraDaCobertura.equipamentos.disponivel = false;
    render(
      <Comparador
        primeiroNome="Área coberta"
        primeiro={raioX(1, 1)}
        segundoNome="Área fora"
        segundo={foraDaCobertura}
      />,
    );

    expect(screen.getAllByText("Fora da cobertura")).toHaveLength(2);
  });
});
