/**
 * Cliente do acervo. Espelho de `agent/src/geo_agent/schemas.py`, como `chat/api.ts`.
 *
 * Toda falha vira `ErroDoAcervo` com `indisponivel` marcado no 503. A distinção
 * importa na tela: indisponível pede "tente de novo" e não é culpa de quem clicou,
 * enquanto 422 é algo a corrigir no formulário. Sem separar, os dois virariam o mesmo
 * "algo deu errado", que não ajuda em nenhum dos casos.
 */
import type { Desenho, TipoDesenho } from "./geometria";

export type { Desenho };

export interface PaginaDeDesenhos {
  itens: Desenho[];
  total: number;
  pagina: number;
  tamanho: number;
}

export interface DesenhoNovo {
  tipo: TipoDesenho;
  nome: string;
  geometria: GeoJSON.Geometry;
  categoria?: string | null;
  cor?: string;
  observacao?: string | null;
}

export interface DesenhoEdicao {
  nome?: string;
  categoria?: string | null;
  cor?: string;
  observacao?: string | null;
}

export class ErroDoAcervo extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = "ErroDoAcervo";
  }

  /** 503: o acervo caiu, o resto do mapa não. Vale oferecer "tente de novo". */
  get indisponivel(): boolean {
    return this.status === 503;
  }
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(caminho, init);
  } catch {
    // Rede fora, agente parado antes de responder: para a tela é o mesmo caso do 503.
    throw new ErroDoAcervo("Não foi possível falar com o servidor.", 503);
  }
  if (!res.ok) {
    const detalhe = await res
      .json()
      .then((b: { detail?: string }) => b.detail)
      .catch(() => undefined);
    throw new ErroDoAcervo(detalhe ?? `Falha no acervo (HTTP ${res.status})`, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function listarDesenhos(
  opcoes: {
    pagina?: number;
    tamanho?: number;
    categoria?: string | null;
    q?: string | null;
  } = {},
): Promise<PaginaDeDesenhos> {
  const p = new URLSearchParams();
  if (opcoes.pagina) p.set("pagina", String(opcoes.pagina));
  if (opcoes.tamanho) p.set("tamanho", String(opcoes.tamanho));
  if (opcoes.categoria) p.set("categoria", opcoes.categoria);
  if (opcoes.q) p.set("q", opcoes.q);
  const query = p.toString();
  return pedir<PaginaDeDesenhos>(`/api/desenhos${query ? `?${query}` : ""}`);
}

/** Todos os desenhos, para o mapa. Não pagina — ver a rota `/geometrias`. */
export function buscarGeometrias(): Promise<GeoJSON.FeatureCollection> {
  return pedir<GeoJSON.FeatureCollection>("/api/desenhos/geometrias");
}

export function listarCategorias(): Promise<string[]> {
  return pedir<string[]>("/api/desenhos/categorias");
}

export function criarDesenho(novo: DesenhoNovo): Promise<Desenho> {
  return pedir<Desenho>("/api/desenhos", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(novo),
  });
}

export function editarDesenho(id: string, edicao: DesenhoEdicao): Promise<Desenho> {
  return pedir<Desenho>(`/api/desenhos/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(edicao),
  });
}

export function apagarDesenho(id: string): Promise<void> {
  return pedir<void>(`/api/desenhos/${id}`, { method: "DELETE" });
}
