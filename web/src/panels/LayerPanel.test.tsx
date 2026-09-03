// O painel de camadas é onde a configuração do cliente aparece para quem usa. Desde
// os combos, ele também é onde se vê o que está LIGADO sem abrir nada — a contagem do
// combo fechado é o que impede a gaveta de virar camada esquecida.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LayerPanel } from "./LayerPanel";
import { agruparCamadas } from "./grupos";
import { camadas, configuracaoAcervo } from "@/configuracao";
import { SEM_CATEGORIA, type CamadaDoAcervo } from "@/desenho/camadas";

const grupos = agruparCamadas(camadas);
const abertos = grupos.filter((g) => g.abertoPorPadrao);
const fechados = grupos.filter((g) => !g.abertoPorPadrao);

const semAcervo = {
  camadasDoAcervo: [] as CamadaDoAcervo[],
  categoriasOcultas: [] as string[],
  onAlternarCategoria: vi.fn(),
};

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

  it("o combo fechado diz quantas estão ligadas", () => {
    // É o que substitui ver a lista: sem a contagem, fechar o combo esconderia uma
    // camada acesa e o mapa passaria a mostrar algo que o painel não explica.
    const grupo = fechados[0];
    const [primeira] = grupo.camadas;
    render(<LayerPanel visible={{ [primeira.id]: true }} onToggle={vi.fn()} {...semAcervo} />);
    expect(combo(grupo.rotulo)).toHaveTextContent(`1/${grupo.camadas.length}`);
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

  it("o acervo vira um combo com o nome que o cliente dá a ele", () => {
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
    expect(combo(configuracaoAcervo.rotulo)).toBeInTheDocument();
    expect(screen.getByText("áreas do cliente")).toBeInTheDocument();
    expect(screen.getByText("Sem categoria")).toBeInTheDocument();
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
