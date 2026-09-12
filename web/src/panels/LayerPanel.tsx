import { useMemo, useState } from "react";
import {
  ChartLine,
  Check,
  ChevronRight,
  ChevronsUpDown,
  CloudOff,
  Eye,
  EyeOff,
  Grid3x3,
  Landmark,
  Layers,
  PanelLeftClose,
  PenLine,
  RadioTower,
  Radar,
  RotateCcw,
  Trash2,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import {
  camadas,
  configuracaoAcervo,
  type DefinicaoCamada,
  type IdDeGrupo,
  type TemaNumerico,
} from "@/configuracao";
import { temaDaCamada } from "@/map/layers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ItemDoAcervo } from "@/desenho/camadas";
import type { ErroDoAcervo } from "@/desenho/api";
import { Button } from "@/components/ui/button";
import { ANTENNA_ICON } from "@/map/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Secao, SecaoCabecalho, SecaoCorpo, EstadoVazio } from "@/components/PainelSecao";
import { cn } from "@/lib/utils";
import { agruparCamadas } from "./grupos";

interface Props {
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
  /** Qual variável cada camada de vários temas está pintando. */
  temaAtivo: Record<string, string>;
  onEscolherTema: (idDaCamada: string, idDoTema: string) => void;
  /**
   * Os desenhos do cliente, folhas do último combo. Vêm da mesma coleção que o mapa
   * consome — se viessem de uma lista própria, painel e mapa poderiam discordar.
   */
  itens: readonly ItemDoAcervo[];
  ocultos: readonly string[];
  onAlternarItem: (id: string) => void;
  /** Voa até o desenho. É o que o nome faz quando clicado. */
  onFocalizar: (item: ItemDoAcervo) => void;
  onApagar: (item: ItemDoAcervo) => void;
  /** Abre o Raio-X do desenho. Ausente no ponto: sem área não há o que agregar. */
  onRaioX: (item: ItemDoAcervo) => void;
  /** Acervo fora do ar não é acervo vazio (AT-012): são estados diferentes na tela. */
  erroDoAcervo: ErroDoAcervo | null;
  onRecarregar: () => void;
  /** Recolhe a coluna para a aba fina, devolvendo a largura ao mapa. */
  onRecolher: () => void;
}

// Ícone da legenda por id de ícone do mapa (mantém painel e marcador em sintonia).
const ICONE_DA_LEGENDA: Record<string, LucideIcon> = {
  [ANTENNA_ICON]: RadioTower,
};

/**
 * O ícone de cada combo, no selo do cabeçalho.
 *
 * Mora aqui, e não em `GRUPOS_DE_CAMADA`, pelo mesmo motivo que `ICONE_DA_LEGENDA`:
 * a configuração descreve o dado e não deve importar componente de UI. Grupo novo sem
 * entrada aqui não quebra nada — o selo nasce com o ícone genérico de camadas.
 */
const ICONE_DO_GRUPO: Record<IdDeGrupo, LucideIcon> = {
  ibge: Grid3x3,
  indicadores: ChartLine,
  infraestrutura: Waypoints,
  regulacao: Landmark,
};

/**
 * O painel de camadas: um combo por tema, e o acervo do cliente no último.
 *
 * O desenho de 2026-09-13 trocou três coisas de uma vez, e as três respondem à mesma
 * queixa — o painel não dizia o que cada linha mostra nem o que estava ligado:
 *
 * 1. **Olho no lugar do interruptor.** Onze interruptores empilhados eram o que mais
 *    pesava na tela, e interruptor é idioma de tela de configuração; olho é idioma de
 *    mapa, e ocupa um terço do espaço. A semântica continua a de um interruptor
 *    (`role="switch"`), porque é isso que a linha faz — o que mudou é o desenho.
 * 2. **Procedência embaixo do nome.** "IBGE · Censo 2022" é o que o produto vende, e
 *    estava só na cabeça de quem montou a camada. Camada sem `fonte` declarada não
 *    ganha linha nenhuma: inventar origem seria pior do que a lacuna.
 * 3. **Seção "Ativas" no topo, e a conta no cabeçalho de cada combo.** Com três
 *    camadas ligadas em grupos diferentes, era preciso abrir os grupos para achá-las.
 *    A camada ligada aparece duas vezes de propósito — em cima e no lugar de sempre —,
 *    porque a de cima serve para desligar e a de baixo para ligar a próxima.
 *
 * Toda sessão começa com TUDO recolhido e nenhuma camada ligada (decidido em
 * 2026-09-02). O aberto/fechado é do componente e não da configuração: é preferência
 * de quem está usando naquele momento, não decisão de produto, e não sobrevive à
 * sessão de propósito — combo que "lembra" de aberto entrega a tela de ontem a quem
 * abriu hoje.
 */
export function LayerPanel({
  visible,
  onToggle,
  temaAtivo,
  onEscolherTema,
  itens,
  ocultos,
  onAlternarItem,
  onFocalizar,
  onApagar,
  onRaioX,
  erroDoAcervo,
  onRecarregar,
  onRecolher,
}: Props) {
  const grupos = useMemo(() => agruparCamadas(camadas), []);
  // Guarda os ABERTOS, e começa vazio: toda sessão nasce com tudo recolhido. Guardar
  // os fechados daria o mesmo desenho hoje e erraria no dia em que um combo novo
  // aparecesse — ele nasceria aberto por não estar na lista.
  const [abertos, setAbertos] = useState<readonly string[]>([]);
  const alternar = (id: string) =>
    setAbertos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  return (
    <Secao className="border-r border-border bg-background">
      <SecaoCabecalho
        titulo="Camadas"
        icone={Layers}
        acao={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Recolher o painel de camadas"
            aria-expanded
            onClick={onRecolher}
          >
            <PanelLeftClose aria-hidden="true" />
          </Button>
        }
      />

      <SecaoCorpo>
        <div className="flex flex-col gap-1">
          {grupos.map((grupo) => (
            <Combo
              key={grupo.id}
              rotulo={grupo.rotulo}
              icone={ICONE_DO_GRUPO[grupo.id] ?? Layers}
              ligadas={grupo.camadas.filter((c) => visible[c.id]).length}
              aberto={abertos.includes(grupo.id)}
              onAlternar={() => alternar(grupo.id)}
            >
              {grupo.camadas.map((c) => (
                <div key={c.id}>
                  <Linha
                    rotulo={c.rotulo}
                    fonte={c.fonte}
                    amostra={<Amostra camada={c} />}
                    ligada={!!visible[c.id]}
                    onAlternar={() => onToggle(c.id)}
                  />
                  {/* A cobertura fica; a legenda categórica saiu em 2026-09-03.
                      Com 14 famílias e 38 códigos ela empilhava ~52 peças debaixo de
                      UMA linha, num painel estreito — e embaralhava a coluna inteira.
                      A tematização se lê no mapa, que é onde ela tem espaço. Se o
                      cliente pedir a referência das siglas, ela volta em outro lugar,
                      não aqui. */}
                  {c.cobertura && (
                    <p className="ml-9 pb-1 text-xs text-muted-foreground">{c.cobertura}</p>
                  )}
                  {/* O seletor aparece mesmo com a camada apagada: ele responde "o que
                      esta camada mostra", que é o que se quer saber ANTES de ligar. A
                      legenda responde "o que estas cores querem dizer", e essa só faz
                      sentido com a camada acesa. */}
                  {c.temasNumericos && c.temasNumericos.length > 1 && (
                    <SeletorDeTema
                      camada={c}
                      ativo={temaDaCamada(c, temaAtivo[c.id])}
                      onEscolher={(idDoTema) => onEscolherTema(c.id, idDoTema)}
                    />
                  )}
                  {visible[c.id] && temaDaCamada(c, temaAtivo[c.id]) && (
                    <LegendaNumerica tema={temaDaCamada(c, temaAtivo[c.id])!} />
                  )}
                </div>
              ))}
            </Combo>
          ))}

          {/* O acervo do cliente, no último combo e com o nome que ele dá a ele.
              Os desenhos são as FOLHAS: com uma categoria só, um degrau "categoria"
              no meio era um clique a mais para chegar no mesmo lugar.

              Aparece também quando o acervo FALHOU, e é por isso que a condição não
              é só `itens.length`: sumir calado faria "não deu para perguntar" parecer
              "não há nada", que é a única diferença capaz de decidir se vale tentar
              de novo. */}
          {(itens.length > 0 || erroDoAcervo) && (
            <Combo
              rotulo={configuracaoAcervo.rotulo}
              icone={PenLine}
              ligadas={itens.filter((i) => !ocultos.includes(i.id)).length}
              aberto={abertos.includes(CHAVE_DO_ACERVO)}
              onAlternar={() => alternar(CHAVE_DO_ACERVO)}
            >
              {erroDoAcervo ? (
                <EstadoVazio icone={CloudOff}>
                  {erroDoAcervo.indisponivel
                    ? "Não foi possível carregar agora. O mapa continua funcionando."
                    : erroDoAcervo.message}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={onRecarregar}
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    Tentar de novo
                  </Button>
                </EstadoVazio>
              ) : (
                itens.map((item) => (
                  <LinhaDoAcervo
                    key={item.id}
                    item={item}
                    ligada={!ocultos.includes(item.id)}
                    onAlternar={() => onAlternarItem(item.id)}
                    onFocalizar={() => onFocalizar(item)}
                    onRaioX={() => onRaioX(item)}
                    onApagar={() => onApagar(item)}
                  />
                ))
              )}
            </Combo>
          )}
        </div>
      </SecaoCorpo>
    </Secao>
  );
}

/** O acervo não é um `IdDeGrupo`; a chave é daqui, e o prefixo evita colidir com um. */
const CHAVE_DO_ACERVO = "@acervo";

/**
 * Um combo: o selo do tema, o título, o quanto dele está ligado e a seta.
 *
 * A conta passou por três formas até esta, e o motivo de cada troca fica registrado
 * porque as três voltam a ser tentadoras: "1 de 5" em todo cabeçalho competia com o
 * nome do tema; uma seção "Ativas" no topo resolvia a pergunta de uma vez, mas ligar
 * uma camada EMPURRAVA a lista inteira para baixo, e o painel se mexia debaixo do
 * clique. Aqui a resposta fica onde a camada está: o número só aparece quando há
 * alguma ligada, e é ele que avisa, com o combo fechado, que há coisa acesa ali dentro.
 */
function Combo({
  rotulo,
  icone: Icone,
  ligadas,
  aberto,
  onAlternar,
  children,
}: {
  rotulo: string;
  icone: LucideIcon;
  ligadas: number;
  aberto: boolean;
  onAlternar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={aberto} onOpenChange={onAlternar}>
      <CollapsibleTrigger className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-accent">
        {/* O selo acende quando o combo está aberto: é o segundo sinal de "este aqui
            está aberto", e o único que sobrevive à lista rolada, quando a seta do
            cabeçalho já saiu da tela. */}
        <span
          aria-hidden="true"
          className={cn(
            "grid size-[1.625rem] shrink-0 place-items-center rounded-md border transition-colors",
            aberto
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground",
          )}
        >
          <Icone className="size-3.5" />
        </span>
        {/* Mesma tipografia das camadas de dentro: um combo com letra menor lia como
            legenda de outra coisa, e não como o primeiro nível da mesma árvore. */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{rotulo}</span>
        {ligadas > 0 && (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">
            {ligadas}
          </span>
        )}
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            aberto && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* O filete à esquerda amarra as camadas ao selo do combo: sem ele, a lista
            de dentro flutuava à mesma distância da margem que o próprio cabeçalho. */}
        <div className="ml-[0.9375rem] flex flex-col gap-0.5 border-l border-border py-0.5 pl-2.5">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Uma camada. O nome trunca e o olho não encolhe: é ele que se procura.
 *
 * A linha inteira é o interruptor — um controle só, e não um botão dentro de outro.
 * O olho é desenho; quem carrega o estado para o leitor de tela é o `role="switch"`.
 */
function Linha({
  rotulo,
  fonte,
  amostra,
  ligada,
  onAlternar,
}: {
  rotulo: string;
  fonte?: string;
  amostra: React.ReactNode;
  ligada: boolean;
  onAlternar: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      onClick={onAlternar}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
    >
      {amostra}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm",
            ligada ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {rotulo}
        </span>
        {/* Procedência só quando ela existe de verdade. Ver o comentário de `fonte`
            no esquema: a lacuna é mais honesta que um "a confirmar". */}
        {fonte && <span className="block truncate text-xs text-muted-foreground">{fonte}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn("shrink-0", ligada ? "text-primary" : "text-muted-foreground opacity-60")}
      >
        {ligada ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </span>
    </button>
  );
}

/**
 * Um desenho do cliente. Tem mais coisa que uma camada porque ele é dado do cliente:
 * dá para ir até ele, escondê-lo e apagá-lo.
 *
 * A lixeira só aparece no hover (e ao receber foco pelo teclado, senão ela sumiria
 * para quem não usa mouse). Numa lista de dado insubstituível, botão de apagar sempre
 * visível em toda linha é convite; escondido atrás do gesto de mirar a linha, não.
 */
function LinhaDoAcervo({
  item,
  ligada,
  onAlternar,
  onFocalizar,
  onApagar,
  onRaioX,
}: {
  item: ItemDoAcervo;
  ligada: boolean;
  onAlternar: () => void;
  onFocalizar: () => void;
  onApagar: () => void;
  onRaioX: () => void;
}) {
  // Um booleano por linha, e não um id no pai: a confirmação é estado da linha, e
  // guardá-la em cima faria abrir numa linha abrir em todas.
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent">
      <AmostraDoAcervo item={item} />
      <button
        type="button"
        onClick={onFocalizar}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-sm",
          ligada ? "font-medium text-foreground" : "text-muted-foreground",
        )}
        title={item.nome}
      >
        {item.nome}
      </button>

      {confirmando ? (
        // Confirmar na própria linha, e não num diálogo: quem apaga precisa continuar
        // vendo QUAL desenho está apagando.
        <span className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="destructive"
            size="xs"
            onClick={() => {
              setConfirmando(false);
              onApagar();
            }}
          >
            Apagar
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => setConfirmando(false)}>
            Não
          </Button>
        </span>
      ) : (
        <>
          {/*
            Ponto não ganha o botão. Sem área não há o que agregar, e oferecer a ação
            para depois recusar com 422 seria ensinar o produto pelo erro.
          */}
          {item.tipo !== "ponto" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Gerar Raio-X de ${item.nome}`}
              title="Gerar Raio-X"
              className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={onRaioX}
            >
              <Radar aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Apagar ${item.nome}`}
            className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            onClick={() => setConfirmando(true)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
          <button
            type="button"
            role="switch"
            aria-checked={ligada}
            aria-label={`Mostrar ${item.nome} no mapa`}
            onClick={onAlternar}
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-border",
              ligada ? "text-primary" : "text-muted-foreground opacity-60",
            )}
          >
            {ligada ? (
              <Eye aria-hidden="true" className="size-4" />
            ) : (
              <EyeOff aria-hidden="true" className="size-4" />
            )}
          </button>
        </>
      )}
    </div>
  );
}

/** A marca do desenho: bolinha no ponto, quadradinho na área. */
function AmostraDoAcervo({ item }: { item: ItemDoAcervo }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-3 shrink-0 ring-1 ring-black/10",
        item.tipo === "ponto" ? "rounded-full" : "rounded-sm",
      )}
      style={{ background: item.cor }}
    />
  );
}

// Legenda — reflete a geometria: ícone (pontos com ícone), traço (linhas),
// contorno (UF) ou área (polígonos preenchidos).
function Amostra({ camada }: { camada: DefinicaoCamada }) {
  if (camada.geometria === "ponto") {
    const Icone = camada.icone ? ICONE_DA_LEGENDA[camada.icone] : undefined;
    if (Icone) return <Icone className="size-4 shrink-0" style={{ color: camada.cor }} />;
    // Ponto sem ícone: bolinha colorida.
    return (
      <span
        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/5"
        style={{ background: camada.cor }}
      />
    );
  }
  if (camada.geometria === "linha") return <AmostraDeLinha camada={camada} />;
  if (camada.opacidadePreenchimento === 0 && camada.contorno) {
    return (
      <span
        className="size-3 shrink-0 rounded-sm border-2 bg-transparent"
        style={{ borderColor: camada.contorno.cor }}
      />
    );
  }
  return (
    <span
      className="size-3 shrink-0 rounded-sm ring-1 ring-black/5"
      style={{
        background: camada.cor,
        borderColor: camada.contorno?.cor ?? camada.cor,
      }}
    />
  );
}

/**
 * Linha: o símbolo que a carta usa, e não um retângulo colorido.
 *
 * Um fio de 3 px dizia só "isto é uma linha" — e as duas linhas do catálogo são
 * justamente as que a cartografia aprendeu a separar de olho: a ferrovia por dormentes
 * (o trilho com travessas) e a rodovia por pista com faixa central.
 *
 * Quem decide qual desenho sai são os MESMOS campos que o mapa lê — `tracejado` e
 * `faixaCentral` —, e não uma lista de exceção por id: camada de linha nova cai no
 * símbolo certo sozinha, e uma mudança no mapa que não passe por aqui fica visível.
 */
function AmostraDeLinha({ camada }: { camada: DefinicaoCamada }) {
  const trilho = !!camada.tracejado;
  const faixa = camada.faixaCentral;
  return (
    <svg
      width="18"
      height="12"
      viewBox="0 0 18 12"
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      {trilho ? (
        <>
          <line x1="0.5" y1="6" x2="17.5" y2="6" stroke={camada.cor} strokeWidth="1.6" />
          {[2.5, 6, 9.5, 13, 16.5].map((x) => (
            <line
              key={x}
              x1={x}
              y1="2.5"
              x2={x}
              y2="9.5"
              stroke={camada.cor}
              strokeWidth="1.3"
            />
          ))}
        </>
      ) : (
        <>
          <line
            x1="1.5"
            y1="6"
            x2="16.5"
            y2="6"
            stroke={camada.cor}
            strokeWidth="5"
            strokeLinecap="round"
          />
          {faixa && (
            <line
              x1="3"
              y1="6"
              x2="15"
              y2="6"
              stroke={faixa.cor}
              strokeWidth="1"
              strokeDasharray={faixa.tracejado ? "2.5 2" : undefined}
              opacity="0.9"
            />
          )}
        </>
      )}
    </svg>
  );
}

/**
 * O seletor de variável de uma camada com vários temas.
 *
 * Lista suspensa, e não botões lado a lado: "Domicílios particulares" escrito por
 * extenso não cabe em três colunas num painel de 308 px, e a etapa 2 da malha H3 vai
 * trazer dez ou vinte variáveis — o controle já nasce no formato que aguenta isso.
 * Cada item traz a miniatura da própria rampa, que é o que diz, antes do clique, que
 * mudar de variável muda a cor do mapa inteiro.
 */
function SeletorDeTema({
  camada,
  ativo,
  onEscolher,
}: {
  camada: DefinicaoCamada;
  ativo: TemaNumerico | null;
  onEscolher: (idDoTema: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const temas = camada.temasNumericos ?? [];
  if (!ativo) return null;

  return (
    <div className="ml-9 pb-2">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger
          className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-left transition-colors hover:bg-accent"
          aria-label={`Variável de ${camada.rotulo}`}
        >
          <Rampa tema={ativo} className="h-3 w-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-xs">{ativo.rotulo}</span>
          <ChevronsUpDown aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-1">
          <div role="listbox" aria-label={`Variáveis de ${camada.rotulo}`}>
            {temas.map((tema) => (
              <button
                key={tema.id}
                type="button"
                role="option"
                aria-selected={tema.id === ativo.id}
                onClick={() => {
                  onEscolher(tema.id);
                  setAberto(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  tema.id === ativo.id && "font-medium",
                )}
              >
                <Rampa tema={tema} className="h-3 w-6 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{tema.rotulo}</span>
                {tema.id === ativo.id && (
                  <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** A rampa de um tema, do mínimo ao máximo. Serve de amostra e de legenda. */
function Rampa({ tema, className }: { tema: TemaNumerico; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("rounded-sm ring-1 ring-black/10", className)}
      style={{ background: `linear-gradient(to right, ${tema.corInicial}, ${tema.corFinal})` }}
    />
  );
}

/** Escala curta: cabe no painel sem transformar a árvore em uma segunda cartografia. */
function LegendaNumerica({ tema }: { tema: TemaNumerico }) {
  const formatar = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  return (
    <div className="ml-9 pb-2 pt-0.5" role="group" aria-label={`Legenda: ${tema.rotulo}`}>
      <Rampa tema={tema} className="block h-2 w-full" />
      <div className="mt-0.5 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{formatar.format(tema.minimo)}</span>
        <span>{formatar.format(tema.maximo)}+</span>
      </div>
    </div>
  );
}
