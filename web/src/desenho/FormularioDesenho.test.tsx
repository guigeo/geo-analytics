// O formulário mudou de casa — do canto do mapa para a coluna da esquerda. O que
// estes testes guardam é o que a mudança não podia levar junto: a recusa de salvar
// sem nome, o corte dos espaços, o opcional que vira null e o cancelar.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormularioDesenho } from "./FormularioDesenho";

const base = {
  tipo: "poligono" as const,
  area: "2,4 ha",
  categorias: ["áreas do cliente"],
  salvando: false,
  erro: null,
};

describe("FormularioDesenho", () => {
  it("sem nome, não dá para salvar", () => {
    render(<FormularioDesenho {...base} onSalvar={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^salvar$/i })).toBeDisabled();
  });

  it("só espaço não conta como nome", () => {
    render(<FormularioDesenho {...base} onSalvar={vi.fn()} onCancelar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /^salvar$/i })).toBeDisabled();
  });

  it("salva com o nome aparado e os opcionais vazios como null", () => {
    // `null` e não string vazia: a coluna é anulável no banco, e "" viraria uma
    // categoria de nome vazio no autocomplete do próximo desenho.
    const onSalvar = vi.fn();
    render(<FormularioDesenho {...base} onSalvar={onSalvar} onCancelar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "  Área A  " } });
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(onSalvar).toHaveBeenCalledWith({
      nome: "Área A",
      categoria: null,
      cor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      observacao: null,
    });
  });

  it("a área do traçado aparece como informação", () => {
    render(<FormularioDesenho {...base} onSalvar={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.getByText(/2,4 ha/)).toBeInTheDocument();
  });

  it("salvando, os dois botões travam", () => {
    // Sem isso, clicar duas vezes cria dois desenhos: escrita não tem retomada.
    render(<FormularioDesenho {...base} salvando onSalvar={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.getByRole("button", { name: /salvando/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^cancelar$/i })).toBeDisabled();
  });

  it("a recusa do servidor aparece como alerta, e não some sozinha", () => {
    render(
      <FormularioDesenho {...base} erro="Nome já usado." onSalvar={vi.fn()} onCancelar={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Nome já usado.");
  });

  it("cancelar avisa quem chamou", () => {
    const onCancelar = vi.fn();
    render(<FormularioDesenho {...base} onSalvar={vi.fn()} onCancelar={onCancelar} />);
    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));
    expect(onCancelar).toHaveBeenCalledOnce();
  });
});
