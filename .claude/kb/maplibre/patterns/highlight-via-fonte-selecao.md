<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Realce da feição clicada via fonte GeoJSON de seleção

> **Propósito**: Destacar no mapa a feição que o usuário clicou, sem alterar/regenerar os tiles vetoriais.
> **Validado**: 2026-06-27

## Quando usar

- Você precisa de highlight ao clicar, mas os tiles não têm um id único por feição.
- Regenerar tiles para adicionar `promoteId` é caro (camadas grandes) ou indesejado.
- Quer um realce uniforme para polígonos e pontos.

## Implementação

A ideia: `queryRenderedFeatures` já devolve a `geometry` da feição clicada. Basta
jogá-la numa fonte GeoJSON dedicada e estilizar por cima.

```ts
// 1) Fonte + layers de realce no style (source inicia vazio)
const SELECTION = "selection";
const EMPTY = { type: "FeatureCollection", features: [] } as const;

const selectionSource = { type: "geojson", data: EMPTY };
const selectionLayers = [
  { id: "sel-fill", type: "fill", source: SELECTION,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": "#00b3ff", "fill-opacity": 0.15 } },
  { id: "sel-line", type: "line", source: SELECTION,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "line-color": "#00b3ff", "line-width": 3 } },
  { id: "sel-point", type: "circle", source: SELECTION,
    filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 8, "circle-stroke-color": "#00b3ff",
             "circle-stroke-width": 3, "circle-color": "rgba(0,179,255,0.25)" } },
];

// 2) No clique: alimenta (ou limpa) a fonte de seleção
map.on("click", (e) => {
  const hits = map.queryRenderedFeatures(e.point, { layers: interactiveIds });
  const src = map.getSource(SELECTION); // GeoJSONSource
  if (hits.length) {
    src.setData({ type: "Feature", geometry: hits[0].geometry, properties: {} });
  } else {
    src.setData(EMPTY);
  }
});
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| Cor de realce | contrastante com a paleta | Ex.: ciano sobre paleta quente/fria |
| Layers de seleção | fill + line + circle | line/fill p/ polígono, circle p/ ponto |
| Ordem no style | acima das camadas de dados | Realce fica visível por cima |

## Limitação conhecida

`queryRenderedFeatures` pode devolver a geometria **cortada na borda do tile**, então
o realce de um polígono grande pode ficar levemente recortado. Se isso incomodar,
migre para `feature-state` + `promoteId` (exige id único por feição e regenerar tiles).

## Ver também

- [sublayers-companheiras-toggle](sublayers-companheiras-toggle.md)
- [protocolo-pmtiles](../concepts/protocolo-pmtiles.md)
