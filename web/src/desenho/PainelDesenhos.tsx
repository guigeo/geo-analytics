import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Desenho, ErroDoAcervo, PaginaDeDesenhos } from "./api";

interface Props {
  pagina: PaginaDeDesenhos | null;
  categorias: readonly string[];
  carregando: boolean;
  erro: ErroDoAcervo | null;
  busca: string;
  onBuscar: (texto: string) => void;
  categoria: string | null;
  onFiltrarCategoria: (categoria: string | null) => void;
  onIrParaPagina: (pagina: number) => void;
  /** Voa até o desenho no mapa. */
  onFocalizar: (desenho: Desenho) => void;
  onApagar: (desenho: Desenho) => void;
  onRecarregar: () => void;
  /** Liga e desliga o acervo no mapa — o mesmo gesto do painel de camadas. */
  visivelNoMapa: boolean;
  onAlternarVisibilidade: () => void;
}

/**
 * A lista dos desenhos do cliente, embaixo das camadas.
 *
 * Fica na coluna da esquerda de propósito: é a mesma pergunta que o painel de camadas
 * responde — *o que está no mapa* —, e a diferença é só quem produziu. A direita é
 * do que o mapa responde de volta (atributos e chat).
 *
 * Pagina desde o primeiro dia porque o volume-alvo declarado é de centenas (AT-013), e
 * lista que só pagina quando dói já dói quando se descobre. O mapa NÃO pagina: ele
 * carrega tudo por `/api/desenhos/geometrias`, senão um desenho sumiria ao virar de
 * página — na lista isso é paginação, no mapa seria defeito.
 */
export function PainelDesenhos({
  pagina,
  categorias,
  carregando,
  erro,
  busca,
  onBuscar,
  categoria,
  onFiltrarCategoria,
  onIrParaPagina,
  onFocalizar,
  onApagar,
  onRecarregar,
  visivelNoMapa,
  onAlternarVisibilidade,
}: Props) {
  // Qual linha está pedindo confirmação. Um id, e não um booleano: sem isso, abrir a
  // confirmação numa linha a abriria em todas.
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const itens = pagina?.itens ?? [];
  const total = pagina?.total ?? 0;
  const tamanho = pagina?.tamanho ?? 20;
  const atual = pagina?.pagina ?? 1;
  const ultima = Math.max(1, Math.ceil(total / tamanho));
  const filtrando = busca.trim() !== "" || categoria !== null;

  return (
    <aside className="flex min-h-0 flex-col border-r border-t border-border bg-background">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Desenhos
        </h2>
        {total > 0 && (
          <span className="text-[0.6875rem] tabular-nums text-muted-foreground">{total}</span>
        )}
        {/* O interruptor fica no cabeçalho e vale para o acervo inteiro — é a mesma
            unidade do painel de camadas, onde uma chave liga uma CAMADA e não uma
            feição. Um interruptor por desenho seria outra coisa, e com centenas de
            linhas viraria uma lista de interruptores. */}
        <Switch
          className="ml-auto"
          checked={visivelNoMapa}
          onCheckedChange={onAlternarVisibilidade}
          aria-label="Mostrar os desenhos no mapa"
        />
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => onBuscar(e.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar desenho por nome"
            className="h-8 pl-8 text-sm"
          />
        </div>

        {categorias.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <Filtro ativo={categoria === null} onClick={() => onFiltrarCategoria(null)}>
              Todas
            </Filtro>
            {categorias.map((c) => (
              <Filtro key={c} ativo={categoria === c} onClick={() => onFiltrarCategoria(c)}>
                {c}
              </Filtro>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3">
        {/* O acervo fora do ar é um estado, não uma lista vazia (AT-012): o mapa
            continua de pé, e a diferença entre "não há desenho" e "não deu para
            perguntar" é a única coisa que decide se vale tentar de novo. */}
        {erro ? (
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="text-xs leading-5 text-muted-foreground">
              {erro.indisponivel
                ? "Não foi possível carregar os desenhos agora. O mapa continua funcionando."
                : erro.message}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={onRecarregar}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Tentar de novo
            </Button>
          </div>
        ) : carregando && itens.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="px-1 text-xs leading-5 text-muted-foreground">
            {filtrando
              ? "Nenhum desenho corresponde ao filtro."
              : "Nada desenhado ainda. Use as ferramentas no canto do mapa."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 pb-3">
            {itens.map((d) => (
              <li key={d.id}>
                <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-3 shrink-0 ring-1 ring-black/10",
                      d.tipo === "ponto" ? "rounded-full" : "rounded-sm",
                    )}
                    style={{ background: d.cor }}
                  />
                  <button
                    type="button"
                    onClick={() => onFocalizar(d)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm">{d.nome}</span>
                    {d.categoria && (
                      <span className="block truncate text-[0.6875rem] text-muted-foreground">
                        {d.categoria}
                      </span>
                    )}
                  </button>

                  {confirmando === d.id ? (
                    // Confirmar na própria linha (AT-015), e não num diálogo: quem
                    // apaga precisa continuar vendo QUAL desenho está apagando.
                    <span className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="destructive"
                        size="xs"
                        onClick={() => {
                          setConfirmando(null);
                          onApagar(d);
                        }}
                      >
                        Apagar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setConfirmando(null)}
                      >
                        Não
                      </Button>
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Apagar ${d.nome}`}
                      onClick={() => setConfirmando(d.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      {ultima > 1 && !erro && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Página anterior"
            disabled={atual <= 1}
            onClick={() => onIrParaPagina(atual - 1)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
            {atual} de {ultima}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Próxima página"
            disabled={atual >= ultima}
            onClick={() => onIrParaPagina(atual + 1)}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}
    </aside>
  );
}

function Filtro({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "max-w-full truncate rounded-full border px-2 py-0.5 text-[0.6875rem] transition-colors",
        ativo
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
