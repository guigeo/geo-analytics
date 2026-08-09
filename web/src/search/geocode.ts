// Busca de endereço (rua/logradouro) via proxy do backend (/api/geocode ->
// Nominatim/OSM) — Brasil inteiro não cabe num índice estático local como o de
// municípios, e o Nominatim não manda CORS, então não dá pra chamar direto do
// navegador (ver agent/src/geo_agent/main.py).
import type { SearchHit } from "./index";

interface GeocodeHit {
  rotulo: string;
  detalhe: string;
  bbox: [number, number, number, number];
}

export async function geocodificar(
  query: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`geocoding indisponível (HTTP ${res.status})`);
  const hits = (await res.json()) as GeocodeHit[];
  return hits.map((h) => ({ tipo: "endereco" as const, ...h }));
}
