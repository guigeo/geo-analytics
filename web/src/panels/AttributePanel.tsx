import { Bot, MousePointerSquareDashed } from "lucide-react";
import type { SelectedFeature } from "@/map/MapView";
import { LAYERS } from "@/map/layers";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  selected: SelectedFeature | null;
}

export function AttributePanel({ selected }: Props) {
  const layer = selected
    ? LAYERS.find((l) => l.id === selected.layerId)
    : undefined;

  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-background">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Atributos
        </h2>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-4">
        {!selected || !layer ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <MousePointerSquareDashed className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Clique em uma feição no mapa.
            </p>
          </div>
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            <div className="border-b border-border bg-muted/40 px-4 py-2.5">
              <p className="text-sm font-semibold">{layer.label}</p>
            </div>
            <dl className="divide-y divide-border">
              {layer.attributes.map((field) => (
                <div
                  key={field.key}
                  className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                >
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="text-right text-sm font-medium tabular-nums">
                    {formatValue(selected.properties[field.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </ScrollArea>

      {/* Placeholder do chat (Fase 2). O painel já reserva o espaço. */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Bot className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-medium">Chat com IA</p>
            <p className="text-xs text-muted-foreground">Em breve — Fase 2</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
