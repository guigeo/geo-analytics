# DESIGN: Seletor de variável na tela H3

> Uma camada, vários temas: a pintura da `h3_domicilios` passa a ser escolhida, e a
> troca é uma expressão de cor trocada na camada que já está no mapa.

## Metadados

| Atributo | Valor |
|---|---|
| **Feature** | `SELETOR_H3` |
| **Data** | 2026-09-13 |
| **Autor** | Claude Code, a partir de `DEFINE_SELETOR_H3.md` |
| **Status** | ✅ Arquivada em 2026-09-13 — construída e **não publicada** (ver `SHIPPED_2026-09-13.md`) |
| **Entrada** | `.claude/sdd/features/DEFINE_SELETOR_H3.md` |

---

## Visão da arquitetura

```text
configuracao/catalogo.ts                     ← os temas se declaram aqui (dado, não código)
  h3_domicilios.temasNumericos = [
      { id: "apartamento", campo: "DOM_APARTAMENTO", max: 820,   cor: azul     },
      { id: "casa",        campo: "DOM_CASA",        max: 925,   cor: esmeralda},
      { id: "particulares",campo: "DOMICILIOS_...",  max: 1223,  cor: violeta  } ]
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
  App.tsx                   map/layers.ts
  temaAtivo: {id → tema}    expressaoDeCorNumerica(tema) ──► usada na CRIAÇÃO do style
        │                                                     (tema padrão = o 1º)
        ├──────────────► LayerPanel
        │                  SeletorDeTema (Popover)  → onEscolherTema(camada, tema)
        │                  LegendaNumerica(tema ativo)
        │
        └──────────────► MapView
                           useEffect([temaAtivo]) → map.setPaintProperty(
                               "h3_domicilios", "fill-color", expressaoDeCorNumerica(tema))
```

O dado não se move: a fonte vetorial e a camada do style continuam as mesmas, e a troca
altera **uma propriedade de pintura**. É daí que sai o AT-002 de graça — sem recarga de
fonte não há `fitBounds` nem pisca, e o mapa fica onde estava.

---

## Componentes

| Componente | Onde | Papel |
|---|---|---|
| `temasNumericos` | `configuracao/esquema.ts` + `catalogo.ts` | A lista de temas da camada: id, rótulo, campo, limites e cores |
| `expressaoDeCorNumerica(tema)` | `map/layers.ts` | Traduz um tema na expressão `interpolate` do MapLibre. Já existe dentro de `corDoPreenchimento`; vira função exportada |
| `temaAtivo` | `App.tsx` | `Record<idDaCamada, idDoTema>`, irmão de `visible`. Nasce com o primeiro tema de cada camada |
| `SeletorDeTema` | `panels/LayerPanel.tsx` | Popover com a lista, cada item com a miniatura da rampa. Aparece na linha da camada que tem mais de um tema |
| `aplicarTema(map, temaAtivo)` | `map/MapView.tsx` | Espelho de `applyVisibility`: percorre as camadas com tema e chama `setPaintProperty` |

---

## Decisões

### 1. `pinturaPorNumero` vira `temasNumericos` (lista), e não ganha um irmão

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-13 |

**Contexto:** a camada declara hoje **uma** pintura numérica. O seletor precisa de N.

**Escolha:** substituir o campo pela lista. Camada de um tema só declara lista de um.

**Por quê:** manter os dois campos criaria duas formas de dizer a mesma coisa, e a
pergunta "qual vence quando os dois existem?" teria de ser respondida no esquema, no
mapa e na legenda. Hoje só a `h3_domicilios` usa o campo — a migração custa um arquivo.

**Rejeitado:** (a) `pinturaPorNumero` + `temasExtras`, pela duplicação; (b) aceitar
objeto **ou** array no mesmo campo, porque empurra o `if` para dentro de cada leitor.

**Consequência:** `EsquemaCamada` passa a validar lista não vazia e ids únicos; quem lia
`c.pinturaPorNumero` passa a ler o tema ativo, o que é uma mudança de assinatura em
`layers.ts` e `LayerPanel.tsx`.

---

### 2. O tema ativo é estado do App, como `visible`

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-13 |

**Contexto:** painel e mapa precisam concordar sobre qual tema está pintando.

**Escolha:** `temaAtivo: Record<string, string>` no `App`, passado aos dois — exatamente
o caminho que `visible` já faz, inclusive nas duas montagens (desktop e mobile).

**Por quê:** é o padrão que o projeto já tem para "estado de camada"; guardar no painel
faria o mapa perguntar ao painel, e guardar no mapa faria a legenda perguntar ao mapa.

**Rejeitado:** contexto React (peso desnecessário para um registro); estado interno do
`LayerPanel` (o `MapView` não o alcança).

**Consequência:** a escolha sobrevive a recolher o painel (AT-005) porque o estado não
vive nele. E some ao recarregar a página, que é a regra da casa desde 2026-09-02.

---

### 3. Popover com lista, e não `<select>` nem dependência nova

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-13 |

**Contexto:** o projeto **não tem** `select.tsx` do shadcn/ui instalado; tem `popover.tsx`
e `button.tsx`.

**Escolha:** montar a lista com o Popover que já existe.

**Por quê:** não acrescenta `@radix-ui/react-select` ao bundle por causa de três opções,
e dá o que a etapa 2 vai pedir: agrupar por bloco e mostrar a miniatura da rampa ao lado
de cada nome — coisas que o `<select>` nativo não desenha.

**Rejeitado:** (a) `<select>` nativo, que não aceita a amostra de cor e destoa do tema;
(b) instalar o Select do shadcn, que é dependência nova para o mesmo resultado.

**Consequência:** teclado e foco ficam por nossa conta no conteúdo do Popover — os itens
são `<button>` numa lista, e o Popover do Radix já devolve o foco ao gatilho.

---

### 4. O seletor aparece mesmo com a camada desligada

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-13 |

**Contexto:** AT-004 pede que escolher com a camada desligada guarde a escolha.

**Escolha:** o seletor é parte da linha da camada (aparece sempre que houver mais de um
tema); a legenda continua só quando ligada.

**Por quê:** o seletor responde "o que esta camada mostra", que é justamente o que se
quer saber **antes** de ligar. A legenda responde "o que estas cores querem dizer", que
só existe com a camada acesa.

**Consequência:** a linha do H3 fica mais alta que as outras, ligada ou não.

---

## Manifesto de arquivos

| # | Arquivo | Ação | Para quê | Depende de |
|---|---|---|---|---|
| 1 | `web/src/configuracao/esquema.ts` | Editar | `EsquemaTemaNumerico` (com `id` e `rotulo`); `temasNumericos` no lugar de `pinturaPorNumero`; validação de lista não vazia e ids únicos | — |
| 2 | `web/src/configuracao/catalogo.ts` | Editar | Os três temas do H3, com os limites medidos e as três cores | 1 |
| 3 | `web/src/map/layers.ts` | Editar | Exportar `expressaoDeCorNumerica(tema)`; a camada nasce com o tema padrão | 1 |
| 4 | `web/src/map/MapView.tsx` | Editar | Prop `temaAtivo` e o efeito que chama `setPaintProperty` via `assimQuePuder` | 3 |
| 5 | `web/src/App.tsx` | Editar | Estado `temaAtivo`, valor inicial e repasse ao painel e ao mapa (as duas montagens) | 1 |
| 6 | `web/src/panels/LayerPanel.tsx` | Editar | `SeletorDeTema` na linha da camada; `LegendaNumerica` passa a receber o tema ativo | 1, 5 |
| 7 | `web/src/configuracao/esquema.test.ts` | Editar | Testes da validação nova | 1 |
| 8 | `web/src/map/layers.test.ts` | Editar | Expressão por tema; **uma** camada `h3_domicilios` (AT-007); snapshot | 3 |
| 9 | `web/src/map/MapView.test.tsx` | Editar | Trocar tema chama `setPaintProperty` e **não** chama `fitBounds`/`addSource` (AT-002) | 4 |
| 10 | `web/src/panels/LayerPanel.test.tsx` | Editar | Seletor visível com camada desligada (AT-004), legenda acompanha a escolha (AT-001), estado inicial (AT-003) | 6 |

Nenhum arquivo novo: a feature cabe nos que existem.

---

## Padrões de código

### O tema no catálogo

```ts
// catalogo.ts — os limites são medição de 2026-09-13 no geodata, com a mesma união
// que o tile usa (malha do Censo ∪ células CNEFE). p99 corta a cauda sem esconder dado.
temasNumericos: [
  {
    id: "apartamento",
    rotulo: "Domicílios em apartamento",
    campo: "DOM_APARTAMENTO",
    minimo: 0,
    maximo: 820,
    corInicial: "#eff6ff",
    corFinal: "#1d4ed8",
  },
  {
    id: "casa",
    rotulo: "Domicílios em casa",
    campo: "DOM_CASA",
    minimo: 0,
    maximo: 925,
    corInicial: "#ecfdf5",
    corFinal: "#047857",
  },
  {
    id: "particulares",
    rotulo: "Domicílios particulares",
    campo: "DOMICILIOS_PARTICULARES",
    minimo: 0,
    maximo: 1223,
    corInicial: "#f5f3ff",
    corFinal: "#6d28d9",
  },
],
```

### A expressão, num lugar só

```ts
// layers.ts — a MESMA função serve à criação do style e à troca em runtime. Se cada
// um montasse a sua, o mapa criado e o mapa repintado poderiam divergir sem erro.
export function expressaoDeCorNumerica(
  tema: TemaNumerico,
): DataDrivenPropertyValueSpecification<string> {
  return [
    "interpolate",
    ["linear"],
    ["to-number", ["get", tema.campo], tema.minimo],
    tema.minimo,
    tema.corInicial,
    tema.maximo,
    tema.corFinal,
  ] as unknown as DataDrivenPropertyValueSpecification<string>;
}
```

### A troca, no MapView

```tsx
// Espelho de applyVisibility: o style pode ainda não estar pronto, e `assimQuePuder`
// é o caminho que o arquivo já usa para esperar sem travar.
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;
  assimQuePuder(map, () => {
    for (const c of camadas) {
      if (!c.temasNumericos || !map.getLayer(c.id)) continue;
      const tema = temaDaCamada(c, temaAtivo[c.id]);
      map.setPaintProperty(c.id, "fill-color", expressaoDeCorNumerica(tema));
    }
  });
}, [temaAtivo]);
```

### A escolha do tema, com fallback explícito

```ts
/** O tema ativo, ou o primeiro — id gravado que não existe mais não apaga a camada. */
export function temaDaCamada(c: DefinicaoCamada, id: string | undefined): TemaNumerico {
  const temas = c.temasNumericos ?? [];
  return temas.find((t) => t.id === id) ?? temas[0];
}
```

---

## Fluxo de dados

```text
clique no item da lista
  └─► LayerPanel.onEscolherTema(idDaCamada, idDoTema)
        └─► App.setTemaAtivo(prev => ({ ...prev, [idDaCamada]: idDoTema }))
              ├─► LayerPanel repinta a legenda (tema ativo)
              └─► MapView useEffect([temaAtivo])
                    └─► setPaintProperty("h3_domicilios", "fill-color", expressão)
                          └─► MapLibre repinta as 68.454 células com o dado que já tem
```

Nada atravessa a rede. O tile já está no navegador desde que a camada foi ligada.

---

## Estratégia de testes

| Tipo | O que cobre | Onde |
|---|---|---|
| Unidade | `expressaoDeCorNumerica` e `temaDaCamada` (inclusive id inexistente) | `layers.test.ts` |
| Unidade | Esquema: lista vazia recusada, ids duplicados recusados, tema só em polígono | `esquema.test.ts` |
| Componente | Seletor aparece com a camada desligada; escolher avisa qual tema; legenda mostra o tema ativo; nasce em apartamento | `LayerPanel.test.tsx` |
| Componente | Trocar tema chama `setPaintProperty` com a expressão do tema, e **não** chama `addSource`, `setStyle` nem `fitBounds` | `MapView.test.tsx` |
| Congelamento | Uma camada `h3_domicilios` no style, e o snapshot da saída | `layers.test.ts` |
| Manual | A-001 (fluidez da repintura em zoom baixo) e A-004 (as três matizes se distinguem), nos dois temas | `/build` |

---

## Riscos e o que fazer

| Risco | Sinal | Saída |
|---|---|---|
| A-001: repintura pesada em zoom baixo | Travada visível ao trocar com o Brasil inteiro na tela | Pré-declarar as três camadas e alternar `visibility` (caminho B do brainstorm) — muda o manifesto, não o produto |
| Ids de tema gravados em estado velho | Camada sem pintura | `temaDaCamada` cai no primeiro tema; há teste |
| Confusão entre tema e camada | Pessoa acha que ligou outra coisa | A legenda sempre nomeia a variável ativa; o nome da camada no painel passa a ser o da malha, não o da variável |

---

## Histórico

| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 1.0 | 2026-09-13 | Claude Code | Primeira versão, a partir do DEFINE |

---

## Próximo passo

`/build .claude/sdd/features/DESIGN_SELETOR_H3.md`
