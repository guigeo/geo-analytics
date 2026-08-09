import { useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import {
  MapView,
  type MapFocus,
  type SelectedFeature,
  type Viewport,
} from "@/map/MapView";
import type { SearchHit } from "@/search";
import { LayerPanel } from "@/panels/LayerPanel";
import { AttributePanel } from "@/panels/AttributePanel";
import { ChatPanel } from "@/chat/ChatPanel";
import { LAYERS } from "@/map/layers";
import type { Destaques } from "@/map/highlight";
import type { ContextoMapa } from "@/chat/api";
import { useTheme } from "@/hooks/use-theme";

const initialVisibility = Object.fromEntries(
  LAYERS.map((l) => [l.id, l.defaultVisible]),
) as Record<string, boolean>;

export function App() {
  const { theme, toggle } = useTheme();
  const [satellite, setSatellite] = useState(false);
  const [satelliteOverlay, setSatelliteOverlay] = useState(true);
  const [visible, setVisible] = useState<Record<string, boolean>>(initialVisibility);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const [destaques, setDestaques] = useState<Destaques | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Viewport em ref: muda a cada pan/zoom sem re-renderizar; lido só no envio do chat.
  const viewportRef = useRef<Viewport | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const toggleLayer = (id: string) =>
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  // Busca do header: voa até o alvo; município também ganha o destaque azul
  // (mesma linguagem visual do chat — um "slot" só de destaque por vez).
  const onSearchSelect = (hit: SearchHit) => {
    const maxZoom = hit.tipo === "endereco" ? 17 : 12;
    setFocus({ bbox: hit.bbox, key: Date.now(), maxZoom });
    if (hit.cdMun) setDestaques({ camada: "municipio", codigos: [hit.cdMun] });
  };

  const getContexto = (): ContextoMapa | null => {
    const v = viewportRef.current;
    const camadas_ativas = LAYERS.filter((l) => visibleRef.current[l.id]).map((l) => l.id);
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
            />
          </div>
          <div className="flex min-h-0 flex-col border-l border-border bg-background">
            <div className="min-h-0 flex-1">
              <AttributePanel selected={selected} />
            </div>
            <div className="min-h-0 flex-[1.4]">
              <ChatPanel onDestaques={setDestaques} getContexto={getContexto} />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
