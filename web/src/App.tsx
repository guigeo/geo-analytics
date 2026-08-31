import { useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { MapView, type MapFocus, type SelectedFeature, type Viewport } from "@/map/MapView";
import type { SearchHit } from "@/search";
import { LayerPanel } from "@/panels/LayerPanel";
import { AttributePanel } from "@/panels/AttributePanel";
import { ChatPanel, type PerguntaExterna } from "@/chat/ChatPanel";
import { camadas } from "@/configuracao";
import type { Destaques } from "@/map/highlight";
import type { ContextoMapa } from "@/chat/api";
import { useTheme } from "@/hooks/use-theme";
import { PainelMedicao } from "@/components/PainelMedicao";
import { criarEstadoMedicao, type Coordenada, type ModoMedicao } from "@/map/medicao";

const visibilidadeInicial = Object.fromEntries(
  camadas.map((c) => [c.id, c.visivelPorPadrao]),
) as Record<string, boolean>;

export function App() {
  const { theme, toggle } = useTheme();
  const [satellite, setSatellite] = useState(false);
  const [satelliteOverlay, setSatelliteOverlay] = useState(true);
  const [visible, setVisible] = useState<Record<string, boolean>>(visibilidadeInicial);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const [destaques, setDestaques] = useState<Destaques | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Pergunta disparada de fora do chat (hoje, pelo painel de novidades). A `key`
  // existe para a MESMA pergunta poder ser pedida duas vezes — sem ela, o efeito
  // do ChatPanel não veria mudança nenhuma na segunda.
  const [pergunta, setPergunta] = useState<PerguntaExterna | null>(null);
  // Medição: o modo e os vértices são o estado; a medida em si é derivada deles
  // por `criarEstadoMedicao`, que é função pura. Guardar o valor calculado daria
  // duas fontes para o mesmo número.
  const [modoMedicao, setModoMedicao] = useState<ModoMedicao | null>(null);
  const [verticesMedicao, setVerticesMedicao] = useState<Coordenada[]>([]);
  // Viewport em ref: muda a cada pan/zoom sem re-renderizar; lido só no envio do chat.
  const viewportRef = useRef<Viewport | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const toggleLayer = (id: string) => setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  const medicao = criarEstadoMedicao(modoMedicao, verticesMedicao);

  const encerrarMedicao = () => {
    setModoMedicao(null);
    setVerticesMedicao([]);
  };

  // Clicar no modo já ativo desliga; trocar de modo zera os vértices, porque uma
  // linha de dois pontos não vira área nem o contrário.
  const alternarMedicao = (modo: ModoMedicao) => {
    setVerticesMedicao([]);
    setModoMedicao((atual) => (atual === modo ? null : modo));
    // Medir e inspecionar disputam o clique: ao entrar na ferramenta, o painel de
    // atributos larga o que estava selecionado em vez de mostrar feição antiga.
    setSelected(null);
  };

  // Busca do header: voa até o alvo; município também ganha o destaque azul
  // (mesma linguagem visual do chat — um "slot" só de destaque por vez).
  const onSearchSelect = (hit: SearchHit) => {
    const maxZoom = hit.tipo === "endereco" ? 17 : 12;
    setFocus({ bbox: hit.bbox, key: Date.now(), maxZoom });
    if (hit.cdMun) setDestaques({ camada: "municipio", codigos: [hit.cdMun] });
  };

  const getContexto = (): ContextoMapa | null => {
    const v = viewportRef.current;
    const camadas_ativas = camadas.filter((c) => visibleRef.current[c.id]).map((c) => c.id);
    if (!v) return { camadas_ativas };
    return { bbox: v.bbox, zoom: v.zoom, centro: v.centro, camadas_ativas };
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Header
          theme={theme}
          onToggleTheme={toggle}
          satellite={satellite}
          onToggleSatellite={() => setSatellite((s) => !s)}
          satelliteOverlay={satelliteOverlay}
          onToggleSatelliteOverlay={() => setSatelliteOverlay((s) => !s)}
          onSearchSelect={onSearchSelect}
          onPerguntar={(texto) => setPergunta({ texto, key: Date.now() })}
          modoMedicao={modoMedicao}
          onAlternarMedicao={alternarMedicao}
        />
        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_340px]">
          <LayerPanel visible={visible} onToggle={toggleLayer} />
          {/* O mapa "acende" no centro: leve elevação em volta da célula. */}
          <div className="relative overflow-hidden">
            <MapView
              visible={visible}
              theme={theme}
              satellite={satellite}
              satelliteOverlay={satelliteOverlay}
              onSelect={setSelected}
              highlights={destaques}
              focus={focus}
              onViewportChange={(v) => {
                viewportRef.current = v;
              }}
              medicao={medicao}
              onVerticeMedicao={(c) => setVerticesMedicao((prev) => [...prev, c])}
              onEncerrarMedicao={encerrarMedicao}
            />
            <PainelMedicao
              medicao={medicao}
              onEncerrar={encerrarMedicao}
              onRecomecar={() => setVerticesMedicao([])}
            />
          </div>
          <div className="flex min-h-0 flex-col border-l border-border bg-background">
            <div className="min-h-0 flex-1">
              <AttributePanel selected={selected} />
            </div>
            <div className="min-h-0 flex-[1.4]">
              <ChatPanel onDestaques={setDestaques} getContexto={getContexto} pergunta={pergunta} />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
