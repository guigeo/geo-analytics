// De onde vêm os .pmtiles.
//
// Default: `/tiles` na própria origem — como a VPS serve hoje (Caddy sobre
// `/var/www/geo/tiles`). Este repositório não guarda mais tile nenhum.
//
// VITE_TILES_BASE_URL aponta esta aplicação para um HOST DE TILES COMPARTILHADO,
// fora dela: um único conjunto de tiles servido para todas as aplicações
// derivadas, em vez de uma cópia por app (ver `webgis/infra/tiles` e o ADR-0001
// do webgis). O host precisa devolver HTTP Range e, por ser outra origem, CORS.
//
//   VITE_TILES_BASE_URL=http://localhost:8081/tiles   # host local do webgis
const BASE = (import.meta.env.VITE_TILES_BASE_URL ?? "/tiles").replace(/\/+$/, "");

export function tileUrl(nome: string): string {
  return `pmtiles://${BASE}/${nome}.pmtiles`;
}
