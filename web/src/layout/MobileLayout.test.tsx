import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileLayout } from "./MobileLayout";

function montar() {
  return render(
    <MobileLayout
      mapa={<div>Canvas do mapa</div>}
      camadas={(fechar) => <button onClick={fechar}>Fechar camadas</button>}
      chat={(fechar) => <button onClick={fechar}>Fechar chat</button>}
      mais={<p>Conta e preferências</p>}
    />,
  );
}

describe("MobileLayout", () => {
  it("mantém o mapa visível e abre camadas como painel sobreposto", () => {
    montar();

    expect(screen.getByText("Canvas do mapa")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Camadas" }));

    expect(screen.getByRole("dialog", { name: "Camadas" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Fechar camadas" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("troca o conteúdo da gaveta sem desmontar o mapa", () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Chat" }));

    expect(screen.getByRole("dialog", { name: "Chat" })).toBeVisible();
    expect(screen.getByText("Canvas do mapa")).toBeVisible();
  });
});
