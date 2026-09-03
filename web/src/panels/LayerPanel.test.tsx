// O painel de camadas é onde a configuração do cliente aparece para quem usa. Desde
// os combos, ele também é a árvore do acervo: os desenhos do cliente são folhas, com
// o que se faz com eles na própria linha.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LayerPanel } from "./LayerPanel";
import { agruparCamadas } from "./grupos";
import { camadas, configuracaoAcervo } from "@/configuracao";
import type { ItemDoAcervo } from "@/desenho/camadas";
import { ErroDoAcervo } from "@/desenho/api";

const grupos = agruparCamadas(camadas);
const abertos = grupos.filter((g) => g.abertoPorPadrao);
const fechados = grupos.filter((g) => !g.abertoPorPadrao);

/** O acervo vazio e de pé: nem lista, nem erro. É o estado do cliente 1. */
const semAcervo = {
  itens: [] as ItemDoAcervo[],
  ocultos: [] as string[],
  onAlternarItem: vi.fn(),
  onFocalizar: vi.fn(),
  onApagar: vi.fn(),
  erroDoAcervo: null,
  onRecarregar: vi.fn(),
};

function desenho(id: string, nome: string, tipo = "poligono"): ItemDoAcervo {
  return {
    id,
    nome,
    tipo,
    cor: "#16a34a",
    geometria: { type: "Point", coordinates: [0, 0] },
  };
}

function combo(rotulo: string) {
  return screen.getByRole("button", { name: new RegExp(rotulo, "i") });
}

describe("LayerPanel", () => {
  it("mostra um combo por grupo que tem camada", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    for (const g of grupos) {
      expect(combo(g.rotulo), `combo ${g.id}`).toBeInTheDocument();
    }
  });

  it("o combo aberto mostra as camadas dele; o fechado não", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    for (const c of abertos.flatMap((g) => g.camadas)) {
      expect(screen.getByText(c.rotulo), `${c.id} deveria estar à vista`).toBeInTheDocument();
    }
    for (const c of fechados.flatMap((g) => g.camadas)) {
      expect(
        screen.queryByText(c.rotulo),
        `${c.id} deveria estar guardada`,
      ).not.toBeInTheDocument();
    }
  });

  it("clicar no combo fechado revela as camadas dele", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    const grupo = fechados[0];
    fireEvent.click(combo(grupo.rotulo));
    for (const c of grupo.camadas) {
      expect(screen.getByText(c.rotulo)).toBeInTheDocument();
    }
  });

  it("reflete no interruptor a visibilidade recebida", () => {
    const doGrupoAberto = abertos[0].camadas;
    const visiveis = Object.fromEntries(doGrupoAberto.map((c, i) => [c.id, i === 0]));
    render(<LayerPanel visible={visiveis} onToggle={vi.fn()} {...semAcervo} />);
    const interruptores = screen.getAllByRole("switch");
    expect(interruptores[0]).toBeChecked();
    for (const outro of interruptores.slice(1)) {
      expect(outro).not.toBeChecked();
    }
  });

  it("clicar no interruptor avisa qual camada", () => {
    const onToggle = vi.fn();
    render(<LayerPanel visible={{}} onToggle={onToggle} {...semAcervo} />);
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(onToggle).toHaveBeenCalledWith(abertos[0].camadas[0].id);
  });

  it("não repete a instrução que mora nos Atributos", () => {
    // O rodapé "clique numa feição" saiu daqui: ele falava do painel do lado, e a
    // mesma frase já é o estado vazio DELE.
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    expect(screen.queryByText(/clique numa feição/i)).not.toBeInTheDocument();
  });

  it("sem acervo, o combo do acervo não existe", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    expect(
      screen.queryByRole("button", { name: new RegExp(configuracaoAcervo.rotulo, "i") }),
    ).not.toBeInTheDocument();
  });

  it("os desenhos são as FOLHAS do combo do acervo, sem degrau de categoria", () => {
    render(
      <LayerPanel
        visible={{}}
        onToggle={vi.fn()}
        {...semAcervo}
        itens={[desenho("a", "POTENCIAL INCORP SCS"), desenho("b", "BASILAR CERAMICA 2")]}
      />,
    );
    expect(combo(configuracaoAcervo.rotulo)).toBeInTheDocument();
    expect(screen.getByText("POTENCIAL INCORP SCS")).toBeInTheDocument();
    expect(screen.getByText("BASILAR CERAMICA 2")).toBeInTheDocument();
    // Nada entre o combo e os desenhos: com uma categoria só, aquele degrau era um
    // clique a mais para chegar no mesmo lugar.
    expect(screen.queryByText("áreas do cliente")).not.toBeInTheDocument();
  });

  it("clicar no nome pede para focalizar aquele desenho", () => {
    const onFocalizar = vi.fn();
    const item = desenho("a", "POTENCIAL INCORP SCS");
    render(
      <LayerPanel
        visible={{}}
        onToggle={vi.fn()}
        {...semAcervo}
        itens={[item]}
        onFocalizar={onFocalizar}
      />,
    );
    fireEvent.click(screen.getByText("POTENCIAL INCORP SCS"));
    expect(onFocalizar).toHaveBeenCalledWith(item);
  });

  it("desenho oculto aparece desligado, e o clique avisa qual", () => {
    const onAlternarItem = vi.fn();
    render(
      <LayerPanel
        visible={{}}
        onToggle={vi.fn()}
        {...semAcervo}
        itens={[desenho("a", "Área A")]}
        ocultos={["a"]}
        onAlternarItem={onAlternarItem}
      />,
    );
    const interruptores = screen.getAllByRole("switch");
    const doAcervo = interruptores[interruptores.length - 1];
    expect(doAcervo).not.toBeChecked();

    fireEvent.click(doAcervo);
    expect(onAlternarItem).toHaveBeenCalledWith("a");
  });

  it("apagar pede confirmação na própria linha antes de apagar", () => {
    const onApagar = vi.fn();
    const item = desenho("a", "Área A");
    render(
      <LayerPanel
        visible={{}}
        onToggle={vi.fn()}
        {...semAcervo}
        itens={[item]}
        onApagar={onApagar}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /apagar área a/i }));
    expect(onApagar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^apagar$/i }));
    expect(onApagar).toHaveBeenCalledWith(item);
  });

  it("desistir da confirmação não apaga", () => {
    const onApagar = vi.fn();
    render(
      <LayerPanel
        visible={{}}
        onToggle={vi.fn()}
        {...semAcervo}
        itens={[desenho("a", "Área A")]}
        onApagar={onApagar}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /apagar área a/i }));
    fireEvent.click(screen.getByRole("button", { name: /^não$/i }));
    expect(onApagar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /apagar área a/i })).toBeInTheDocument();
  });

  it("acervo fora do ar não é acervo vazio: o combo aparece dizendo isso", () => {
    // AT-012. Sumir calado faria "não deu para perguntar" parecer "não há nada", que
    // é a única diferença capaz de decidir se vale tentar de novo.
    const onRecarregar = vi.fn();
    render(
      <LayerPanel
        visible={{}}
        onToggle={vi.fn()}
        {...semAcervo}
        erroDoAcervo={new ErroDoAcervo("caiu", 503)}
        onRecarregar={onRecarregar}
      />,
    );
    expect(combo(configuracaoAcervo.rotulo)).toBeInTheDocument();
    expect(screen.getByText(/mapa continua funcionando/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(onRecarregar).toHaveBeenCalledOnce();
  });
});
