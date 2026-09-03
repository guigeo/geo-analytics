// Os atributos saíram da barra lateral e foram para o popup ancorado na feição. O
// conteúdo é o mesmo, e é isso que estes testes guardam: a mudança de lugar não podia
// mexer no que se lê nem em de onde cada rótulo vem.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Atributos } from "./Atributos";
import { camadas } from "@/configuracao";
import { DESENHOS_SOURCE_ID } from "@/desenho/fonte";
import type { SelectedFeature } from "@/map/MapView";

const PONTO: [number, number] = [-46.57, -23.61];

// Município, e não a primeira da lista: a UF tem "UF" como rótulo da camada E como
// rótulo de um atributo, e o teste procuraria dois elementos com o mesmo texto.
const CAMADA = camadas.find((c) => c.id === "municipio") ?? camadas[0];

function selecao(layerId: string, properties: Record<string, unknown>): SelectedFeature {
  return { layerId, properties, lngLat: PONTO };
}

describe("Atributos", () => {
  it("de uma camada, os rótulos vêm da configuração do cliente", () => {
    const camada = CAMADA;
    const props = Object.fromEntries(camada.atributos.map((a, i) => [a.chave, `valor ${i}`]));
    render(<Atributos selected={selecao(camada.id, props)} onFechar={vi.fn()} />);

    expect(screen.getByText(camada.rotulo)).toBeInTheDocument();
    for (const a of camada.atributos) {
      expect(screen.getByText(a.rotulo), `rótulo ${a.chave}`).toBeInTheDocument();
    }
  });

  it("valor ausente vira travessão, e não string vazia", () => {
    // Célula vazia lê como defeito de carregamento; o travessão diz "não há".
    render(<Atributos selected={selecao(CAMADA.id, {})} onFechar={vi.fn()} />);
    expect(screen.getAllByText("—").length).toBe(CAMADA.atributos.length);
  });

  it("de um desenho, o título é o nome e os rótulos são os da casca", () => {
    // Desenho não é camada configurada: tem as mesmas colunas em todo cliente, e por
    // isso os rótulos vêm de `desenho/atributos.ts`, não de `camada.atributos`.
    render(
      <Atributos
        selected={selecao(DESENHOS_SOURCE_ID, {
          nome: "BASILAR CERAMICA 2",
          cor: "#16a34a",
          tipo: "poligono",
        })}
        onFechar={vi.fn()}
      />,
    );
    expect(screen.getByText("BASILAR CERAMICA 2")).toBeInTheDocument();
  });

  it("camada que o cliente não enxerga não inventa conteúdo", () => {
    const { container } = render(
      <Atributos selected={selecao("camada_que_nao_existe", { x: 1 })} onFechar={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("o ✕ pede para fechar", () => {
    const onFechar = vi.fn();
    render(<Atributos selected={selecao(CAMADA.id, {})} onFechar={onFechar} />);
    fireEvent.click(screen.getByRole("button", { name: /fechar atributos/i }));
    expect(onFechar).toHaveBeenCalledOnce();
  });
});
