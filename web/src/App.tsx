import { useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { MapView, type MapFocus, type SelectedFeature, type Viewport } from "@/map/MapView";
import type { SearchHit } from "@/search";
import { LayerPanel } from "@/panels/LayerPanel";
import { AttributePanel } from "@/panels/AttributePanel";
import { ChatPanel, type PerguntaExterna } from "@/chat/ChatPanel";
import { camadas } from "@/configuracao";
import type { Destaques } from "@/map/highlight";
import type { ContextoMapa } from "@/chat/api";
import { useTheme } from "@/hooks/use-theme";
import { PainelMedicao } from "@/components/PainelMedicao";
import { criarEstadoMedicao, type Coordenada, type ModoMedicao } from "@/map/medicao";
import { BarraFerramentas } from "@/desenho/BarraFerramentas";
import { FormularioDesenho, type DadosDoFormulario } from "@/desenho/FormularioDesenho";
import { PainelDesenhos } from "@/desenho/PainelDesenhos";
import { useAcervo } from "@/desenho/useAcervo";
import { areaFormatada, bboxDe, type Desenho, type ModoDesenho } from "@/desenho/geometria";
import {
  comVertice,
  criarEstadoDesenho,
  geometriaParaSalvar,
  semUltimoVertice,
} from "@/desenho/estado";
import { ErroDoAcervo } from "@/desenho/api";

const visibilidadeInicial = Object.fromEntries(
  camadas.map((c) => [c.id, c.visivelPorPadrao]),
) as Record<string, boolean>;

export function App() {
  const { theme, toggle } = useTheme();
  const [satellite, setSatellite] = useState(false);
  const [satelliteOverlay, setSatelliteOverlay] = useState(true);
  const [visible, setVisible] = useState<Record<string, boolean>>(visibilidadeInicial);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const [destaques, setDestaques] = useState<Destaques | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Pergunta disparada de fora do chat (hoje, pelo painel de novidades). A `key`
  // existe para a MESMA pergunta poder ser pedida duas vezes — sem ela, o efeito
  // do ChatPanel não veria mudança nenhuma na segunda.
  const [pergunta, setPergunta] = useState<PerguntaExterna | null>(null);
  // Medição: o modo e os vértices são o estado; a medida em si é derivada deles
  // por `criarEstadoMedicao`, que é função pura. Guardar o valor calculado daria
  // duas fontes para o mesmo número.
  const [modoMedicao, setModoMedicao] = useState<ModoMedicao | null>(null);
  const [verticesMedicao, setVerticesMedicao] = useState<Coordenada[]>([]);
  // Desenho: mesmo arranjo da medição — modo e vértices são o estado, e tudo o que
  // a barra mostra (o que falta, o impedimento, a área) sai de `criarEstadoDesenho`.
  const [modoDesenho, setModoDesenho] = useState<ModoDesenho | null>(null);
  const [verticesDesenho, setVerticesDesenho] = useState<Coordenada[]>([]);
  const [raioDesenho, setRaioDesenho] = useState<number | null>(null);
  const [desenhosVisiveis, setDesenhosVisiveis] = useState(true);
  const [preenchendo, setPreenchendo] = useState(false);
  const [salvandoDesenho, setSalvandoDesenho] = useState(false);
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  // Viewport em ref: muda a cada pan/zoom sem re-renderizar; lido só no envio do chat.
  const viewportRef = useRef<Viewport | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const acervo = useAcervo();

  const toggleLayer = (id: string) => setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  const medicao = criarEstadoMedicao(modoMedicao, verticesMedicao);
  const desenho = criarEstadoDesenho(modoDesenho, verticesDesenho, raioDesenho);

  const encerrarMedicao = () => {
    setModoMedicao(null);
    setVerticesMedicao([]);
  };

  const cancelarDesenho = () => {
    setModoDesenho(null);
    setVerticesDesenho([]);
    setRaioDesenho(null);
    setPreenchendo(false);
    setErroAoSalvar(null);
  };

  /**
   * Duplo clique ou Enter: encerra o traçado e abre o formulário.
   *
   * `duplicouUltimo` vem do duplo clique — o MapLibre dispara `click` nas duas batidas
   * antes do `dblclick`, então o último vértice entrou repetido. Deixá-lo criaria dois
   * pontos idênticos em sequência, que é justamente o que `validar` recusa como anel
   * degenerado: a pessoa faria o gesto certo e receberia "há pontos repetidos".
   */
  const encerrarDesenho = (duplicouUltimo: boolean) => {
    const limpo = duplicouUltimo ? semUltimoVertice(desenho) : desenho;
    setVerticesDesenho(limpo.coordenadas);
    if (limpo.completo) setPreenchendo(true);
  };

  // Clicar no modo já ativo desliga; trocar de modo zera os vértices, porque uma
  // linha de dois pontos não vira área nem o contrário.
  const alternarMedicao = (modo: ModoMedicao) => {
    setVerticesMedicao([]);
    setModoMedicao((atual) => (atual === modo ? null : modo));
    // Medir e inspecionar disputam o clique: ao entrar na ferramenta, o painel de
    // atributos larga o que estava selecionado em vez de mostrar feição antiga.
    setSelected(null);
    // Medir e desenhar disputam o mesmo clique. Uma ferramenta por vez, e a que
    // sai leva o traçado junto — deixá-lo pela metade na tela prometeria que ele
    // continua editável, e o próximo clique já seria da outra ferramenta.
    cancelarDesenho();
  };

  const alternarDesenho = (modo: ModoDesenho) => {
    setVerticesDesenho([]);
    setRaioDesenho(null);
    setPreenchendo(false);
    setErroAoSalvar(null);
    setModoDesenho((atual) => (atual === modo ? null : modo));
    setSelected(null);
    encerrarMedicao();
  };

  const salvarDesenho = async (dados: DadosDoFormulario) => {
    const geometria = geometriaParaSalvar(desenho);
    if (!geometria || !modoDesenho) return;
    setSalvandoDesenho(true);
    setErroAoSalvar(null);
    try {
      await acervo.salvar({
        tipo: modoDesenho,
        geometria,
        // No buffer a geometria enviada é o CENTRO; quem gera o círculo definitivo é
        // o PostGIS, com ST_Buffer sobre geography (Decisão 2 do DESIGN).
        ...(modoDesenho === "buffer" ? { raio_m: raioDesenho } : {}),
        ...dados,
      });
      cancelarDesenho();
    } catch (e) {
      setErroAoSalvar(
        e instanceof ErroDoAcervo ? e.message : "Não foi possível salvar. Tente de novo.",
      );
    } finally {
      setSalvandoDesenho(false);
    }
  };

  const focalizarDesenho = (d: Desenho) => {
    const bbox = bboxDe(d.geometria);
    // Um ponto tem caixa degenerada, e o `maxZoom` é quem decide o enquadramento;
    // numa área, o `fitBounds` já faz o trabalho.
    if (bbox) setFocus({ bbox, key: Date.now(), maxZoom: d.tipo === "ponto" ? 16 : 14 });
  };

  // Busca do header: voa até o alvo; município também ganha o destaque azul
  // (mesma linguagem visual do chat — um "slot" só de destaque por vez).
  const onSearchSelect = (hit: SearchHit) => {
    const maxZoom = hit.tipo === "endereco" ? 17 : 12;
    setFocus({ bbox: hit.bbox, key: Date.now(), maxZoom });
    if (hit.cdMun) setDestaques({ camada: "municipio", codigos: [hit.cdMun] });
  };

  const getContexto = (): ContextoMapa | null => {
    const v = viewportRef.current;
    const camadas_ativas = camadas.filter((c) => visibleRef.current[c.id]).map((c) => c.id);
    if (!v) return { camadas_ativas };
    return { bbox: v.bbox, zoom: v.zoom, centro: v.centro, camadas_ativas };
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Header
          theme={theme}
          onToggleTheme={toggle}
          satellite={satellite}
          onToggleSatellite={() => setSatellite((s) => !s)}
          satelliteOverlay={satelliteOverlay}
          onToggleSatelliteOverlay={() => setSatelliteOverlay((s) => !s)}
          onSearchSelect={onSearchSelect}
          onPerguntar={(texto) => setPergunta({ texto, key: Date.now() })}
          modoMedicao={modoMedicao}
          onAlternarMedicao={alternarMedicao}
        />
        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_340px]">
          {/* Grid, e não flex, para as duas colunas da esquerda: os itens de grid
              esticam até a altura da linha sozinhos, e é isso que faz a área de
              rolagem de cada painel ter altura definida sem alterar nenhum deles. */}
          <div className="grid min-h-0 grid-rows-[1fr_1.2fr]">
            <LayerPanel visible={visible} onToggle={toggleLayer} />
            <PainelDesenhos
              pagina={acervo.pagina}
              categorias={acervo.categorias}
              carregando={acervo.carregando}
              erro={acervo.erro}
              busca={acervo.busca}
              onBuscar={acervo.buscar}
              categoria={acervo.categoria}
              onFiltrarCategoria={acervo.filtrarCategoria}
              onIrParaPagina={acervo.irParaPagina}
              onFocalizar={focalizarDesenho}
              onApagar={(d) => {
                void acervo.apagar(d.id);
              }}
              onRecarregar={acervo.recarregar}
              visivelNoMapa={desenhosVisiveis}
              onAlternarVisibilidade={() => setDesenhosVisiveis((v) => !v)}
            />
          </div>
          {/* O mapa "acende" no centro: leve elevação em volta da célula. */}
          <div className="relative overflow-hidden">
            <MapView
              visible={visible}
              theme={theme}
              satellite={satellite}
              satelliteOverlay={satelliteOverlay}
              onSelect={setSelected}
              highlights={destaques}
              focus={focus}
              onViewportChange={(v) => {
                viewportRef.current = v;
              }}
              medicao={medicao}
              onVerticeMedicao={(c) => setVerticesMedicao((prev) => [...prev, c])}
              onEncerrarMedicao={encerrarMedicao}
              desenho={desenho}
              onVerticeDesenho={(c) => {
                setVerticesDesenho(comVertice(desenho, c).coordenadas);
              }}
              onCancelarDesenho={cancelarDesenho}
              onEncerrarDesenho={encerrarDesenho}
              desenhos={acervo.desenhos}
              desenhosVisiveis={desenhosVisiveis}
            />
            <PainelMedicao
              medicao={medicao}
              onEncerrar={encerrarMedicao}
              onRecomecar={() => setVerticesMedicao([])}
            />
            {/* Barra e formulário dividem o mesmo canto: são dois passos do mesmo
                gesto, e mostrar os dois convidaria a trocar de modo no meio de um
                salvamento — o que jogaria fora o traçado que está sendo nomeado. */}
            {preenchendo && modoDesenho ? (
              <FormularioDesenho
                tipo={modoDesenho}
                area={areaFormatada(modoDesenho, verticesDesenho, raioDesenho)}
                categorias={acervo.categorias}
                salvando={salvandoDesenho}
                erro={erroAoSalvar}
                onSalvar={(dados) => {
                  void salvarDesenho(dados);
                }}
                onCancelar={() => setPreenchendo(false)}
              />
            ) : (
              <BarraFerramentas
                estado={desenho}
                onAlternarModo={alternarDesenho}
                onDesfazer={() => setVerticesDesenho(semUltimoVertice(desenho).coordenadas)}
                onCancelar={cancelarDesenho}
                onSalvar={() => setPreenchendo(true)}
                onMudarRaio={setRaioDesenho}
                acervoIndisponivel={acervo.erro?.indisponivel ?? false}
              />
            )}
          </div>
          <div className="flex min-h-0 flex-col border-l border-border bg-background">
            <div className="min-h-0 flex-1">
              <AttributePanel selected={selected} />
            </div>
            <div className="min-h-0 flex-[1.4]">
              <ChatPanel onDestaques={setDestaques} getContexto={getContexto} pergunta={pergunta} />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
