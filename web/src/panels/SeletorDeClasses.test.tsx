import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CATALOGO } from "@/configuracao/catalogo";
import { SeletorDeClasses } from "./SeletorDeClasses";

function abrir(rotulo: string) {
  fireEvent.click(screen.getByRole("button", { name: rotulo }));
}

describe("SeletorDeClasses", () => {
  it("nasce recolhido: o rótulo aparece, as classes não", () => {
    render(<SeletorDeClasses camada={CATALOGO.saude} ocultas={[]} onAlternar={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tipo de estabelecimento" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Hospital" })).not.toBeInTheDocument();
  });

  it("liga e desliga uma classe sem pedir rede", () => {
    const onAlternar = vi.fn();
    render(<SeletorDeClasses camada={CATALOGO.saude} ocultas={[]} onAlternar={onAlternar} />);
    abrir("Tipo de estabelecimento");

    const hospital = screen.getByRole("checkbox", { name: "Hospital" });
    expect(hospital).toBeChecked();

    fireEvent.click(hospital);
    expect(onAlternar).toHaveBeenCalledWith("hospital");
    expect(onAlternar).toHaveBeenCalledTimes(1);
  });

  it("mostra desmarcada a classe que já nasce oculta", () => {
    render(
      <SeletorDeClasses
        camada={CATALOGO.saude}
        ocultas={["farmacia", "apoio_diagnostico", "promocao"]}
        onAlternar={vi.fn()}
      />,
    );
    abrir("Tipo de estabelecimento");
    expect(screen.getByRole("checkbox", { name: "Farmácia" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Hospital" })).toBeChecked();
  });

  it("clicar de novo recolhe as classes", () => {
    render(<SeletorDeClasses camada={CATALOGO.escolas} ocultas={[]} onAlternar={vi.fn()} />);
    abrir("Rede");
    expect(screen.getByRole("checkbox", { name: "Municipal" })).toBeInTheDocument();
    abrir("Rede");
    expect(screen.queryByRole("checkbox", { name: "Municipal" })).not.toBeInTheDocument();
  });
});
