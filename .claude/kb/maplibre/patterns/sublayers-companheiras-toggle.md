<!-- Prosa em português; código, nomes de API e keywords técnicas em inglês. Convenção: .claude/kb/_index.yaml -->
# Sub-layers companheiras (contorno/rótulo) com toggle por prefixo de id

> **Propósito**: Enriquecer uma camada (contorno crisp + rótulos) sem quebrar o contrato de clique/visibilidade que opera por id.
> **Validado**: 2026-06-27

## Quando usar

- Uma camada precisa de mais de um tipo de render (`fill` + `line` + `symbol`), que no
  MapLibre são layers separadas.
- Você já tem lógica de clique/toggle baseada num id por camada e não quer reescrevê-la.

## Implementação

Cada dataset gera 1 layer **pickable** (id = `<name>`) e companheiras com sufixo de id
(`<name>__outline`, `<name>__label`). O clique consulta só os ids base; o toggle aplica
visibilidade a todas as layers cujo id começa com `<name>`.

```ts
const SUFFIXES = ["", "__outline", "__label"] as const;

// base pickable (polígono): fill com opacidade 0 = invisível, mas CLICÁVEL
const base = { id, type: "fill", source: id, "source-layer": id,
               paint: { "fill-color": color, "fill-opacity": fillOpacity } };
const outline = { id: `${id}__outline`, type: "line", source: id, "source-layer": id,
                  paint: { "line-color": outlineColor, "line-width": width } };
const label = { id: `${id}__label`, type: "symbol", source: id, "source-layer": id,
                minzoom, layout: { "text-field": ["get", labelField], "text-size": 11 },
                paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1.2 } };

// clique: só ids base
const interactiveIds = layers.map((l) => l.id);

// toggle: aplica a todas as sub-layers por prefixo
function applyVisibility(map, id, visible) {
  for (const s of SUFFIXES) {
    const lid = id + s;
    if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", visible ? "visible" : "none");
  }
}
```

## Configuração

| Decisão | Padrão recomendado | Descrição |
|---------|--------------------|-----------|
| Camada de referência (ex.: limite externo) | `fill-opacity: 0` + `line` | Visível só como contorno, mas clicável |
| Rótulos | `symbol` com `minzoom` | Evita poluição em zoom baixo; camadas densas ficam sem rótulo |
| Ordem | rótulos por último no style | Texto fica por cima dos preenchimentos |

## Detalhe que evita bug

Um `fill` com `fill-opacity: 0` continua retornando feições no `queryRenderedFeatures`
(a query considera visibilidade, não opacidade). É assim que uma camada "só contorno"
permanece clicável.

## Ver também

- [highlight-via-fonte-selecao](highlight-via-fonte-selecao.md)
