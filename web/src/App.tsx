import { useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { MapView, type SelectedFeature, type Viewport } from "@/map/MapView";
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
  const [visible, setVisible] = useState<Record<string, boolean>>(initialVisibility);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const [destaques, setDestaques] = useState<Destaques | null>(null);
  // Viewport em ref: muda a cada pan/zoom sem re-renderizar; lido só no envio do chat.
  const viewportRef = useRef<Viewport | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const toggleLayer = (id: string) =>
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  const getContexto = (): ContextoMapa | null => {
    const v = viewportRef.current;
    const camadas_ativas = LAYERS.filter((l) => visibleRef.current[l.id]).map((l) => l.id);
    if (!v) return { camadas_ativas };
    return { bbox: v.bbox, zoom: v.zoom, centro: v.centro, camadas_ativas };
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Header theme={theme} onToggleTheme={toggle} />
        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_340px]">
          <LayerPanel visible={visible} onToggle={toggleLayer} />
          {/* O mapa "acende" no centro: leve elevação em volta da célula. */}
          <div className="relative overflow-hidden">
            <MapView
              visible={visible}
              theme={theme}
              onSelect={setSelected}
              highlights={destaques}
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
