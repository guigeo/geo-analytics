// O painel de camadas é o lugar onde a configuração do cliente aparece para quem
// usa: uma linha por camada que aquele cliente enxerga. Depois do passo 5 é aqui
// que se vê "tirei bairro do cliente B e não do A".
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LayerPanel } from "./LayerPanel";
import { camadas, configuracaoAcervo } from "@/configuracao";
import { SEM_CATEGORIA, type CamadaDoAcervo } from "@/desenho/camadas";

// O acervo vazio é o estado normal do cliente 1, e é o que estas duas primeiras
// asserções continuam medindo: nada do acervo aparece quando não há acervo.
const semAcervo = {
  camadasDoAcervo: [] as CamadaDoAcervo[],
  categoriasOcultas: [] as string[],
  onAlternarCategoria: vi.fn(),
};

describe("LayerPanel", () => {
  it("mostra uma linha por camada configurada", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    for (const c of camadas) {
      expect(screen.getByText(c.rotulo), `camada ${c.id}`).toBeInTheDocument();
    }
    expect(screen.getAllByRole("switch")).toHaveLength(camadas.length);
  });

  it("reflete no interruptor a visibilidade recebida", () => {
    const visiveis = Object.fromEntries(camadas.map((c, i) => [c.id, i === 0]));
    render(<LayerPanel visible={visiveis} onToggle={vi.fn()} {...semAcervo} />);
    const interruptores = screen.getAllByRole("switch");
    expect(interruptores[0]).toBeChecked();
    for (const outro of interruptores.slice(1)) {
      expect(outro).not.toBeChecked();
    }
  });

  it("sem acervo, nada do acervo aparece — nem o cabeçalho", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    expect(screen.queryByText(configuracaoAcervo.rotulo)).not.toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(camadas.length);
  });

  it("cada categoria do acervo vira uma linha, com a contagem", () => {
    render(
      <LayerPanel
        visible={{}}
        onToggle={vi.fn()}
        categoriasOcultas={[]}
        onAlternarCategoria={vi.fn()}
        camadasDoAcervo={[
          { id: "áreas do cliente", rotulo: "áreas do cliente", cor: "#16a34a", quantidade: 2 },
          { id: SEM_CATEGORIA, rotulo: "Sem categoria", cor: "#2563eb", quantidade: 1 },
        ]}
      />,
    );
    expect(screen.getByText(configuracaoAcervo.rotulo)).toBeInTheDocument();
    expect(screen.getByText("áreas do cliente")).toBeInTheDocument();
    expect(screen.getByText("Sem categoria")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // Duas camadas do acervo além das do catálogo.
    expect(screen.getAllByRole("switch")).toHaveLength(camadas.length + 2);
  });

  it("categoria oculta aparece desligada, e o clique avisa qual", () => {
    const onAlternarCategoria = vi.fn();
    render(
      <LayerPanel
        visible={{}}
        onToggle={vi.fn()}
        categoriasOcultas={["lotes"]}
        onAlternarCategoria={onAlternarCategoria}
        camadasDoAcervo={[{ id: "lotes", rotulo: "lotes", cor: "#16a34a", quantidade: 3 }]}
      />,
    );
    const interruptores = screen.getAllByRole("switch");
    const doAcervo = interruptores[interruptores.length - 1];
    expect(doAcervo).not.toBeChecked();

    fireEvent.click(doAcervo);
    expect(onAlternarCategoria).toHaveBeenCalledWith("lotes");
  });
});
