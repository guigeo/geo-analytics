/**
 * Formatação dos números do Raio-X.
 *
 * Mora num arquivo só porque a comparação municipal aparece em quatro blocos, e a
 * régua de "acima/abaixo do município" tem de ser a mesma em todos — duas réguas
 * diferentes na mesma página seriam lidas como dois fatos diferentes.
 */
const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function inteiro(valor: number | null | undefined): string {
  return typeof valor === "number" ? INTEIRO.format(valor) : "—";
}

export function decimal(valor: number | null | undefined): string {
  return typeof valor === "number" ? DECIMAL.format(valor) : "—";
}

export function reais(valor: number | null | undefined): string {
  return typeof valor === "number" ? MOEDA.format(valor) : "—";
}

export function percentual(valor: number | null | undefined): string {
  return typeof valor === "number" ? `${DECIMAL.format(valor)}%` : "—";
}

export interface Comparacao {
  texto: string;
  sentido: "acima" | "abaixo" | "igual" | "indisponivel";
}

/**
 * Quanto o valor da área difere do município, em pontos percentuais de diferença.
 *
 * A faixa morta de 5% existe para a tela não afirmar diferença onde não há: uma renda
 * 1,4% acima da do município é ruído do rateio, e escrever "acima da média" para isso
 * seria dar significado a um decimal. Abaixo do limiar a leitura é "em linha com".
 */
export function compararComMunicipio(
  daArea: number | null | undefined,
  doMunicipio: number | null | undefined,
): Comparacao {
  if (typeof daArea !== "number" || typeof doMunicipio !== "number" || doMunicipio === 0) {
    return { texto: "sem referência municipal", sentido: "indisponivel" };
  }
  const razao = (daArea - doMunicipio) / Math.abs(doMunicipio);
  const pct = Math.abs(razao) * 100;
  if (pct < 5) return { texto: "em linha com o município", sentido: "igual" };
  const quantas = razao > 0 ? "acima" : "abaixo";
  // "2,3× a do município" lê melhor que "130% acima" quando a diferença é grande, e é
  // a forma que alguém repete em voz alta numa reunião.
  if (Math.abs(razao) >= 1) {
    return {
      texto: `${DECIMAL.format(daArea / doMunicipio)}× a do município`,
      sentido: quantas,
    };
  }
  return { texto: `${DECIMAL.format(pct)}% ${quantas} do município`, sentido: quantas };
}
