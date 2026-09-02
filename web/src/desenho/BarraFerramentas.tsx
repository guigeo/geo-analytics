import { Check, Circle, Hexagon, MapPin, Undo2, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { areaFormatada, MAX_RAIO_M, type ModoDesenho } from "./geometria";
import { faltam, type EstadoDesenho } from "./estado";

interface Props {
  estado: EstadoDesenho;
  /** Clicar no modo ativo desliga — o mesmo gesto da medição. */
  onAlternarModo: (modo: ModoDesenho) => void;
  onDesfazer: () => void;
  onCancelar: () => void;
  onSalvar: () => void;
  onMudarRaio: (raioM: number | null) => void;
  /** Acervo fora do ar. Desenhar segue possível; salvar, não — e a barra diz por quê. */
  acervoIndisponivel?: boolean;
}

interface Ferramenta {
  modo: ModoDesenho;
  rotulo: string;
  icone: LucideIcon;
  dica: string;
}

const FERRAMENTAS: Ferramenta[] = [
  { modo: "ponto", rotulo: "Ponto", icone: MapPin, dica: "Clique no mapa para marcar o lugar." },
  {
    modo: "poligono",
    rotulo: "Área",
    icone: Hexagon,
    dica: "Clique para marcar cada vértice. Duplo clique ou Enter encerra.",
  },
  {
    modo: "buffer",
    rotulo: "Raio",
    icone: Circle,
    dica: "Clique o centro e informe o raio em metros.",
  },
];

/**
 * A barra das ferramentas de desenho, flutuando sobre o mapa.
 *
 * Fica em cima à direita, e é o único canto livre: o controle de navegação ocupa o
 * alto à esquerda e o painel de medição o rodapé à esquerda. Desenhar e medir se
 * excluem (quem entra desliga o outro), mas os dois painéis coexistem na tela em
 * transição, e sobrepor um ao outro esconderia justamente o que se está encerrando.
 *
 * A barra não guarda estado nenhum: o traçado inteiro vive no `App`, derivado por
 * `criarEstadoDesenho`, que é puro. Aqui só se lê e se dispara — o mesmo arranjo do
 * `PainelMedicao`, e pelo mesmo motivo: dá para conferir a regra sem subir navegador.
 */
export function BarraFerramentas({
  estado,
  onAlternarModo,
  onDesfazer,
  onCancelar,
  onSalvar,
  onMudarRaio,
  acervoIndisponivel = false,
}: Props) {
  const desenhando = estado.modo !== null;
  const vertices = estado.coordenadas.length;
  const restam = faltam(estado);
  const area = estado.modo ? areaFormatada(estado.modo, estado.coordenadas, estado.raioM) : null;

  return (
    <section
      className="absolute right-4 top-4 z-10 w-[min(15rem,calc(100%-2rem))] rounded-lg border border-border bg-card/95 p-3 shadow-xl backdrop-blur"
      aria-label="Ferramentas de desenho"
    >
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        Desenhar no mapa
      </p>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {FERRAMENTAS.map(({ modo, rotulo, icone: Icone }) => {
          const ativo = estado.modo === modo;
          return (
            <Button
              key={modo}
              type="button"
              variant={ativo ? "secondary" : "outline"}
              size="sm"
              aria-pressed={ativo}
              onClick={() => onAlternarModo(modo)}
            >
              <Icone aria-hidden="true" className="size-3.5" />
              {rotulo}
            </Button>
          );
        })}
      </div>

      {desenhando && (
        <>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {FERRAMENTAS.find((f) => f.modo === estado.modo)?.dica} Esc cancela.
          </p>

          {/* O raio aparece no modo buffer e em nenhum outro: é o único em que a
              geometria não sai só dos cliques. Fica ANTES do resumo porque é entrada,
              e o resumo abaixo já reflete o que foi digitado. */}
          {estado.modo === "buffer" && (
            <div className="mt-2.5">
              <label htmlFor="desenho-raio" className="block text-xs font-medium">
                Raio em metros
              </label>
              <Input
                id="desenho-raio"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_RAIO_M}
                value={estado.raioM ?? ""}
                onChange={(e) => {
                  const valor = e.target.value.trim();
                  onMudarRaio(valor === "" ? null : Number(valor));
                }}
                placeholder="500"
                className="mt-1 h-8 text-sm"
              />
            </div>
          )}

          {/* aria-live: quem usa leitor de tela acompanha o traçado crescer. Sem
              isto, a única saída da ferramenta enquanto se desenha seria visual. */}
          <div className="mt-2.5 rounded-md bg-primary/10 px-3 py-2" aria-live="polite">
            <p className="text-[0.6875rem] text-primary">
              {estado.modo === "buffer"
                ? vertices === 0
                  ? "Sem centro"
                  : "Centro marcado"
                : `${vertices} ponto${vertices === 1 ? "" : "s"}`}
            </p>
            {/* Uma linha só para o estado, e não duas. O impedimento É o estado
                enquanto não dá para salvar — mostrá-lo aqui e repeti-lo num alerta
                embaixo faria a barra dizer a mesma coisa duas vezes. E ele é a metade
                útil da recusa: "inválido" sozinho leva a pessoa a clicar de novo do
                mesmo jeito (AT-009). Vermelho quando é recusa, normal quando é só
                "ainda falta". */}
            <p
              className={cn(
                "mt-0.5 text-sm font-semibold",
                estado.completo && "tabular-nums",
                !estado.completo && estado.impedimento && "text-destructive",
              )}
            >
              {restam > 0
                ? `Marque mais ${restam} ponto${restam === 1 ? "" : "s"}`
                : estado.completo
                  ? (area ?? "Pronto para salvar")
                  : (estado.impedimento ?? "Traçado incompleto")}
            </p>
          </div>

          {acervoIndisponivel && (
            <p className="mt-2 text-[0.6875rem] leading-4 text-muted-foreground">
              O acervo está fora do ar: dá para desenhar, mas não para salvar agora.
            </p>
          )}

          <div className="mt-3 flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={vertices === 0}
              onClick={onDesfazer}
            >
              <Undo2 aria-hidden="true" className="size-3.5" />
              Desfazer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cancelar desenho"
              onClick={onCancelar}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            className="mt-1.5 w-full"
            disabled={!estado.completo || acervoIndisponivel}
            onClick={onSalvar}
          >
            <Check aria-hidden="true" className="size-3.5" />
            Salvar
          </Button>
        </>
      )}
    </section>
  );
}
