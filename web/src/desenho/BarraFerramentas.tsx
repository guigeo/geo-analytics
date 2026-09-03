import { Check, Circle, Hexagon, MapPin, Undo2, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { areaFormatada, MAX_RAIO_M, type ModoDesenho } from "./geometria";
import { faltam, type EstadoDesenho } from "./estado";

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
 * As três ferramentas de desenho, no cabeçalho.
 *
 * Ficavam num cartão flutuando sobre o mapa, no canto de cima à direita — e cartão
 * sobre o mapa cobre justamente o que se quer olhar antes de desenhar. Aqui elas são
 * irmãs dos botões de medição: mesmo tamanho, mesmo gesto (clicar no modo ativo
 * desliga) e mesma leitura de estado. Desenhar e medir SÃO a mesma família de ação —
 * anotar sobre o mapa —, e a barra passou a dizer isso.
 *
 * O que não cabe aqui é o estado do traçado: para isso existe a `BarraDoDesenho`,
 * logo abaixo do cabeçalho e só enquanto se desenha.
 */
export function FerramentasDeDesenho({
  modo,
  onAlternarModo,
}: {
  modo: ModoDesenho | null;
  onAlternarModo: (modo: ModoDesenho) => void;
}) {
  return (
    <>
      {FERRAMENTAS.map(({ modo: dela, rotulo, icone: Icone }) => {
        const ativo = modo === dela;
        return (
          <Tooltip key={dela}>
            <TooltipTrigger asChild>
              <Button
                variant={ativo ? "secondary" : "ghost"}
                size="icon"
                onClick={() => onAlternarModo(dela)}
                aria-label={`Desenhar ${rotulo.toLowerCase()}`}
                aria-pressed={ativo}
              >
                <Icone className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {ativo ? "Encerrar desenho" : `Desenhar ${rotulo.toLowerCase()}`}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

interface Props {
  estado: EstadoDesenho;
  onDesfazer: () => void;
  onCancelar: () => void;
  onSalvar: () => void;
  onMudarRaio: (raioM: number | null) => void;
  /** Acervo fora do ar. Desenhar segue possível; salvar, não — e a barra diz por quê. */
  acervoIndisponivel?: boolean;
}

/**
 * A faixa que acompanha um traçado em andamento. Nasce sob o cabeçalho e some com ele.
 *
 * Faixa e não cartão, e sob a barra e não sobre o mapa: ela EMPURRA o mapa em vez de
 * cobri-lo, então nada do que se está desenhando fica escondido atrás do painel que
 * fala sobre o desenho. Existe só enquanto há traçado — barra permanente com botões
 * apagados é ruído em todas as outras horas.
 *
 * Não guarda estado nenhum: o traçado inteiro vive no `App`, derivado por
 * `criarEstadoDesenho`, que é puro. Aqui só se lê e se dispara — o mesmo arranjo do
 * `PainelMedicao`, e pelo mesmo motivo: dá para conferir a regra sem subir navegador.
 */
export function BarraDoDesenho({
  estado,
  onDesfazer,
  onCancelar,
  onSalvar,
  onMudarRaio,
  acervoIndisponivel = false,
}: Props) {
  if (estado.modo === null) return null;

  const vertices = estado.coordenadas.length;
  const restam = faltam(estado);
  const area = areaFormatada(estado.modo, estado.coordenadas, estado.raioM);
  const ferramenta = FERRAMENTAS.find((f) => f.modo === estado.modo);

  return (
    <section
      className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-4"
      aria-label="Desenho em andamento"
    >
      <span className="flex shrink-0 items-center gap-2 text-xs font-semibold">
        {ferramenta && <ferramenta.icone aria-hidden="true" className="size-4 text-primary" />}
        {ferramenta?.rotulo}
      </span>

      {/* O raio aparece no modo buffer e em nenhum outro: é o único em que a geometria
          não sai só dos cliques. */}
      {estado.modo === "buffer" && (
        <span className="flex shrink-0 items-center gap-1.5">
          <label htmlFor="desenho-raio" className="text-xs text-muted-foreground">
            Raio (m)
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
            className="h-7 w-24 text-sm"
          />
        </span>
      )}

      {/* aria-live: quem usa leitor de tela acompanha o traçado crescer. Sem isto, a
          única saída da ferramenta enquanto se desenha seria visual.

          Uma linha só para o estado. O impedimento É o estado enquanto não dá para
          salvar, e a metade útil da recusa: "inválido" sozinho leva a pessoa a clicar
          de novo do mesmo jeito (AT-009). */}
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-xs",
          estado.completo
            ? "font-medium tabular-nums"
            : estado.impedimento
              ? "font-medium text-destructive"
              : "text-muted-foreground",
        )}
        aria-live="polite"
      >
        {restam > 0
          ? `Marque mais ${restam} ponto${restam === 1 ? "" : "s"} — ${ferramenta?.dica ?? ""}`
          : estado.completo
            ? (area ?? "Pronto para salvar")
            : (estado.impedimento ?? ferramenta?.dica)}
      </p>

      {acervoIndisponivel && (
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
          Acervo fora do ar: dá para desenhar, não para salvar.
        </span>
      )}

      <span className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={vertices === 0}
          onClick={onDesfazer}
        >
          <Undo2 aria-hidden="true" className="size-3.5" />
          Desfazer
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!estado.completo || acervoIndisponivel}
          onClick={onSalvar}
        >
          <Check aria-hidden="true" className="size-3.5" />
          Salvar
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
      </span>
    </section>
  );
}
