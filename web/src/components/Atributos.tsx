/**
 * O conteúdo dos atributos de uma feição — só o conteúdo, sem casca.
 *
 * Era um painel fixo na coluna da direita, cobrando 340px o tempo todo para passar a
 * sessão quase inteira dizendo "clique em uma feição". Hoje ele mora dentro do popup
 * ancorado na feição (`map/PopupAtributos.tsx`): atributo é sobre um LUGAR, e ler
 * sobre o lugar longe do lugar obriga o olho a atravessar a tela.
 *
 * Sem casca de propósito: quem decide onde isto aparece é quem o renderiza. Assim o
 * mesmo conteúdo serve o popup de hoje e o que vier.
 */
import { X } from "lucide-react";
import { camadas } from "@/configuracao";
import { DESENHOS_SOURCE_ID } from "@/desenho/fonte";
import { descreverDesenho } from "@/desenho/atributos";
import { Button } from "@/components/ui/button";
import type { SelectedFeature } from "@/map/MapView";

export function Atributos({
  selected,
  onFechar,
}: {
  selected: SelectedFeature;
  onFechar: () => void;
}) {
  // Desenho não é camada configurada: ele é da casca, tem as mesmas colunas em todo
  // cliente, e por isso os atributos dele vêm de `desenho/atributos.ts` em vez de
  // `camada.atributos`. É a mesma tela, com duas origens de rótulo.
  const desenho = selected.layerId === DESENHOS_SOURCE_ID ? selected : null;
  const camada = desenho ? undefined : camadas.find((c) => c.id === selected.layerId);
  const linhas = desenho
    ? descreverDesenho(desenho.properties)
    : camada
      ? camada.atributos.map((a) => ({
          rotulo: a.rotulo,
          valor: formatar(selected.properties[a.chave]),
        }))
      : [];
  const titulo = desenho ? String(desenho.properties.nome ?? "Desenho") : camada?.rotulo;

  if (!titulo) return null;

  return (
    <div className="min-w-56">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {desenho && (
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-sm ring-1 ring-black/10"
            style={{ background: String(desenho.properties.cor ?? "#2563eb") }}
          />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Fechar atributos"
          onClick={onFechar}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <dl className="divide-y divide-border">
        {linhas.map((linha) => (
          <div key={linha.rotulo} className="flex items-baseline justify-between gap-4 px-3 py-1.5">
            <dt className="text-xs text-muted-foreground">{linha.rotulo}</dt>
            <dd className="text-right text-sm font-medium tabular-nums">{linha.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatar(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  return String(valor);
}
