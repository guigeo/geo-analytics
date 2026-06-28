import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { MapView, type SelectedFeature } from "@/map/MapView";
import { LayerPanel } from "@/panels/LayerPanel";
import { AttributePanel } from "@/panels/AttributePanel";
import { LAYERS } from "@/map/layers";
import { useTheme } from "@/hooks/use-theme";

const initialVisibility = Object.fromEntries(
  LAYERS.map((l) => [l.id, l.defaultVisible]),
) as Record<string, boolean>;

export function App() {
  const { theme, toggle } = useTheme();
  const [visible, setVisible] = useState<Record<string, boolean>>(initialVisibility);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);

  const toggleLayer = (id: string) =>
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Header theme={theme} onToggleTheme={toggle} />
        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_320px]">
          <LayerPanel visible={visible} onToggle={toggleLayer} />
          {/* O mapa "acende" no centro: leve elevação em volta da célula. */}
          <div className="relative overflow-hidden">
            <MapView visible={visible} theme={theme} onSelect={setSelected} />
          </div>
          <AttributePanel selected={selected} />
        </div>
      </div>
    </TooltipProvider>
  );
}
