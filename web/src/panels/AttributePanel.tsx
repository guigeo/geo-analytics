import { Info, MousePointerSquareDashed } from "lucide-react";
import type { SelectedFeature } from "@/map/MapView";
import { camadas } from "@/configuracao";
import { DESENHOS_SOURCE_ID } from "@/desenho/fonte";
import { descreverDesenho } from "@/desenho/atributos";
import { Card } from "@/components/ui/card";
import { Secao, SecaoCabecalho, SecaoCorpo, EstadoVazio } from "@/components/PainelSecao";

interface Props {
  selected: SelectedFeature | null;
}

export function AttributePanel({ selected }: Props) {
  // Desenho não é camada configurada: ele é da casca, tem as mesmas colunas em todo
  // cliente, e por isso os atributos dele vêm de `desenho/atributos.ts` em vez de
  // `camada.atributos`. É a mesma tela, com duas origens de rótulo.
  const desenho = selected?.layerId === DESENHOS_SOURCE_ID ? selected : null;
  const camada = selected && !desenho ? camadas.find((c) => c.id === selected.layerId) : undefined;
  const linhas = desenho
    ? descreverDesenho(desenho.properties)
    : camada
      ? camada.atributos.map((a) => ({
          rotulo: a.rotulo,
          valor: formatValue(selected?.properties[a.chave]),
        }))
      : [];
  const titulo = desenho ? String(desenho.properties.nome ?? "Desenho") : camada?.rotulo;

  return (
    <Secao className="bg-background">
      <SecaoCabecalho titulo="Atributos" icone={Info} />

      <SecaoCorpo>
        {!titulo ? (
          <EstadoVazio icone={MousePointerSquareDashed}>
            Clique numa feição do mapa para destacá-la e ver os atributos.
          </EstadoVazio>
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
              {desenho && (
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-sm ring-1 ring-black/10"
                  style={{ background: String(desenho.properties.cor ?? "#2563eb") }}
                />
              )}
              <p className="text-sm font-semibold">{titulo}</p>
            </div>
            <dl className="divide-y divide-border">
              {linhas.map((linha) => (
                <div
                  key={linha.rotulo}
                  className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                >
                  <dt className="text-xs text-muted-foreground">{linha.rotulo}</dt>
                  <dd className="text-right text-sm font-medium tabular-nums">{linha.valor}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </SecaoCorpo>
    </Secao>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
