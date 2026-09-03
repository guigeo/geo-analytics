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
  lado = "direita",
}: {
  largura: number;
  onLargura: (largura: number) => void;
  minima: number;
  maxima: number;
  /** Para onde o duplo clique volta. Desfazer sem ter de mirar o valor de antes. */
  padrao: number;
  rotulo: string;
  /**
   * Em que borda do painel a alça mora. O painel da esquerda cresce para a direita e
   * o da direita cresce para a esquerda — a conta se inverte, e o gesto continua o
   * mesmo: arrastar para fora alarga.
   */
  lado?: "direita" | "esquerda";
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
        "group absolute inset-y-0 z-10 w-2 cursor-col-resize focus-visible:outline-none",
        lado === "direita" ? "-right-1" : "-left-1",
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
        const caixa = pai.getBoundingClientRect();
        onLargura(limitar(lado === "direita" ? e.clientX - caixa.left : caixa.right - e.clientX));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        arrastando.current = false;
      }}
      onKeyDown={(e) => {
        // Teclado move do mesmo jeito, e é o que torna a alça alcançável sem mouse.
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        // Para fora alarga, dos dois lados: no painel da direita é a seta ESQUERDA
        // que aumenta. Seguir a tecla e não o lado faria a mesma alça crescer numa
        // borda e encolher na outra.
        const paraFora = lado === "direita" ? e.key === "ArrowRight" : e.key === "ArrowLeft";
        onLargura(limitar(largura + (paraFora ? PASSO_DO_TECLADO : -PASSO_DO_TECLADO)));
      }}
    >
      <span
        aria-hidden="true"
        className="mx-auto block h-full w-px bg-transparent transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary"
      />
    </div>
  );
}
