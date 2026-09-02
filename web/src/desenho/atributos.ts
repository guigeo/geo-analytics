/**
 * O que o painel de atributos mostra quando se clica num desenho.
 *
 * Mora aqui e não no `configuracao/` porque desenho é da CASCA: as camadas do IBGE têm
 * `atributos` declarados por cliente (cada um escolhe o que enxerga do dado universal),
 * mas o acervo tem as mesmas colunas para todo mundo — é a mesma tabela, no schema de
 * cada um. Declarar por cliente criaria um ponto de variação onde não há variação.
 *
 * Puro e fora do React, como o resto de `desenho/`: dá para conferir a formatação sem
 * montar componente.
 */
import { formatarMedida } from "@/map/medicao";
import type { TipoDesenho } from "./geometria";

export interface AtributoExibido {
  rotulo: string;
  valor: string;
}

const ROTULO_DO_TIPO: Record<TipoDesenho, string> = {
  ponto: "Ponto",
  poligono: "Área",
  buffer: "Raio",
};

const ROTULO_DA_ORIGEM: Record<string, string> = {
  desenho: "Desenhado no mapa",
  // O nome técnico é `carga`, e ele não serve para ninguém que não conheça o script.
  carga: "Carregado de arquivo",
};

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s === "" ? null : s;
}

function numero(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Data em pt-BR, sem hora: quando um desenho foi criado é do dia, não do minuto. */
function data(valor: unknown): string | null {
  const s = texto(valor);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR");
}

/**
 * Traduz as propriedades de uma feição do acervo para linhas legíveis.
 *
 * Campo vazio não vira linha com travessão: numa lista curta, meia dúzia de "—" empurra
 * para fora da tela o que de fato foi preenchido. O que não existe simplesmente não
 * aparece — ao contrário das camadas do IBGE, cujos atributos são fixos e onde a
 * ausência de um valor é ela mesma informação.
 */
export function descreverDesenho(props: Record<string, unknown>): AtributoExibido[] {
  const linhas: AtributoExibido[] = [];
  const juntar = (rotulo: string, valor: string | null) => {
    if (valor) linhas.push({ rotulo, valor });
  };

  const tipo = texto(props.tipo);
  juntar("Tipo", tipo ? (ROTULO_DO_TIPO[tipo as TipoDesenho] ?? tipo) : null);
  juntar("Categoria", texto(props.categoria));

  const area = numero(props.area_m2);
  // Ponto não tem área, e um "0 m²" ali seria lido como área medida e igual a zero.
  if (area !== null && area > 0) juntar("Área", formatarMedida("area", area));

  const raio = numero(props.raio_m);
  if (raio !== null && raio > 0) juntar("Raio", `${raio.toLocaleString("pt-BR")} m`);

  juntar("Observação", texto(props.observacao));
  juntar("Origem", ROTULO_DA_ORIGEM[String(props.origem)] ?? texto(props.origem));
  juntar("Criado em", data(props.criado_em));
  return linhas;
}
