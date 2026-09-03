// A barra de desenho saiu de cima do mapa: os três modos foram para o cabeçalho e o
// estado do traçado virou uma faixa sob ele. O que estes testes guardam é o que a
// mudança de lugar NÃO podia levar junto — o gesto de desligar clicando no modo
// ativo, e as duas razões pelas quais salvar fica indisponível.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BarraDoDesenho, FerramentasDeDesenho } from "./BarraFerramentas";
import { criarEstadoDesenho } from "./estado";

const QUADRADO: [number, number][] = [
  [-46.66, -23.57],
  [-46.65, -23.57],
  [-46.65, -23.56],
];

function comTooltip(no: React.ReactNode) {
  return render(<TooltipProvider>{no}</TooltipProvider>);
}

describe("FerramentasDeDesenho", () => {
  it("mostra os três modos no cabeçalho", () => {
    comTooltip(<FerramentasDeDesenho modo={null} onAlternarModo={vi.fn()} />);
    for (const rotulo of ["ponto", "área", "raio"]) {
      expect(screen.getByRole("button", { name: `Desenhar ${rotulo}` })).toBeInTheDocument();
    }
  });

  it("o modo ativo aparece pressionado, e os outros não", () => {
    comTooltip(<FerramentasDeDesenho modo="poligono" onAlternarModo={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Desenhar área" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Desenhar ponto" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("clicar no modo ativo pede para desligar — o mesmo gesto da medição", () => {
    const onAlternarModo = vi.fn();
    comTooltip(<FerramentasDeDesenho modo="ponto" onAlternarModo={onAlternarModo} />);
    fireEvent.click(screen.getByRole("button", { name: "Desenhar ponto" }));
    expect(onAlternarModo).toHaveBeenCalledWith("ponto");
  });
});

describe("BarraDoDesenho", () => {
  const acoes = {
    onDesfazer: vi.fn(),
    onCancelar: vi.fn(),
    onSalvar: vi.fn(),
    onMudarRaio: vi.fn(),
  };

  it("sem desenho em andamento, não ocupa a tela", () => {
    // A faixa empurra o mapa; existir vazia roubaria altura em todas as outras horas.
    const { container } = render(<BarraDoDesenho estado={criarEstadoDesenho(null)} {...acoes} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("desenhando, diz quantos pontos ainda faltam", () => {
    render(<BarraDoDesenho estado={criarEstadoDesenho("poligono", [])} {...acoes} />);
    expect(screen.getByText(/marque mais/i)).toBeInTheDocument();
  });

  it("traçado incompleto não deixa salvar", () => {
    render(<BarraDoDesenho estado={criarEstadoDesenho("poligono", [])} {...acoes} />);
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
  });

  it("traçado completo deixa salvar", () => {
    const onSalvar = vi.fn();
    render(
      <BarraDoDesenho
        estado={criarEstadoDesenho("poligono", QUADRADO)}
        {...acoes}
        onSalvar={onSalvar}
      />,
    );
    const salvar = screen.getByRole("button", { name: /salvar/i });
    expect(salvar).toBeEnabled();
    fireEvent.click(salvar);
    expect(onSalvar).toHaveBeenCalledOnce();
  });

  it("acervo fora do ar: desenha, não salva — e a faixa diz por quê", () => {
    render(
      <BarraDoDesenho
        estado={criarEstadoDesenho("poligono", QUADRADO)}
        {...acoes}
        acervoIndisponivel
      />,
    );
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
    expect(screen.getByText(/acervo fora do ar/i)).toBeInTheDocument();
  });

  it("o campo de raio só existe no modo raio", () => {
    // É o único modo em que a geometria não sai só dos cliques.
    const { rerender } = render(
      <BarraDoDesenho estado={criarEstadoDesenho("buffer", [])} {...acoes} />,
    );
    expect(screen.getByLabelText(/raio/i)).toBeInTheDocument();

    rerender(<BarraDoDesenho estado={criarEstadoDesenho("poligono", [])} {...acoes} />);
    expect(screen.queryByLabelText(/raio/i)).not.toBeInTheDocument();
  });

  it("desfazer só depois de haver o que desfazer", () => {
    const { rerender } = render(
      <BarraDoDesenho estado={criarEstadoDesenho("poligono", [])} {...acoes} />,
    );
    expect(screen.getByRole("button", { name: /desfazer/i })).toBeDisabled();

    rerender(<BarraDoDesenho estado={criarEstadoDesenho("poligono", QUADRADO)} {...acoes} />);
    expect(screen.getByRole("button", { name: /desfazer/i })).toBeEnabled();
  });
});
