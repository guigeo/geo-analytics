// Busca de municípios/UFs sobre o índice estático gerado pelo pipeline
// (`geo-pipeline search-index` → municipios.json, gitignored). O `?url` mantém o
// JSON (~356 KB) FORA do bundle JS: vira asset com hash, baixado só no 1º uso.
import indexUrl from "./municipios.json?url";

export type BBox = [number, number, number, number]; // oeste, sul, leste, norte

export interface SearchHit {
  tipo: "uf" | "municipio" | "endereco";
  rotulo: string;
  detalhe: string;
  bbox: BBox;
  cdMun?: string;
}

interface RawIndex {
  ufs: { sigla: string; nome: string; bbox: number[] }[];
  municipios: [string, string, string, number[]][];
}

interface Entry {
  hit: SearchHit;
  norm: string;
}

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

let cache: Promise<Entry[]> | null = null;

// UFs primeiro (27, match por nome ou sigla); municípios já vêm ordenados por
// população — a sugestão mais provável aparece primeiro.
export function loadIndex(): Promise<Entry[]> {
  cache ??= fetch(indexUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`índice de busca indisponível (HTTP ${r.status})`);
      return r.json() as Promise<RawIndex>;
    })
    .then((raw) => [
      ...raw.ufs.map((u) => ({
        hit: {
          tipo: "uf" as const,
          rotulo: u.nome,
          detalhe: `UF · ${u.sigla}`,
          bbox: u.bbox as BBox,
        },
        norm: `${normalize(u.nome)} ${u.sigla.toLowerCase()}`,
      })),
      ...raw.municipios.map(([cd, nome, uf, bbox]) => ({
        hit: {
          tipo: "municipio" as const,
          rotulo: nome,
          detalhe: uf,
          bbox: bbox as BBox,
          cdMun: cd,
        },
        norm: normalize(nome),
      })),
    ]);
  return cache;
}

export function buscar(entries: Entry[], query: string, limite = 8): SearchHit[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const prefixo: SearchHit[] = [];
  const contem: SearchHit[] = [];
  for (const e of entries) {
    if (e.norm.startsWith(q) || e.norm.split(" ").some((w) => w === q)) {
      prefixo.push(e.hit);
      if (prefixo.length >= limite) break;
    } else if (contem.length < limite && e.norm.includes(q)) {
      contem.push(e.hit);
    }
  }
  return [...prefixo, ...contem].slice(0, limite);
}
