<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Realce por filtro de código nas próprias fontes vetoriais

> **Propósito**: Destacar feições POR ID/CÓDIGO vindo de fora do mapa (backend, busca, agente) — inclusive feições fora do viewport atual — sem GeoJSON e sem regenerar tiles.
> **Validado**: 2026-07-08

## Quando usar

- Os ids a destacar vêm de fora da interação com o mapa: resposta de backend, resultado
  de busca, seleção em lista/tabela.
- **O pattern [highlight-via-fonte-selecao](highlight-via-fonte-selecao.md) NÃO serve aqui**:
  ele depende de `queryRenderedFeatures`, que só enxerga feições **renderizadas no viewport
  atual** — impossível obter a geometria de algo que está fora da tela.
- Pré-requisito: a propriedade de código existe nos tiles (declarar no ETL/tippecanoe).

## Implementação

Camadas de realce sobre as **mesmas fontes vetoriais** das camadas de dados, com filtro
que começa vazio; destacar = trocar o filtro. Os tiles trazem o realce junto conforme
carregam — funciona para qualquer código, em qualquer lugar do mapa.

```ts
const CODE_FIELDS = { layer_a: "CODE_A", layer_b: "CODE_B" } as const;

function codeFilter(field: string, codes: string[]): FilterSpecification {
  return ["in", ["get", field], ["literal", codes]] as FilterSpecification;
}

// 1) No style: um par fill/line de realce por camada-alvo (filtro vazio = nada)
export function highlightLayers(): LayerSpecification[] {
  return Object.entries(CODE_FIELDS).flatMap(([id, field]) => [
    { id: `${id}__highlight-fill`, type: "fill", source: id, "source-layer": id,
      filter: codeFilter(field, []), paint: { "fill-color": "#00b3ff", "fill-opacity": 0.25 } },
    { id: `${id}__highlight-line`, type: "line", source: id, "source-layer": id,
      filter: codeFilter(field, []), paint: { "line-color": "#00b3ff", "line-width": 2.5 } },
  ]);
}

// 2) Para destacar: setFilter com a lista de códigos (uma camada-alvo por vez)
export function applyHighlights(map: Map, target: { layer: string; codes: string[] } | null) {
  for (const [layer, field] of Object.entries(CODE_FIELDS)) {
    const codes = target?.layer === layer ? target.codes : [];
    for (const kind of ["fill", "line"] as const) {
      const id = `${layer}__highlight-${kind}`;
      if (map.getLayer(id)) map.setFilter(id, codeFilter(field, codes));
    }
  }
}
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| Visibilidade do realce | sempre `visible`, independente do toggle da camada base | Destaque funciona mesmo com a camada de dados desligada |
| Ordem no style | acima das camadas de dados, abaixo do realce de clique | Clique continua "ganhando" visualmente |
| Após `setStyle` (troca de tema) | reaplicar o filtro atual (guardar em ref) | `setStyle` recria as camadas com filtro vazio |
| Tipo do código | comparar como STRING | Zeros à esquerda morrem em cast numérico |

## Limitação conhecida

O realce só é **visto** quando a região entra no viewport (os tiles carregam com ele
aplicado). Se a UX exigir mostrar já, combine com `fitBounds` — decisão de produto, não
deste pattern.

## Ver também

- [highlight-via-fonte-selecao](highlight-via-fonte-selecao.md) — o par deste pattern p/ realce de CLIQUE (e por que ele não cobre este caso)
- [geoparquet-para-pmtiles](../../pmtiles-tippecanoe/patterns/geoparquet-para-pmtiles.md) — onde declarar as propriedades que entram nos tiles
