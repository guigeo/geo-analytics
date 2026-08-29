/**
 * O contrato de uma aplicação derivada.
 *
 * Esta é a fronteira que o passo 5 do ADR-0001 do `webgis` cria: o que difere
 * entre clientes é dado, não código. Tudo que uma aplicação precisa saber sobre
 * o cliente dela mora num arquivo de configuração validado por este esquema —
 * identidade, mapa, camadas e chat. Se atender um cliente novo exigir editar
 * `.tsx`, o modelo falhou.
 *
 * Adaptado de `frontend/src/config/schema.ts` do `webgis-core`, traduzido: a
 * decisão de 2026-08-29 é português em tudo, sem fronteira de idioma dentro do
 * código (ver `webgis/docs/HERANCA.md`, §7, pendência 2).
 *
 * A validação roda no boot e falha alto. Configuração errada que só aparece
 * quando alguém liga a camada é pior do que aplicação que não sobe.
 */
import { z } from "zod";

const Cor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "cor precisa ser hexadecimal de 6 dígitos, como #3a5a8c");

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

export const GEOMETRIAS = ["poligono", "linha", "ponto"] as const;
export const ANCORAS_ICONE = ["centro", "base"] as const;

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
    /** Camada dentro do vector tile (o `source-layer` do MapLibre). */
    camadaFonte: z.string().min(1),
    geometria: z.enum(GEOMETRIAS),
    /** Cor representativa: legenda e desenho base. */
    cor: Cor,
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
    visivelPorPadrao: z.boolean(),
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
    mapa: EsquemaMapa,
    camadas: z.array(EsquemaCamada).min(1, "aplicação sem camada nenhuma não tem o que mostrar"),
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

export type Atributo = z.infer<typeof EsquemaAtributo>;
export type RotuloNoMapa = z.infer<typeof EsquemaRotuloNoMapa>;
export type DefinicaoCamada = z.infer<typeof EsquemaCamada>;
export type Identidade = z.infer<typeof EsquemaIdentidade>;
export type ConfiguracaoMapa = z.infer<typeof EsquemaMapa>;
export type ConfiguracaoChat = z.infer<typeof EsquemaChat>;
export type ConfiguracaoCliente = z.infer<typeof EsquemaCliente>;
