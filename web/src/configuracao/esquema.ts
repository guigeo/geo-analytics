/**
 * O contrato de uma aplicação derivada.
 *
 * Esta é a fronteira que o passo 5 do ADR-0001 do `webgis` cria: o que difere
 * entre clientes é dado, não código. Tudo que uma aplicação precisa saber sobre
 * o cliente dela mora num arquivo de configuração validado por este esquema —
 * identidade, mapa, camadas e chat. Se atender um cliente novo exigir editar
 * `.tsx`, o modelo falhou.
 *
 * Adaptado de `frontend/src/config/schema.ts` do `webgis-core` — repositório
 * apagado em 2026-08-31, depois de a conta dele fechar (`webgis/docs/HERANCA.md`,
 * §1) —, e traduzido: a decisão de 2026-08-29 é português em tudo, sem fronteira
 * de idioma dentro do código (ver `webgis/docs/HERANCA.md`, §7, pendência 2).
 *
 * A validação roda no boot e falha alto. Configuração errada que só aparece
 * quando alguém liga a camada é pior do que aplicação que não sobe.
 */
import { z } from "zod";
import { IDS_DE_FONTE } from "./fontes";

const Cor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "cor precisa ser hexadecimal de 6 dígitos, como #3a5a8c");

/**
 * Cor de tema. Aceita hexadecimal **ou** `oklch(L C H)`, porque os tokens do
 * `styles.css` são oklch e o cliente 1 precisa dizer exatamente a cor que já
 * tinha — converter para hexadecimal mudaria o pixel. A marca de um cliente
 * costuma vir em hexadecimal, do manual dele.
 *
 * O padrão é fechado de propósito: estas cores vão para dentro de uma folha de
 * estilo montada em tempo de execução, e só entra ali o que o esquema aceitou.
 */
const CorTema = z
  .string()
  .regex(
    /^(#[0-9a-fA-F]{6}|oklch\(\d*\.?\d+ \d*\.?\d+ \d*\.?\d+\))$/,
    "cor de tema aceita hexadecimal de 6 dígitos ou oklch(L C H)",
  );

const Longitude = z.number().min(-180).max(180);
const Latitude = z.number().min(-90).max(90);

/** [longitude, latitude] — a ordem do GeoJSON e do MapLibre, não a do senso comum. */
const Coordenada = z.tuple([Longitude, Latitude]);

export const EsquemaAtributo = z.object({
  /** Nome da propriedade como ela vem no tile. */
  chave: z.string().min(1),
  /** Como ela aparece no painel para quem usa. */
  rotulo: z.string().min(1),
});

export const EsquemaRotuloNoMapa = z.object({
  campo: z.string().min(1),
  zoomMinimo: z.number().min(0).max(24),
  tamanho: z.number().positive(),
  cor: Cor,
});

export const EsquemaContorno = z.object({
  cor: Cor,
  largura: z.number().positive(),
});

export const EsquemaPinturaPorCategoria = z.object({
  campo: z.string().min(1),
  entradas: z
    .array(
      z.object({
        codigo: z.string().min(1),
        cor: Cor,
        familia: z.string().min(1),
      }),
    )
    .min(1),
});

export const GEOMETRIAS = ["poligono", "linha", "ponto"] as const;
export const ANCORAS_ICONE = ["centro", "base"] as const;

/**
 * Os temas em que o painel agrupa as camadas.
 *
 * Grupo é propriedade da CAMADA, não escolha do cliente: "UF" é do IBGE em qualquer
 * aplicação, e deixar cada cliente arrumar as mesmas oito camadas seria criar chave
 * para errar — a emenda de 2026-08-31 à regra 1 do ADR-0001. O cliente escolhe QUAIS
 * enxerga; o grupo vem junto com a camada, e grupo que ficou sem camada nenhuma
 * simplesmente não aparece.
 *
 * Não há "abre por padrão": **toda sessão começa com tudo recolhido**, decidido em
 * 2026-09-02. Chave que só pode ter um valor não é configuração, é cerimônia — e é
 * uma chave a mais para alguém virar sem querer.
 */
export const GRUPOS_DE_CAMADA = {
  ibge: { rotulo: "Informações IBGE" },
  infraestrutura: { rotulo: "Infraestrutura" },
  regulacao: { rotulo: "Regulação urbana" },
} as const;

export const IDS_DE_GRUPO = Object.keys(GRUPOS_DE_CAMADA) as [IdDeGrupo, ...IdDeGrupo[]];
export type IdDeGrupo = keyof typeof GRUPOS_DE_CAMADA;

export const EsquemaCamada = z
  .object({
    /** Id da camada. Vira id de fonte e de camada no MapLibre, e nome do .pmtiles. */
    id: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "id de camada aceita minúsculas, dígitos e _, começando por letra",
      ),
    rotulo: z.string().min(1),
    /** Em que combo do painel ela aparece. Ver `GRUPOS_DE_CAMADA`. */
    grupo: z.enum(IDS_DE_GRUPO),
    /** Camada dentro do vector tile (o `source-layer` do MapLibre). */
    camadaFonte: z.string().min(1),
    geometria: z.enum(GEOMETRIAS),
    /** Cor representativa: legenda e desenho base. */
    cor: Cor,
    /** Pinta cada valor de um atributo com a paleta declarada. */
    pinturaPorCategoria: EsquemaPinturaPorCategoria.optional(),
    /** Onde a camada existe, medido na fonte e exibido junto dela. */
    cobertura: z.string().min(1).optional(),
    /** Polígonos: 0 desenha só o contorno, mas a área continua clicável. */
    opacidadePreenchimento: z.number().min(0).max(1).optional(),
    contorno: EsquemaContorno.optional(),
    /** Linhas: largura do traço no zoom alto. */
    larguraLinha: z.number().positive().optional(),
    /** Pontos: id de um ícone registrado no mapa. Sem ícone, vira círculo colorido. */
    icone: z.string().min(1).optional(),
    ancoraIcone: z.enum(ANCORAS_ICONE).optional(),
    /** Pontos: deixar ícones sobrepostos em vez de escondê-los por colisão. */
    iconesPodemSobrepor: z.boolean().optional(),
    rotuloNoMapa: EsquemaRotuloNoMapa.optional(),
    atributos: z
      .array(EsquemaAtributo)
      .min(1, "camada sem atributo não mostra nada ao ser clicada"),
  })
  .superRefine((camada, ctx) => {
    // As três checagens abaixo pegam configuração que o TypeScript aceita e o
    // mapa ignora em silêncio — que é a pior categoria de erro aqui.
    if (camada.geometria !== "ponto" && (camada.icone || camada.ancoraIcone)) {
      ctx.addIssue({
        code: "custom",
        message: `camada "${camada.id}": ícone só se aplica a geometria de ponto`,
      });
    }
    if (camada.geometria !== "linha" && camada.larguraLinha !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: `camada "${camada.id}": larguraLinha só se aplica a geometria de linha`,
      });
    }
    if (camada.geometria === "ponto" && camada.opacidadePreenchimento !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: `camada "${camada.id}": opacidadePreenchimento não se aplica a ponto`,
      });
    }
  });

export const EsquemaIdentidade = z.object({
  /** Vai no cabeçalho e é como o cliente chama a ferramenta. */
  nome: z.string().min(1),
  /** Linha de apoio no cabeçalho. */
  subtitulo: z.string().min(1),
});

/**
 * O símbolo do cliente, como dado.
 *
 * Não é um componente por cliente: é o desenho descrito em traços, que um
 * componente só sabe pintar. Marca de cliente é linha, não código — se atender
 * cliente novo exigisse um `.tsx` de logo, a regra 1 do ADR-0001 já teria caído.
 *
 * `aparado` recorta o traço pelo círculo de `apara`. No EB Prime as duas pernas
 * externas das silhuetas são cortadas pelo próprio anel, e é isso que dá o canto
 * chanfrado da base.
 */
export const EsquemaSimbolo = z
  .object({
    /** `minX minY largura altura`, como no atributo do SVG. */
    viewBox: z
      .string()
      .regex(
        /^-?\d*\.?\d+ -?\d*\.?\d+ \d*\.?\d+ \d*\.?\d+$/,
        "viewBox é 'minX minY largura altura'",
      ),
    /** Espessura do traço, nas unidades do viewBox. */
    espessura: z.number().positive(),
    /** Os traços, na ordem em que são pintados. */
    tracos: z
      .array(z.object({ d: z.string().min(1), aparado: z.boolean().optional() }))
      .min(1, "símbolo sem traço nenhum não desenha nada"),
    /** Círculo que apara os traços marcados. */
    apara: z.object({ cx: z.number(), cy: z.number(), r: z.number().positive() }).optional(),
  })
  .superRefine((simbolo, ctx) => {
    if (simbolo.tracos.some((t) => t.aparado) && !simbolo.apara) {
      // Sem o círculo o recorte vira vazio e o SVG some inteiro, sem erro.
      ctx.addIssue({
        code: "custom",
        message: "símbolo com traço aparado precisa do círculo em `apara`",
      });
    }
  });

/**
 * Os neutros — o que sobra da tela quando se tira a marca.
 *
 * A cor primária dá o sotaque; estes dão o clima. Fundo, cartão, texto, borda e
 * o raio dos cantos decidem se a aplicação parece fria ou quente, densa ou
 * arejada, dura ou macia — e é aí que duas aplicações deixam de parecer a mesma
 * com outra cor.
 *
 * Tudo opcional: quem não diz nada fica com os tokens do `styles.css`.
 */
export const EsquemaNeutros = z.object({
  fundo: CorTema.optional(),
  cartao: CorTema.optional(),
  texto: CorTema.optional(),
  textoFraco: CorTema.optional(),
  borda: CorTema.optional(),
  superficie: CorTema.optional(),
});

/**
 * A cara do cliente.
 *
 * Duas cores e um desenho. As cores viram os tokens `--primary` e `--ring` do
 * `styles.css` — claro e escuro separados porque um navy que funciona sobre
 * branco desaparece sobre o fundo escuro, e o contrário também.
 */
export const EsquemaTema = z.object({
  marca: CorTema,
  marcaEscura: CorTema,
  /** Sem símbolo, o cabeçalho usa o globo padrão da casca. */
  simbolo: EsquemaSimbolo.optional(),
  /**
   * Forma do selo que abriga o símbolo no cabeçalho. Não é enfeite: a marca do
   * EB Prime é circular — logo e os doze ícones dele — e um selo quadrado
   * brigaria com ela.
   */
  forma: z.enum(["quadrado", "circulo"]),
  /** Tipografia, escolhida do catálogo da casca. */
  fontes: z.object({
    titulo: z.enum(IDS_DE_FONTE),
    texto: z.enum(IDS_DE_FONTE),
  }),
  /** Raio dos cantos, em CSS (`0.25rem`, `2px`). Canto duro lê como corporativo. */
  raio: z
    .string()
    .regex(/^\d*\.?\d+(rem|px)$/, "raio é um comprimento em rem ou px, como 0.375rem")
    .optional(),
  claros: EsquemaNeutros.optional(),
  escuros: EsquemaNeutros.optional(),
});

export const EsquemaMapa = z
  .object({
    centro: Coordenada,
    zoomInicial: z.number().min(0).max(24),
    zoomMinimo: z.number().min(0).max(24).optional(),
    zoomMaximo: z.number().min(0).max(24).optional(),
  })
  .superRefine((mapa, ctx) => {
    const { zoomMinimo, zoomMaximo, zoomInicial } = mapa;
    if (zoomMinimo !== undefined && zoomMaximo !== undefined && zoomMinimo > zoomMaximo) {
      ctx.addIssue({ code: "custom", message: "zoomMinimo não pode ser maior que zoomMaximo" });
    }
    if (zoomMinimo !== undefined && zoomInicial < zoomMinimo) {
      ctx.addIssue({ code: "custom", message: "zoomInicial está abaixo do zoomMinimo" });
    }
    if (zoomMaximo !== undefined && zoomInicial > zoomMaximo) {
      ctx.addIssue({ code: "custom", message: "zoomInicial está acima do zoomMaximo" });
    }
  });

export const EsquemaChat = z.object({
  habilitado: z.boolean(),
  /** Aparecem no estado vazio, que é onde a pessoa olha quando não sabe o que perguntar. */
  sugestoes: z.array(z.string().min(1)),
});

/**
 * Como o cliente chama o que ELE desenhou.
 *
 * "Desenhos" descreve o gesto; para quem contratou, aquilo são as *áreas dele* — e o
 * nome que a casca daria não serve porque o conteúdo é do cliente, não da casa. É a
 * regra 1 do ADR-0001 pelo lado que ela cobra: nome de conteúdo de cliente dentro de
 * `.tsx` compartilhado é o cliente vazando para a casca.
 *
 * Obrigatório, como `identidade` e `chat`: um default escondido faria o cliente que
 * esqueceu de nomear o próprio acervo passar despercebido até alguém abrir a tela.
 */
export const EsquemaAcervo = z.object({
  rotulo: z.string().min(1),
});

export const EsquemaCliente = z
  .object({
    /** Identificador do cliente. Vira nome de arquivo e valor de VITE_CLIENTE. */
    id: z
      .string()
      .regex(
        /^[a-z][a-z0-9-]*$/,
        "id de cliente aceita minúsculas, dígitos e -, começando por letra",
      ),
    identidade: EsquemaIdentidade,
    /**
     * Cidade que a casca usa nos exemplos que ela mesma escreve — hoje, a
     * pergunta de demonstração das novidades.
     *
     * Existe porque cidade cravada em `lib/` é conteúdo de um cliente dentro de
     * código compartilhado, que é a regra 1 do ADR-0001 — o mesmo motivo pelo
     * qual o changelog já era dado e não JSX.
     */
    cidadeExemplo: z.string().min(1),
    tema: EsquemaTema,
    mapa: EsquemaMapa,
    camadas: z.array(EsquemaCamada).min(1, "aplicação sem camada nenhuma não tem o que mostrar"),
    acervo: EsquemaAcervo,
    chat: EsquemaChat,
  })
  .superRefine((cliente, ctx) => {
    const vistos = new Set<string>();
    for (const camada of cliente.camadas) {
      if (vistos.has(camada.id)) {
        // Id repetido não dá erro no MapLibre: a segunda camada simplesmente
        // sobrescreve a primeira, e a que sumiu continua na legenda.
        ctx.addIssue({ code: "custom", message: `camada "${camada.id}" aparece mais de uma vez` });
      }
      vistos.add(camada.id);
    }
  });

export type ConfiguracaoAcervo = z.infer<typeof EsquemaAcervo>;
export type Atributo = z.infer<typeof EsquemaAtributo>;
export type RotuloNoMapa = z.infer<typeof EsquemaRotuloNoMapa>;
export type PinturaPorCategoria = z.infer<typeof EsquemaPinturaPorCategoria>;
export type DefinicaoCamada = z.infer<typeof EsquemaCamada>;
export type Identidade = z.infer<typeof EsquemaIdentidade>;
export type Simbolo = z.infer<typeof EsquemaSimbolo>;
export type ConfiguracaoIdentidade = z.infer<typeof EsquemaIdentidade>;
export type Neutros = z.infer<typeof EsquemaNeutros>;
export type ConfiguracaoTema = z.infer<typeof EsquemaTema>;
export type ConfiguracaoMapa = z.infer<typeof EsquemaMapa>;
export type ConfiguracaoChat = z.infer<typeof EsquemaChat>;
export type ConfiguracaoCliente = z.infer<typeof EsquemaCliente>;
