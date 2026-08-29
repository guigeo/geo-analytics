// O painel de camadas é o lugar onde a configuração do cliente aparece para quem
// usa: uma linha por camada que aquele cliente enxerga. Depois do passo 5 é aqui
// que se vê "tirei bairro do cliente B e não do A".
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LayerPanel } from "./LayerPanel";
import { camadas } from "@/configuracao";

describe("LayerPanel", () => {
  it("mostra uma linha por camada configurada", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} />);
    for (const c of camadas) {
      expect(screen.getByText(c.rotulo), `camada ${c.id}`).toBeInTheDocument();
    }
    expect(screen.getAllByRole("switch")).toHaveLength(camadas.length);
  });

  it("reflete no interruptor a visibilidade recebida", () => {
    const visiveis = Object.fromEntries(camadas.map((c, i) => [c.id, i === 0]));
    render(<LayerPanel visible={visiveis} onToggle={vi.fn()} />);
    const interruptores = screen.getAllByRole("switch");
    expect(interruptores[0]).toBeChecked();
    for (const outro of interruptores.slice(1)) {
      expect(outro).not.toBeChecked();
    }
  });
});
