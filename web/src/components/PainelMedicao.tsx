import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VERTICES_MINIMOS, type EstadoMedicao } from "@/map/medicao";

interface Props {
  medicao: EstadoMedicao;
  onEncerrar: () => void;
  onRecomecar: () => void;
}

/**
 * O painel flutuante da medição.
 *
 * Traduzido do `measurement-panel.tsx` do `webgis-core`, com uma mudança que não é
 * de idioma: lá as cores eram violeta cravado no JSX — a marca daquele repositório.
 * Aqui só entram tokens (`primary`, `card`, `border`), porque desde a fase 4 a cara
 * é configuração e cor de cliente escrita à mão em componente compartilhado é
 * exatamente o que a regra 1 do ADR-0001 proíbe.
 *
 * Fica sobre o mapa, embaixo à esquerda: o canto que não briga com o controle de
 * navegação (em cima à esquerda) nem com os painéis das laterais.
 */
export function PainelMedicao({ medicao, onEncerrar, onRecomecar }: Props) {
  if (!medicao.modo) return null;

  const eDistancia = medicao.modo === "distancia";
  const titulo = eDistancia ? "Medição de distância" : "Medição de área";
  const faltam = VERTICES_MINIMOS[medicao.modo] - medicao.coordenadas.length;
  const vertices = medicao.coordenadas.length;

  return (
    <section
      className="absolute bottom-6 left-4 z-10 w-[min(19rem,calc(100%-2rem))] rounded-lg border border-border bg-card/95 p-4 shadow-xl backdrop-blur"
      aria-label={titulo}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-primary">
            Ferramenta ativa
          </p>
          <h2 className="fonte-titulo mt-1 text-sm font-semibold">{titulo}</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Encerrar medição"
          onClick={onEncerrar}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Clique no mapa para marcar vértices. Esc encerra.
      </p>

      {/* aria-live: quem usa leitor de tela ouve a medida mudar a cada vértice —
          sem isso a única saída da ferramenta seria invisível para essa pessoa. */}
      <div className="mt-3 rounded-md bg-primary/10 px-3 py-2.5" aria-live="polite">
        <p className="text-[0.6875rem] text-primary">
          {vertices} vértice{vertices === 1 ? "" : "s"}
        </p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">
          {medicao.formatado ?? `Marque mais ${faltam} ponto${faltam === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Estimativa, e o painel diz isso: o cálculo é esférico e fica de 0,1% a
          0,5% do elipsoide (ver `medicao.ts`). Numa imobiliária, alguém vai
          comparar este número com uma matrícula mais cedo ou mais tarde. */}
      {medicao.formatado && (
        <p className="mt-2 text-[0.6875rem] leading-4 text-muted-foreground">
          Estimativa sobre o mapa, não vale como levantamento.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        disabled={vertices === 0}
        onClick={onRecomecar}
      >
        <RotateCcw aria-hidden="true" className="size-3.5" />
        Recomeçar
      </Button>
    </section>
  );
}
