import { MousePointerClick, RadioTower, type LucideIcon } from "lucide-react";
import { LAYERS, type DataLayer } from "@/map/layers";
import { ANTENNA_ICON } from "@/map/icons";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
}

// Ícone da legenda por id de ícone do mapa (mantém painel e marcador em sintonia).
const LEGEND_ICON: Record<string, LucideIcon> = {
  [ANTENNA_ICON]: RadioTower,
};

export function LayerPanel({ visible, onToggle }: Props) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-background">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Camadas
        </h2>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3">
        <ul className="flex flex-col gap-1.5 pb-3">
          {LAYERS.map((l) => {
            const on = !!visible[l.id];
            return (
              <li key={l.id}>
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent"
                  data-active={on}
                >
                  <Swatch layer={l} />
                  <span className="flex-1 text-sm">{l.label}</span>
                  <Switch checked={on} onCheckedChange={() => onToggle(l.id)} />
                </label>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <MousePointerClick className="mt-0.5 size-3.5 shrink-0" />
          Clique numa feição para destacá-la e ver os atributos.
        </p>
      </div>
    </aside>
  );
}

// Legenda — reflete a geometria: ícone (pontos com ícone), traço (linhas),
// contorno (UF) ou área (polígonos preenchidos).
function Swatch({ layer }: { layer: DataLayer }) {
  if (layer.geometry === "point") {
    const Icon = layer.icon ? LEGEND_ICON[layer.icon] : undefined;
    if (Icon) return <Icon className="size-4 shrink-0" style={{ color: layer.color }} />;
    // Ponto sem ícone: bolinha colorida.
    return (
      <span
        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/5"
        style={{ background: layer.color }}
      />
    );
  }
  if (layer.geometry === "line") {
    return (
      <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ background: layer.color }} />
    );
  }
  if (layer.fillOpacity === 0 && layer.outline) {
    return (
      <span
        className="size-3 shrink-0 rounded-sm border-2 bg-transparent"
        style={{ borderColor: layer.outline.color }}
      />
    );
  }
  return (
    <span
      className="size-3 shrink-0 rounded-sm ring-1 ring-black/5"
      style={{
        background: layer.color,
        borderColor: layer.outline?.color ?? layer.color,
      }}
    />
  );
}
