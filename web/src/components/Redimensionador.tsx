/**
 * A alça que faz o painel avançar sobre o mapa ou recuar.
 *
 * Existe porque largura fixa é uma aposta que sempre erra: 260px sobra para três
 * camadas e falta para um acervo com nomes longos — e era ali que o botão de apagar
 * ficava fora de alcance. Em vez de escolher um número melhor, deixa quem está usando
 * escolher o dele.
 *
 * `setPointerCapture` é o que faz o arrasto sobreviver ao ponteiro entrar no mapa: sem
 * ele o MapLibre engole o `pointermove` e a alça "solta" no meio do gesto.
 */
import { useRef } from "react";
import { cn } from "@/lib/utils";

const PASSO_DO_TECLADO = 16;

export function Redimensionador({
  largura,
  onLargura,
  minima,
  maxima,
  padrao,
  rotulo,
}: {
  largura: number;
  onLargura: (largura: number) => void;
  minima: number;
  maxima: number;
  /** Para onde o duplo clique volta. Desfazer sem ter de mirar o valor de antes. */
  padrao: number;
  rotulo: string;
}) {
  const arrastando = useRef(false);

  const limitar = (valor: number) => Math.min(maxima, Math.max(minima, Math.round(valor)));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={rotulo}
      aria-valuenow={largura}
      aria-valuemin={minima}
      aria-valuemax={maxima}
      tabIndex={0}
      className={cn(
        "group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize",
        "focus-visible:outline-none",
      )}
      onDoubleClick={() => onLargura(padrao)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        arrastando.current = true;
      }}
      onPointerMove={(e) => {
        if (!arrastando.current) return;
        const pai = e.currentTarget.parentElement;
        if (!pai) return;
        onLargura(limitar(e.clientX - pai.getBoundingClientRect().left));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        arrastando.current = false;
      }}
      onKeyDown={(e) => {
        // Teclado move do mesmo jeito, e é o que torna a alça alcançável sem mouse.
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onLargura(
          limitar(largura + (e.key === "ArrowRight" ? PASSO_DO_TECLADO : -PASSO_DO_TECLADO)),
        );
      }}
    >
      <span
        aria-hidden="true"
        className="mx-auto block h-full w-px bg-transparent transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary"
      />
    </div>
  );
}
