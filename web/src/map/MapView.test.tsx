// O que os testes de cálculo e de painel não alcançam: o gesto.
//
// O clique no mapa é onde a medição divide o mesmo evento com a seleção de
// feição, e é a única parte desta ferramenta que não se prova lendo. Sem WebGL no
// jsdom, o MapLibre entra dublado — mas o que se exercita é o código deste
// arquivo, não o dele: os handlers registrados no mapa são capturados e disparados
// à mão, e o que se verifica é o que ELES fazem.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MapView } from "./MapView";
import { criarEstadoMedicao, MEDICAO_SOURCE_ID, type Coordenada } from "./medicao";

const handlers = new Map<string, (e: unknown) => void>();
const setData = vi.fn();
const doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
const canvas = { style: { cursor: "" } };

const mapaDublado = {
  on: (evento: string, fn: (e: unknown) => void) => handlers.set(evento, fn),
  once: (evento: string, fn: (e: unknown) => void) => handlers.set(`once:${evento}`, fn),
  addControl: vi.fn(),
  remove: vi.fn(),
  getCanvas: () => canvas,
  getSource: (id: string) => (id === MEDICAO_SOURCE_ID ? { setData } : { setData: vi.fn() }),
  getLayer: () => undefined,
  setLayoutProperty: vi.fn(),
  queryRenderedFeatures: () => [],
  isStyleLoaded: () => true,
  getBounds: () => ({ getWest: () => 0, getSouth: () => 0, getEast: () => 1, getNorth: () => 1 }),
  getCenter: () => ({ lng: 0, lat: 0 }),
  setStyle: vi.fn(),
  doubleClickZoom,
};

vi.mock("maplibre-gl", () => ({
  default: {
    Map: vi.fn(() => mapaDublado),
    NavigationControl: vi.fn(() => ({})),
  },
}));
vi.mock("../lib/pmtiles", () => ({ registerPMTiles: vi.fn() }));
// Só as duas funções que tocam o mapa. O módulo também exporta os ícones que o
// catálogo de camadas importa — dublá-lo inteiro derruba a configuração no boot.
vi.mock("./icons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./icons")>()),
  ensureIcon: vi.fn(),
  loadIcons: () => Promise.resolve(new Map()),
}));

const PONTO: Coordenada = [-46.5745, -23.618];

function montar(props: Partial<React.ComponentProps<typeof MapView>> = {}) {
  const onVerticeMedicao = vi.fn();
  const onEncerrarMedicao = vi.fn();
  const onSelect = vi.fn();
  const resultado = render(
    <MapView
      visible={{}}
      theme="light"
      satellite={false}
      satelliteOverlay={false}
      onSelect={onSelect}
      medicao={criarEstadoMedicao(null)}
      onVerticeMedicao={onVerticeMedicao}
      onEncerrarMedicao={onEncerrarMedicao}
      {...props}
    />,
  );
  return { ...resultado, onVerticeMedicao, onEncerrarMedicao, onSelect };
}

const clicar = () =>
  handlers.get("click")?.({ lngLat: { lng: PONTO[0], lat: PONTO[1] }, point: {} });

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
  canvas.style.cursor = "";
});

describe("MapView e a medição", () => {
  it("fora da ferramenta, o clique segue sendo da seleção", () => {
    const { onVerticeMedicao, onSelect } = montar();
    clicar();
    expect(onVerticeMedicao).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("medindo, o clique marca vértice e NÃO seleciona", () => {
    const { onVerticeMedicao, onSelect } = montar({ medicao: criarEstadoMedicao("area", []) });
    clicar();
    expect(onVerticeMedicao).toHaveBeenCalledWith(PONTO);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Esc encerra a medição, e só quando há uma", () => {
    const { onEncerrarMedicao, rerender, unmount } = montar({
      medicao: criarEstadoMedicao("distancia", []),
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEncerrarMedicao).toHaveBeenCalledOnce();

    rerender(
      <MapView
        visible={{}}
        theme="light"
        satellite={false}
        satelliteOverlay={false}
        onSelect={vi.fn()}
        medicao={criarEstadoMedicao(null)}
        onVerticeMedicao={vi.fn()}
        onEncerrarMedicao={onEncerrarMedicao}
      />,
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEncerrarMedicao).toHaveBeenCalledOnce();

    // E o ouvinte sai junto com o componente: sem isto ele se acumularia a cada
    // remontagem e o Esc dispararia N vezes.
    unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEncerrarMedicao).toHaveBeenCalledOnce();
  });

  it("desenha os vértices na fonte da medição", () => {
    montar({ medicao: criarEstadoMedicao("distancia", [PONTO, [-46.568, -23.618]]) });
    const desenhado = setData.mock.calls.at(-1)?.[0] as GeoJSON.FeatureCollection;
    expect(desenhado.features.map((f) => f.geometry.type)).toEqual([
      "Point",
      "Point",
      "LineString",
    ]);
  });

  it("apaga o desenho quando a ferramenta encerra", () => {
    montar({ medicao: criarEstadoMedicao(null) });
    expect(setData).toHaveBeenCalledWith({ type: "FeatureCollection", features: [] });
  });

  it("desliga o zoom de duplo clique enquanto mede, e devolve depois", () => {
    montar({ medicao: criarEstadoMedicao("area", []) });
    expect(doubleClickZoom.disable).toHaveBeenCalled();
    expect(doubleClickZoom.enable).not.toHaveBeenCalled();

    vi.clearAllMocks();
    montar({ medicao: criarEstadoMedicao(null) });
    expect(doubleClickZoom.enable).toHaveBeenCalled();
    expect(doubleClickZoom.disable).not.toHaveBeenCalled();
  });

  it("o cursor vira mira enquanto mede", () => {
    montar({ medicao: criarEstadoMedicao("area", []) });
    handlers.get("mousemove")?.({ point: {} });
    expect(canvas.style.cursor).toBe("crosshair");
  });
});
