// O painel é a única saída da medição: se ele mentir, o número errado sai
// formatado e com unidade, e ninguém desconfia. O que se cobre aqui é o que a
// pessoa lê — não o cálculo, que tem teste próprio em `map/medicao.test.ts`.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PainelMedicao } from "./PainelMedicao";
import { criarEstadoMedicao, type Coordenada } from "@/map/medicao";

const TERRENO: Coordenada[] = [
  [-46.5745, -23.618],
  [-46.568, -23.618],
  [-46.568, -23.612],
  [-46.5745, -23.612],
];

describe("PainelMedicao", () => {
  it("não existe enquanto não há ferramenta ativa", () => {
    const { container } = render(
      <PainelMedicao
        medicao={criarEstadoMedicao(null)}
        onEncerrar={vi.fn()}
        onRecomecar={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("pede os vértices que faltam em vez de anunciar zero", () => {
    render(
      <PainelMedicao
        medicao={criarEstadoMedicao("area", TERRENO.slice(0, 1))}
        onEncerrar={vi.fn()}
        onRecomecar={vi.fn()}
      />,
    );
    expect(screen.getByText("Marque mais 2 pontos")).toBeInTheDocument();
    expect(screen.getByText("1 vértice")).toBeInTheDocument();
    // Sem medida ainda, a ressalva não faz sentido e não deve aparecer.
    expect(screen.queryByText(/não vale como levantamento/)).not.toBeInTheDocument();
  });

  it("mostra a medida e a ressalva de que é estimativa", () => {
    render(
      <PainelMedicao
        medicao={criarEstadoMedicao("area", TERRENO)}
        onEncerrar={vi.fn()}
        onRecomecar={vi.fn()}
      />,
    );
    expect(screen.getByText("441.828 m²")).toBeInTheDocument();
    expect(screen.getByText("4 vértices")).toBeInTheDocument();
    expect(screen.getByText(/não vale como levantamento/)).toBeInTheDocument();
  });

  it("distingue as duas ferramentas pelo título acessível", () => {
    const { unmount } = render(
      <PainelMedicao
        medicao={criarEstadoMedicao("distancia", TERRENO)}
        onEncerrar={vi.fn()}
        onRecomecar={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Medição de distância" })).toBeInTheDocument();
    unmount();

    render(
      <PainelMedicao
        medicao={criarEstadoMedicao("area", TERRENO)}
        onEncerrar={vi.fn()}
        onRecomecar={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Medição de área" })).toBeInTheDocument();
  });

  it("recomeçar só fica disponível depois do primeiro vértice", () => {
    const onRecomecar = vi.fn();
    const { rerender } = render(
      <PainelMedicao
        medicao={criarEstadoMedicao("distancia", [])}
        onEncerrar={vi.fn()}
        onRecomecar={onRecomecar}
      />,
    );
    expect(screen.getByRole("button", { name: /Recomeçar/ })).toBeDisabled();

    rerender(
      <PainelMedicao
        medicao={criarEstadoMedicao("distancia", TERRENO)}
        onEncerrar={vi.fn()}
        onRecomecar={onRecomecar}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Recomeçar/ }));
    expect(onRecomecar).toHaveBeenCalledOnce();
  });

  it("o X encerra", () => {
    const onEncerrar = vi.fn();
    render(
      <PainelMedicao
        medicao={criarEstadoMedicao("area", TERRENO)}
        onEncerrar={onEncerrar}
        onRecomecar={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Encerrar medição" }));
    expect(onEncerrar).toHaveBeenCalledOnce();
  });
});
