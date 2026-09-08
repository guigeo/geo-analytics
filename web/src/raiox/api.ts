/**
 * Cliente do Raio-X. Espelho de `agent/src/geo_agent/schemas.py`, como `desenho/api.ts`.
 *
 * O contrato é a razão de a feature existir: tela, mapa e chat leem o MESMO objeto, e
 * é isso que impede o número da conversa de divergir do número da página. Nenhum campo
 * daqui é calculado no navegador — nem os arredondamentos, nem a síntese.
 */
import { sessaoCaiu } from "@/auth/api";

/** Campos que todo bloco carrega. A ressalva viaja com o número (regra 8 do ADR-0001). */
export interface ComProveniencia {
  fonte: string;
  periodo: string;
  metodo: string;
  cobertura: string;
  avisos: string[];
}

export interface ReferenciaMunicipal {
  cd_mun: string;
  nm_mun: string;
  nm_uf: string;
  pop_total: number | null;
  domicilios_ocupados: number | null;
  densidade_hab_km2: number | null;
  renda_media: number | null;
  media_moradores: number | null;
  pop_masculino: number | null;
  pop_feminino: number | null;
  pct_classe_a: number | null;
  pct_classe_b: number | null;
  pct_classe_c: number | null;
  pct_classe_de: number | null;
}

export interface SetorDoRaioX {
  cod_setor: string;
  fracao: number;
  valor: number | null;
  pop_total: number | null;
}

export interface FaixaDoRaioX {
  faixa: number;
  inferior: number | null;
  superior: number | null;
  populacao: number | null;
}

export interface BlocoEscala extends ComProveniencia {
  area_km2: number;
  setores: number;
  populacao: number | null;
  populacao_contida: number | null;
  populacao_rateada: number | null;
  setores_parciais: number;
  domicilios_ocupados: number | null;
  densidade_hab_km2: number | null;
  municipio: ReferenciaMunicipal;
}

export interface BlocoContraste extends ComProveniencia {
  metrica: string;
  rotulo: string;
  minimo: number | null;
  maximo: number | null;
  faixas: FaixaDoRaioX[];
  setores: SetorDoRaioX[];
  truncada: boolean;
  aviso: string | null;
}

export interface BlocoPerfil extends ComProveniencia {
  renda_media: number | null;
  media_moradores: number | null;
  pop_masculino: number | null;
  pop_feminino: number | null;
  municipio: ReferenciaMunicipal;
}

export interface BlocoClasseSocial extends ComProveniencia {
  pct_a: number | null;
  pct_b: number | null;
  pct_c: number | null;
  pct_de: number | null;
  municipio: ReferenciaMunicipal;
  situacao: string | null;
}

export interface Qualidade extends ComProveniencia {
  fracao_menor: number | null;
  setores_parciais: number;
  populacao_rateada: number | null;
}

export interface ZonaNaArea {
  cod_zona: string;
  nome_zona: string;
  e_zona: boolean | null;
  lei: string | null;
  cod_municipio: string;
  percentual: number | null;
}

export interface BlocoRegulacao extends ComProveniencia {
  disponivel: boolean;
  zonas: ZonaNaArea[];
  aviso: string | null;
}

export interface RaioX {
  versao_calculo: string;
  gerado_em: string;
  sintese: string;
  escala: BlocoEscala;
  contraste: BlocoContraste;
  perfil: BlocoPerfil;
  classe_social: BlocoClasseSocial;
  qualidade: Qualidade;
  regulacao: BlocoRegulacao;
}

/**
 * As três falhas se separam porque pedem coisas diferentes de quem está na tela.
 *
 * 503 é "tente de novo" e não é culpa de quem clicou; 422 é um limite do produto que a
 * pessoa pode contornar desenhando menor; 404 é desenho que sumiu. Fundir os três num
 * "algo deu errado" tiraria a única informação útil de cada um.
 */
export class ErroDoRaioX extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = "ErroDoRaioX";
  }

  get indisponivel(): boolean {
    return this.status === 503;
  }

  /** 422: o desenho não serve — ponto, ou área acima do teto. A mensagem diz qual. */
  get recusado(): boolean {
    return this.status === 422;
  }

  get sumiu(): boolean {
    return this.status === 404;
  }
}

export async function buscarRaioX(desenhoId: string, sinal?: AbortSignal): Promise<RaioX> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api/raio-x/${encodeURIComponent(desenhoId)}`, { signal: sinal });
  } catch {
    // Rede fora ou agente parado antes de responder: para a tela é o mesmo caso do 503,
    // como em `desenho/api.ts`.
    throw new ErroDoRaioX("Não foi possível falar com o servidor.", 503);
  }
  if (resposta.status === 401) {
    sessaoCaiu();
    throw new ErroDoRaioX("A sessão expirou.", 401);
  }
  if (!resposta.ok) {
    // O `detail` do FastAPI é escrito para ser lido por quem está na tela — a rota
    // monta a frase com o limite e a área pedida. Descartá-lo por um texto genérico
    // seria jogar fora a única parte acionável da resposta.
    const corpo = await resposta.json().catch(() => null);
    const detalhe =
      corpo && typeof corpo.detail === "string" ? corpo.detail : "Não foi possível gerar o Raio-X.";
    throw new ErroDoRaioX(detalhe, resposta.status);
  }
  return (await resposta.json()) as RaioX;
}
