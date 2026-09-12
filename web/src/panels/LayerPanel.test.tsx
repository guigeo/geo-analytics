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

/** O acervo vazio e de pé: nem lista, nem erro. É o estado do cliente 1. */
const semAcervo = {
  temaAtivo: {} as Record<string, string>,
  onEscolherTema: vi.fn(),
  itens: [] as ItemDoAcervo[],
  ocultos: [] as string[],
  onAlternarItem: vi.fn(),
  onFocalizar: vi.fn(),
  onApagar: vi.fn(),
  onRaioX: vi.fn(),
  erroDoAcervo: null,
  onRecarregar: vi.fn(),
  onRecolher: vi.fn(),
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

/** Nasce tudo recolhido, então quase todo teste precisa abrir antes de olhar. */
function abrir(rotulo: string) {
  fireEvent.click(combo(rotulo));
}

describe("LayerPanel", () => {
  it("mostra um combo por grupo que tem camada", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    for (const g of grupos) {
      expect(combo(g.rotulo), `combo ${g.id}`).toBeInTheDocument();
    }
  });

  it("toda sessão começa com tudo recolhido", () => {
    // Regra da casca desde 2026-09-02: quem entra vê os assuntos, não as camadas.
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    for (const c of grupos.flatMap((g) => g.camadas)) {
      expect(
        screen.queryByText(c.rotulo),
        `${c.id} deveria estar guardada`,
      ).not.toBeInTheDocument();
    }
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("clicar no combo revela as camadas dele, e só as dele", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    const [primeiro, segundo] = grupos;
    abrir(primeiro.rotulo);
    for (const c of primeiro.camadas) {
      expect(screen.getByText(c.rotulo)).toBeInTheDocument();
    }
    for (const c of segundo.camadas) {
      expect(screen.queryByText(c.rotulo)).not.toBeInTheDocument();
    }
  });

  it("clicar de novo recolhe", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    const [grupo] = grupos;
    abrir(grupo.rotulo);
    abrir(grupo.rotulo);
    expect(screen.queryByText(grupo.camadas[0].rotulo)).not.toBeInTheDocument();
  });

  it("reflete no olho a visibilidade recebida", () => {
    const [grupo] = grupos;
    const visiveis = Object.fromEntries(grupo.camadas.map((c, i) => [c.id, i === 0]));
    render(<LayerPanel visible={visiveis} onToggle={vi.fn()} {...semAcervo} />);
    abrir(grupo.rotulo);
    const [ligada, ...apagadas] = grupo.camadas;
    expect(screen.getByRole("switch", { name: new RegExp(ligada.rotulo, "i") })).toBeChecked();
    for (const c of apagadas) {
      expect(screen.getByRole("switch", { name: new RegExp(c.rotulo, "i") })).not.toBeChecked();
    }
  });

  it("o combo fechado conta o que está ligado dentro dele", () => {
    // É esta conta que avisa, com o grupo recolhido, que há camada acesa ali. A
    // alternativa testada antes — levar a camada ligada para uma seção no topo —
    // empurrava a lista para baixo no clique, e o painel se mexia sozinho.
    const [primeiro, segundo] = grupos;
    render(
      <LayerPanel visible={{ [primeiro.camadas[0].id]: true }} onToggle={vi.fn()} {...semAcervo} />,
    );
    expect(combo(primeiro.rotulo)).toHaveTextContent("1");
    // Grupo sem nada ligado não ganha número nenhum: zero se diz com ausência.
    expect(combo(segundo.rotulo)).toHaveTextContent(new RegExp(`^${segundo.rotulo}$`));
  });

  it("a camada ligada fica no lugar dela, e não sobe para o topo", () => {
    const [grupo] = grupos;
    render(
      <LayerPanel visible={{ [grupo.camadas[0].id]: true }} onToggle={vi.fn()} {...semAcervo} />,
    );
    // Com tudo recolhido, nada da camada aparece: ela mora no combo dela.
    expect(screen.queryByText(grupo.camadas[0].rotulo)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /limpar tudo/i })).not.toBeInTheDocument();
  });

  it("mostra a procedência de quem tem, e nada no lugar de quem não tem", () => {
    // A lacuna é a decisão: as antenas, as rodovias e as ferrovias não têm origem
    // registrada em lugar nenhum do repositório, e escrever "a confirmar" na tela do
    // cliente seria pior do que não escrever nada.
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    abrir("Informações IBGE");
    expect(screen.getByText("IBGE · Censo 2022")).toBeInTheDocument();

    abrir("Infraestrutura");
    const semFonte = camadas.filter((c) => c.grupo === "infraestrutura" && !c.fonte);
    expect(semFonte.length).toBeGreaterThan(0);
    expect(screen.queryByText(/a confirmar/i)).not.toBeInTheDocument();
  });

  it("clicar no interruptor avisa qual camada", () => {
    const onToggle = vi.fn();
    const [grupo] = grupos;
    render(<LayerPanel visible={{}} onToggle={onToggle} {...semAcervo} />);
    abrir(grupo.rotulo);
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(onToggle).toHaveBeenCalledWith(grupo.camadas[0].id);
  });

  it("mostra a cobertura das camadas parciais, e nada além disso", () => {
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    abrir("Regulação urbana");
    expect(screen.getByText("São Paulo (capital)")).toBeInTheDocument();
    // A lei e a data saíram da cobertura e viraram a procedência, debaixo do nome.
    expect(screen.getByText("Lei 18.177/2024 · 28/03/2025")).toBeInTheDocument();

    abrir("Informações IBGE");
    expect(
      screen.getByText("895 de 5.571 municípios · São Paulo não tem bairro nesta malha"),
    ).toBeInTheDocument();

    // A legenda categórica saiu do painel: a camada de zoneamento fica com uma linha
    // só, como as do IBGE. Sem isto, o teste passaria de novo se ela voltasse sem querer.
    expect(screen.queryByRole("group", { name: "Legenda categórica" })).toBeNull();
    expect(screen.queryByText("ZEIS-1")).toBeNull();
  });

  it("mostra a legenda numérica apenas quando a camada H3 está ligada", () => {
    const visible = { h3_domicilios: true };
    render(<LayerPanel visible={visible} onToggle={vi.fn()} {...semAcervo} />);
    abrir("Indicadores territoriais");
    expect(
      screen.getByRole("group", { name: "Legenda: Domicílios em apartamento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("37 municípios da concentração urbana de São Paulo"),
    ).toBeInTheDocument();
    expect(screen.getByText("820+")).toBeInTheDocument();
  });

  it("o cabeçalho oferece recolher a coluna", () => {
    const onRecolher = vi.fn();
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} onRecolher={onRecolher} />);
    fireEvent.click(screen.getByRole("button", { name: /recolher o painel/i }));
    expect(onRecolher).toHaveBeenCalledOnce();
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

  it("o combo do acervo também nasce recolhido", () => {
    render(
      <LayerPanel
        visible={{}}
        onToggle={vi.fn()}
        {...semAcervo}
        itens={[desenho("a", "Área A")]}
      />,
    );
    expect(combo(configuracaoAcervo.rotulo)).toBeInTheDocument();
    expect(screen.queryByText("Área A")).not.toBeInTheDocument();
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
    abrir(configuracaoAcervo.rotulo);
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
    abrir(configuracaoAcervo.rotulo);
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
    abrir(configuracaoAcervo.rotulo);
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
    abrir(configuracaoAcervo.rotulo);
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
    abrir(configuracaoAcervo.rotulo);
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
    abrir(configuracaoAcervo.rotulo);
    expect(screen.getByText(/mapa continua funcionando/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(onRecarregar).toHaveBeenCalledOnce();
  });

  it("a camada de várias variáveis oferece a escolha, mesmo desligada", () => {
    // AT-004. O seletor responde "o que esta camada mostra", que é o que se quer
    // saber ANTES de ligar; a legenda, que responde pelas cores, continua só quando
    // a camada está acesa.
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    abrir("Indicadores territoriais");
    expect(
      screen.getByRole("button", { name: /variável de domicílios por célula/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /^Legenda:/ })).not.toBeInTheDocument();
  });

  it("nasce no primeiro tema, e a legenda é a dele", () => {
    // AT-003: o mesmo tema que o style leva na criação.
    const h3 = camadas.find((c) => c.temasNumericos)!;
    render(<LayerPanel visible={{ [h3.id]: true }} onToggle={vi.fn()} {...semAcervo} />);
    abrir("Indicadores territoriais");
    expect(
      screen.getByRole("group", { name: `Legenda: ${h3.temasNumericos![0].rotulo}` }),
    ).toBeInTheDocument();
    expect(screen.getByText("820+")).toBeInTheDocument();
  });

  it("escolher outra variável avisa qual, com a camada e o tema", () => {
    // AT-001. Quem repinta é o mapa, a partir do estado lá em cima — o painel só diz
    // o que foi escolhido.
    const onEscolherTema = vi.fn();
    const h3 = camadas.find((c) => c.temasNumericos)!;
    render(
      <LayerPanel
        visible={{ [h3.id]: true }}
        onToggle={vi.fn()}
        {...semAcervo}
        onEscolherTema={onEscolherTema}
      />,
    );
    abrir("Indicadores territoriais");
    fireEvent.click(screen.getByRole("button", { name: /variável de domicílios por célula/i }));
    const segundo = h3.temasNumericos![1];
    fireEvent.click(screen.getByRole("option", { name: new RegExp(segundo.rotulo, "i") }));
    expect(onEscolherTema).toHaveBeenCalledWith(h3.id, segundo.id);
  });

  it("a legenda mostra o tema ativo, e os limites dele", () => {
    const h3 = camadas.find((c) => c.temasNumericos)!;
    const segundo = h3.temasNumericos![1];
    render(
      <LayerPanel
        visible={{ [h3.id]: true }}
        onToggle={vi.fn()}
        {...semAcervo}
        temaAtivo={{ [h3.id]: segundo.id }}
      />,
    );
    abrir("Indicadores territoriais");
    expect(
      screen.getByRole("group", { name: `Legenda: ${segundo.rotulo}` }),
    ).toBeInTheDocument();
    expect(screen.getByText(`${segundo.maximo}+`)).toBeInTheDocument();
  });

  it("camada de tema único não ganha seletor", () => {
    // O zoneamento pinta por categoria: oferecer escolha ali seria prometer o que a
    // camada não tem.
    render(<LayerPanel visible={{}} onToggle={vi.fn()} {...semAcervo} />);
    abrir("Regulação urbana");
    expect(screen.queryByRole("button", { name: /variável de zoneamento/i })).toBeNull();
  });
});
