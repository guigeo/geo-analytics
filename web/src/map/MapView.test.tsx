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
import { criarEstadoDesenho } from "@/desenho/estado";
import { COLECAO_VAZIA, DESENHOS_SOURCE_ID, TRACADO_SOURCE_ID } from "@/desenho/fonte";

const handlers = new Map<string, (e: unknown) => void>();
const setData = vi.fn();
// Um espião por fonte: as três mudam por motivos diferentes, e um espião só não
// distinguiria "apagou a medição" de "não havia desenho".
const setDataTracado = vi.fn();
const setDataAcervo = vi.fn();
const FONTES: Record<string, { setData: ReturnType<typeof vi.fn> }> = {
  [MEDICAO_SOURCE_ID]: { setData },
  [TRACADO_SOURCE_ID]: { setData: setDataTracado },
  [DESENHOS_SOURCE_ID]: { setData: setDataAcervo },
};
const doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
const canvas = { style: { cursor: "" } };

const mapaDublado = {
  on: (evento: string, fn: (e: unknown) => void) => handlers.set(evento, fn),
  once: (evento: string, fn: (e: unknown) => void) => handlers.set(`once:${evento}`, fn),
  addControl: vi.fn(),
  remove: vi.fn(),
  getCanvas: () => canvas,
  getSource: (id: string) => FONTES[id] ?? { setData: vi.fn() },
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
  const onVerticeDesenho = vi.fn();
  const onCancelarDesenho = vi.fn();
  const onEncerrarDesenho = vi.fn();
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
      desenho={criarEstadoDesenho(null)}
      onVerticeDesenho={onVerticeDesenho}
      onCancelarDesenho={onCancelarDesenho}
      onEncerrarDesenho={onEncerrarDesenho}
      desenhos={COLECAO_VAZIA}
      {...props}
    />,
  );
  return {
    ...resultado,
    onVerticeMedicao,
    onEncerrarMedicao,
    onVerticeDesenho,
    onCancelarDesenho,
    onEncerrarDesenho,
    onSelect,
  };
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
        desenho={criarEstadoDesenho(null)}
        onVerticeDesenho={vi.fn()}
        onCancelarDesenho={vi.fn()}
        onEncerrarDesenho={vi.fn()}
        desenhos={COLECAO_VAZIA}
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

// O desenho divide com a medição o mesmo evento de clique, e as duas dividem esse
// evento com a seleção de feição. É o único ponto do arquivo em que três coisas
// disputam um gesto, e nenhuma delas se prova lendo o código.
describe("MapView e o desenho", () => {
  it("desenhando, o clique marca vértice e NÃO seleciona", () => {
    const { onVerticeDesenho, onSelect } = montar({ desenho: criarEstadoDesenho("poligono", []) });
    clicar();
    expect(onVerticeDesenho).toHaveBeenCalledWith(PONTO);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Esc cancela o traçado, e só quando há um", () => {
    const { onCancelarDesenho, unmount } = montar({ desenho: criarEstadoDesenho("ponto", []) });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancelarDesenho).toHaveBeenCalledOnce();
    unmount();

    const semDesenho = montar();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(semDesenho.onCancelarDesenho).not.toHaveBeenCalled();
  });

  it("o traçado vai para a fonte do traçado, não para a do acervo", () => {
    montar({ desenho: criarEstadoDesenho("poligono", [PONTO, [-46.568, -23.618]]) });
    const desenhado = setDataTracado.mock.calls.at(-1)?.[0] as GeoJSON.FeatureCollection;
    expect(desenhado.features.map((f) => f.geometry.type)).toEqual([
      "Point",
      "Point",
      "LineString",
    ]);
    // O acervo recebeu a coleção vazia da prop, e não o traçado: se as duas fontes
    // se misturassem, cada vértice novo reenviaria o acervo inteiro ao GPU.
    expect(setDataAcervo).toHaveBeenCalledWith(COLECAO_VAZIA);
  });

  it("pinta o acervo como veio do servidor, sem remontar a coleção", () => {
    const doServidor: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "abc",
          geometry: { type: "Point", coordinates: PONTO },
          properties: { cor: "#dc2626", nome: "Portaria" },
        },
      ],
    };
    montar({ desenhos: doServidor });
    // A MESMA referência: `cor` em `properties` é o que `["get", "cor"]` lê, e uma
    // segunda montagem da coleção é onde essa propriedade se perderia.
    expect(setDataAcervo).toHaveBeenCalledWith(doServidor);
  });

  it("desliga o zoom de duplo clique enquanto desenha", () => {
    montar({ desenho: criarEstadoDesenho("poligono", []) });
    expect(doubleClickZoom.disable).toHaveBeenCalled();
    expect(doubleClickZoom.enable).not.toHaveBeenCalled();
  });

  it("o cursor vira mira enquanto desenha", () => {
    montar({ desenho: criarEstadoDesenho("ponto", []) });
    handlers.get("mousemove")?.({ point: {} });
    expect(canvas.style.cursor).toBe("crosshair");
  });
});

// O gesto de encerrar o traçado (fase 2). O duplo clique é o único lugar do desenho em
// que o MapLibre entrega DOIS eventos para um gesto, e é onde isso importa.
describe("MapView e o encerramento do traçado", () => {
  const dobrarClique = () => handlers.get("dblclick")?.({});

  it("duplo clique encerra, e avisa que o último vértice veio repetido", () => {
    // O MapLibre dispara `click` nas duas batidas antes do `dblclick`: o último
    // vértice entrou duas vezes, e quem limpa isso é o App.
    const { onEncerrarDesenho } = montar({ desenho: criarEstadoDesenho("poligono", []) });
    dobrarClique();
    expect(onEncerrarDesenho).toHaveBeenCalledWith(true);
  });

  it("fora do desenho, o duplo clique não é da ferramenta", () => {
    const { onEncerrarDesenho } = montar();
    dobrarClique();
    expect(onEncerrarDesenho).not.toHaveBeenCalled();
  });

  it("Enter encerra sem duplicar vértice, e só com o traçado pronto", () => {
    const pronto = montar({
      desenho: criarEstadoDesenho("poligono", [
        [-46.66, -23.57],
        [-46.65, -23.57],
        [-46.65, -23.56],
      ]),
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(pronto.onEncerrarDesenho).toHaveBeenCalledWith(false);
    pronto.unmount();

    // Com dois vértices não há polígono, e Enter não pode fingir que há.
    const incompleto = montar({
      desenho: criarEstadoDesenho("poligono", [
        [-46.66, -23.57],
        [-46.65, -23.57],
      ]),
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(incompleto.onEncerrarDesenho).not.toHaveBeenCalled();
  });
});
