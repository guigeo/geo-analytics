<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Protocolo PMTiles no MapLibre

> **Propósito**: Servir tiles vetoriais de um único arquivo `.pmtiles` estático, sem tile server.
> **Confiança**: 0.95
> **Validado**: 2026-06-27

## Visão geral

PMTiles é um formato de arquivo único que guarda um conjunto de tiles e é lido via
HTTP range requests. No MapLibre, registra-se um protocolo `pmtiles://` uma vez; a
partir daí qualquer source vetorial pode apontar para um `.pmtiles` servido como
arquivo estático (CDN, `nginx`, `vite`). Não há servidor de tiles em runtime.

## O padrão

```ts
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

let registered = false;
export function registerPMTiles(): void {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}

// No style: a source aponta para o arquivo via pmtiles://
const source = { type: "vector", url: "pmtiles:///tiles/layer.pmtiles" };
// e a layer referencia a source-layer (nome embutido no tile):
const layer = { id: "layer", type: "fill", source: "layer", "source-layer": "layer" };
```

## Referência rápida

| Entrada | Saída | Notas |
|---------|-------|-------|
| `pmtiles:///tiles/x.pmtiles` | TileJSON + tiles | Caminho absoluto na mesma origem |
| `source-layer` | nome da camada no tile | Definido na geração (ex.: tippecanoe `-l`) |

## Erros comuns

### Errado

```ts
// Esquecer addProtocol -> source pmtiles:// não resolve
const source = { type: "vector", url: "pmtiles:///tiles/x.pmtiles" };
```

### Certo

```ts
registerPMTiles();           // antes de criar o Map
const source = { type: "vector", url: "pmtiles:///tiles/x.pmtiles" };
```

## Relacionados

- [highlight-via-fonte-selecao](../patterns/highlight-via-fonte-selecao.md)
- pmtiles-tippecanoe/concepts/vector-tiles-por-zoom-e-range-requests.md
