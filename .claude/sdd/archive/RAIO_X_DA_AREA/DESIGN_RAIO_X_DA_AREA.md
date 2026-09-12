# DESIGN: RAIO_X_DA_AREA

> Um contrato de diagnóstico que nasce determinístico no `query/`, atravessa o agente sem
> tocar em LLM, e chega à tela, ao mapa e ao chat como uma fonte só

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | RAIO_X_DA_AREA |
| **Data** | 2026-09-07 |
| **Autor** | design (sessão Claude Code) |
| **Status** | Pronto para `/build` |
| **Origem** | [DEFINE_RAIO_X_DA_AREA.md](DEFINE_RAIO_X_DA_AREA.md) · [BRAINSTORM_RAIO_X_DA_AREA.md](BRAINSTORM_RAIO_X_DA_AREA.md) |
| **ADR** | Emenda de 2026-09-07 ao ADR-0001 (`webgis`, `798b321`) |
| **Bastão** | Fases 1 e 2 (query + rota) pelo Codex; a tela em bastão seguinte |

---

## Visão da arquitetura

```text
  navegador                    agent/ (FastAPI)                 query/            geodata
 ┌──────────┐   GET           ┌────────────────────┐          ┌─────────┐       ┌──────────┐
 │  tela    │ ─ /api/raio-x/ ─▶ rotas_raio_x.py    │          │GeoQuery │       │ ibge.*   │
 │  Raio-X  │   {desenho_id}  │  · lê geometria ───┼─ WKB ───▶│raio_x_  │──SQL─▶│ regulacao│
 │          │ ◀── contrato ── │    no app_clientes │          │por_geo. │       │  (só lê) │
 └────┬─────┘                 │  · sem LLM         │          └─────────┘       └──────────┘
      │                       └─────────┬──────────┘
      │ mesmo payload                   │ mesmo payload
      ▼                                 ▼
 ┌──────────┐                  ┌────────────────────┐
 │  mapa    │                  │ tools.obter_raio_x │──▶ chat explica, não recalcula
 │ (match   │                  └────────────────────┘
 │  por     │
 │ CD_SETOR)│
 └──────────┘
```

Uma consulta, um payload, três superfícies. O que a tela mostra, o mapa pinta e o chat
cita é literalmente o mesmo objeto — é assim que a regra 8 do ADR-0001 se cumpre sem
depender de disciplina de quem escreve prompt.

---

## Componentes

| Componente | Onde | Papel |
|---|---|---|
| `raio_x_por_geometria` | `query/src/geo_query/queries.py` | Monta o diagnóstico: agregado, distribuição por setor, referência municipal, zoneamento e proveniência |
| `zoneamento_por_geometria` | `query/src/geo_query/queries.py` | Interseção do polígono com `regulacao.zoneamento`, com fração por zona |
| `rotas_raio_x.py` | `agent/src/geo_agent/` | `GET /api/raio-x/{desenho_id}`, sem LLM, no molde do `rotas_desenhos.py` |
| `RaioX` e filhos | `agent/src/geo_agent/schemas.py` | Contrato Pydantic — é ele que congela o formato para a tela e para o Codex |
| `wkb_por_id` | `agent/src/geo_agent/acervo.py` | A geometria por id, em WKB — hoje só existe por nome |
| `obter_raio_x` | `agent/src/geo_agent/tools.py` | A tool do contexto de Raio-X; não aceita escolha de métrica |
| `raiox/` | `web/src/` | Rota, blocos, síntese em template e folha de impressão |
| pintura por valor | `web/src/map/` | `match` por `CD_SETOR` sobre a fonte PMTiles de setor, no molde do `highlight.ts` |

---

## Decisões

### Decisão 1: método novo ao lado do `cruzamento_por_geometria`, não dentro dele

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-07 |

**Contexto:** o `cruzamento_por_geometria` já faz metade do trabalho, e a tentação é
acrescentar um parâmetro `detalhar=True` que devolva também as linhas por setor.

**Escolha:** `raio_x_por_geometria` é método próprio. O `cruzamento_por_geometria` fica
como está, byte por byte.

**Justificativa:** os dois têm consumidores diferentes com contratos diferentes. O
cruzamento serve o chat livre, onde o LLM escolhe métricas e a resposta é uma linha; o
Raio-X serve uma tela, com conjunto fixo de métricas e forma congelada. Fundir os dois
faria o chat livre carregar o custo da distribuição por setor que ele não usa, e faria
qualquer mudança no formato da tela mexer numa função que hoje tem 17 casos de teste
passando e um benchmark de agente em cima.

**Alternativas rejeitadas:**

1. Parâmetro opcional no método existente — acopla dois contratos com ciclos de mudança
   diferentes, e o teste de um passa a poder quebrar por causa do outro.
2. O Raio-X chamar o cruzamento e completar com uma segunda consulta — dois
   *round-trips* e, pior, dois retratos: a segunda consulta poderia ler estado diferente.

**Consequências:** duplicação da CTE `frac`, que é o coração do rateio. Aceita
conscientemente, e o `/build` deve **extrair a CTE para uma constante compartilhada** —
duplicar SQL é barato, duplicar a *regra* do rateio é que não pode.

---

### Decisão 2: a distribuição por setor vem da mesma varredura, não de uma segunda

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-07 |

**Contexto:** o bloco de contraste interno precisa das linhas por setor. A CTE `frac` já
as calcula e o `res` as colapsa em `sum()`.

**Escolha:** uma consulta só, com duas saídas — o agregado (como hoje) e a lista por
setor, num `json_agg` sobre a mesma CTE, ordenada pela métrica principal e **limitada**.

**Justificativa:** é literalmente o dado que já está na memória do Postgres no momento
do `sum()`. Fazer segunda consulta pagaria o `ST_Intersects` duas vezes — que é o custo
real: 1,32 s para os 27.719 setores do município de São Paulo.

**Consequências:** a consulta fica maior e o payload cresce com o número de setores. Daí
a Decisão 3.

---

### Decisão 3: dois tetos, e eles degradam o conteúdo em vez de recusar a área

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-07 |

**Contexto:** um desenho pode ser um quarteirão ou o município de São Paulo. O DEFINE
exige que o município não derrube a rota nem despeje 27.719 setores no navegador.

**Escolha:** dois limites, com comportamentos diferentes:

| Limite | Valor | O que acontece ao ultrapassar |
|---|---|---|
| **Lista por setor** | 500 setores | O agregado e as faixas continuam; a lista vem vazia com `truncada: true` e o motivo. O bloco de contraste passa a mostrar faixas sem lista clicável |
| **Área** | 2.000 km² | Recusa com 422 e mensagem que diz o limite e a área pedida |

**Justificativa:** os dois números têm origem. 2.000 km² deixa passar o município de São
Paulo (1.521 km²), que é o maior desenho plausível e está medido em 1,32 s — recusar
abaixo disso quebraria um caso real. E 500 setores é uma ordem de grandeza acima do
recorte típico (40 setores num buffer de 500 m), então o teto só aparece em desenho
excepcional.

**A assimetria é de propósito:** área grande demais é pedido que não faz sentido
responder; lista grande demais é só uma parte do conteúdo que não cabe. Recusar o
diagnóstico inteiro porque a lista não coube seria jogar fora o que funciona.

**Alternativas rejeitadas:**

1. Teto único por área — não protege o navegador: uma área média em região densa pode
   ter mais setores que uma área grande no interior.
2. Paginar a lista — complexidade de estado numa tela que se lê de cima a baixo.

**Consequências:** dois números arbitrários no código. Ficam em constantes nomeadas, com
o motivo no comentário, e o A-001 pode obrigar a baixá-los depois da medição na VPS.

---

### Decisão 4: o mapa pinta por `match` sobre a fonte PMTiles, e nenhuma geometria viaja

| Atributo | Valor |
|---|---|
| **Status** | Aceita — **resolve a premissa A-002 do DEFINE** |
| **Data** | 2026-09-07 |

**Contexto:** o DEFINE registrou como maior incógnita se a pintura por valor da
`TELA_H3` serviria aqui. Ela serve **em parte**: a expressão `interpolate` de
`layers.ts:41` é reaproveitável, mas está amarrada a `["get", campo]` sobre uma fonte
vector cujo tile já traz o valor embutido. Os valores do Raio-X vêm da consulta.

**Escolha:** não construir fonte GeoJSON. Pintar a **fonte PMTiles de setor que já
existe**, com uma expressão `match` de `CD_SETOR` para cor, montada no cliente a partir
do payload — exatamente o que o `highlight.ts` já faz com `setFilter`, movido de filtro
para `fill-color`.

**Justificativa:** o `highlight.ts` documenta a propriedade que decide isso — pintar por
código na própria fonte PMTiles "funciona para códigos fora do viewport atual". Além
disso, geometria de setor não precisa trafegar: o payload leva `cod_setor` e valor, uns
poucos KB para 40 setores, contra centenas de KB de polígonos reais. E o teto de 500 da
Decisão 3 mantém o `match` num tamanho trivial.

**Alternativas rejeitadas:**

1. Fonte GeoJSON com a geometria dos setores no payload — infla o contrato, duplica no
   navegador uma geometria que já está no tile, e obrigaria o `query/` a devolver `geom`.
2. `feature-state` — exige `queryRenderedFeatures` e volta a depender do viewport, que é
   precisamente o defeito que o `highlight.ts` existe para não ter.

**Consequências:** a escala de cor é calculada no cliente a partir dos valores do
payload, e não de um mínimo/máximo fixo como no catálogo. A legenda tem de dizer os
extremos **daquele desenho** — o que é mais honesto que uma escala global, mas significa
que a cor não é comparável entre dois Raio-X diferentes, e a legenda precisa deixar isso
claro.

**Efeito no plano:** a Fase 3 **não cresce**. A premissa A-002 pode ser marcada como
validada por leitura de código.

---

### Decisão 5: a rota entrega o retrato inteiro, e o chat só sabe pedi-lo

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-07 |

**Contexto:** o AT-010 exige que o número citado no chat seja o mesmo da tela.

**Escolha:** `obter_raio_x(desenho_id)` é a única tool do contexto de Raio-X, e **não
aceita parâmetro de métrica**. Ela chama a mesma função que a rota chama.

**Justificativa:** a divergência não viria de má-fé do modelo; viria de ele escolher
outro conjunto de métricas e o Postgres responder outra coisa — corretamente. Tirar a
escolha da mão do LLM é o que faz a coerência ser propriedade do código e não sorte.

**Consequências:** o `info_area_desenhada` continua existindo para o chat livre, e as
duas tools coexistem. O risco de o LLM escolher a errada é real, e o `prompts.py` tem de
distinguir as duas pelo **nome e pela descrição** — a lição do par
`setores_no_ponto`/`setor_que_contem`, já registrada no `TOOL_REGISTRY`.

---

### Decisão 6: o contrato transporta o aviso, a unidade e a proveniência de cada bloco

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-07 |

**Contexto:** regra 8 do ADR — o que muda o sentido do número sai junto dele.

**Escolha:** todo bloco do contrato carrega `fonte`, `periodo`, `metodo`, `cobertura` e
`avisos[]`. O bloco de classe social carrega o `_avisos_classe_social()` na própria
linha. O bloco de regulação, quando não há cobertura, vem **presente** com
`disponivel: false` e a frase que diz qual município não tem dado.

**Justificativa:** é a diferença entre a tela poder omitir e a tela ter de decidir omitir.
Se o backend mandar `null`, um componente distraído renderiza vazio e ninguém percebe —
que é exatamente o defeito do `ibge.bairro` que a emenda de 2026-09-03 nomeou.

**Consequências:** o contrato é verboso. É o preço, e é o mesmo que o produto já paga nas
tools de hoje.

---

### Decisão 7: a síntese é template no backend, não no navegador

| Atributo | Valor |
|---|---|
| **Status** | Aceita |
| **Data** | 2026-09-07 |

**Contexto:** o DEFINE proíbe LLM na montagem da tela. Falta dizer **onde** o texto se
monta.

**Escolha:** no `query/`, junto do contrato, como campo `sintese` do payload.

**Justificativa:** a síntese cita números que só o backend sabe arredondar de forma
coerente com os campos, e o mesmo texto tem de servir a tela, à impressão e ao chat.
Montá-lo no navegador criaria uma segunda régua de arredondamento — e a divergência
apareceria justamente na frase de manchete.

**Consequências:** texto em português dentro do `query/`, que até agora só devolveu
números. Aceito: os avisos de borda já são texto e já moram lá, pelo mesmo motivo.

---

## Manifesto de arquivos

### `query/` — Fase 1 (bastão do Codex)

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 1 | `src/geo_query/queries.py` | Editar | CTE `frac` extraída para constante compartilhada; `raio_x_por_geometria`; `zoneamento_por_geometria`; constantes de teto | — |
| 2 | `src/geo_query/sintese.py` | Criar | O template da síntese, puro e testável sem banco | 1 |
| 3 | `tests/test_raio_x.py` | Criar | AT-001, 002, 003, 005 e os tetos | 1, 2 |
| 4 | `tests/test_queries.py` | Editar | Garantir que o `cruzamento_por_geometria` não mudou | 1 |

### `agent/` — Fase 2 (bastão do Codex)

| # | Arquivo | Ação | Propósito | Depende de |
|---|---------|------|-----------|-----------|
| 4b | `src/geo_agent/acervo.py` | Editar | `wkb_por_id(id_: str)` — irmão do `wkb_por_nome`, mesma consulta trocando o `where`. Devolve `area_m2`, que o teto de área usa antes de tocar o `geodata` | — |
| 5 | `src/geo_agent/schemas.py` | Editar | `RaioX`, `BlocoEscala`, `BlocoContraste`, `BlocoPerfil`, `BlocoClasseSocial`, `BlocoRegulacao`, `Qualidade` | 1 |
| 6 | `src/geo_agent/rotas_raio_x.py` | Criar | `GET /api/raio-x/{desenho_id}`, 404/422/503 | 5 |
| 7 | `src/geo_agent/main.py` | Editar | Registrar o router | 6 |
| 8 | `src/geo_agent/tools.py` | Editar | `obter_raio_x` no `TOOL_REGISTRY` | 5 |
| 9 | `src/geo_agent/prompts.py` | Editar | Quando usar `obter_raio_x` e quando `info_area_desenhada` | 8 |
| 10 | `tests/test_rotas_raio_x.py` | Criar | AT-004, 008, 012 | 6 |

### `web/` — Fase 3 (bastão seguinte, **não entra neste**)

| # | Arquivo | Ação | Propósito |
|---|---------|------|-----------|
| 11 | `src/raiox/api.ts` | Criar | Cliente da rota |
| 12 | `src/raiox/PaginaRaioX.tsx` | Criar | Rota e composição dos blocos |
| 13 | `src/raiox/blocos/*.tsx` | Criar | Um componente por bloco |
| 14 | `src/raiox/impressao.css` | Criar | Folha de impressão |
| 15 | `src/map/pinturaRaioX.ts` | Criar | `match` por `CD_SETOR`, no molde do `highlight.ts` |
| 16 | `src/desenho/*` | Editar | Ação "Gerar Raio-X", ausente para ponto |

---

## Padrões de código

### Padrão 1 — a CTE do rateio, extraída e compartilhada

```python
# A regra do rateio mora AQUI e em nenhum outro lugar. Os dois métodos que a usam
# — cruzamento_por_geometria e raio_x_por_geometria — servem consumidores
# diferentes, mas o que "setor cortado" significa não pode divergir entre eles.
_CTE_FRACAO = """
    with area as (select ST_GeomFromWKB(%s, 4674) as g),
    frac as (
        select s.cod_setor,
               case when ST_Within(s.geom, a.g) then 1.0
                    else ST_Area(ST_Intersection(s.geom, a.g)::geography)
                         / nullif(ST_Area(s.geom::geography), 0)
               end as f
        from ibge.setor_censitario s, area a
        where ST_Intersects(s.geom, a.g)
    )
"""
```

### Padrão 2 — a distribuição sai da mesma varredura

```python
# json_agg sobre a MESMA CTE: o custo do ST_Intersects já foi pago acima. Ordenado
# pela métrica principal para a lista já chegar legível, e limitado porque 27.719
# setores (município de SP, medido) não vão para o navegador.
sql.SQL("""
    , dist as (
        select json_agg(x order by x.valor desc nulls last) as setores,
               count(*) as total
        from (
            select f.cod_setor, f.f as fracao,
                   r.{metrica} as valor, r.pop_total
            from frac f join ibge_tabular.setor_resumo r using (cod_setor)
            order by r.{metrica} desc nulls last
            limit {teto}
        ) x
    )
""")
```

### Padrão 3 — o bloco ausente é presente

```python
# `disponivel: false` e não ausência do campo. Um bloco que some da resposta some
# da tela sem ninguém decidir, e num diagnóstico a omissão se lê como "não há
# problema aqui" — o defeito que a emenda de 2026-09-03 à regra 8 nomeou no bairro.
class BlocoRegulacao(BaseModel):
    disponivel: bool
    zonas: list[ZonaNaArea] = []
    aviso: str | None = None   # "regulação de uso do solo não carregada para {municipio}"
    fonte: str | None = None   # "lei 18.177/2024" quando disponivel
```

### Padrão 4 — a rota, no molde do acervo

```python
# O _protegido do rotas_desenhos.py é o padrão desta casa: AcervoIndisponivel vira
# 503 e não 500, porque 500 convida o usuário a desistir e 503 diz a verdade — o
# banco reiniciou, tente de novo.
#
# O id é `str`, como em acervo.obter(). E o acervo precisa de um método NOVO:
# `obter()` devolve os campos do desenho sem geometria, e `wkb_por_nome()` devolve
# WKB mas busca por nome. Falta o irmão que busca por id — ver o manifesto.
@router.get("/{desenho_id}", response_model=RaioX)
def raio_x(desenho_id: str) -> Any:
    desenho = _protegido("raio-x")(_acervo().wkb_por_id)(desenho_id)
    if desenho is None:
        raise HTTPException(404, "nenhum desenho com este id")
    if desenho["tipo"] == "ponto":
        raise HTTPException(422, "ponto não tem área; o Raio-X precisa de polígono ou raio")
    # O teto de área se checa AQUI, com o area_m2 que a própria consulta do acervo já
    # devolve — barrar antes de tocar o geodata é o que faz a recusa custar nada.
    return estado["geodata"].raio_x_por_geometria(desenho["wkb"])
```

### Padrão 5 — a pintura, no molde do highlight

```ts
// match por CD_SETOR na PRÓPRIA fonte PMTiles, como o highlight.ts faz com filtro.
// Nenhuma geometria viaja no payload, e a pintura funciona fora do viewport.
// A escala é do DESENHO, não global: a legenda tem de dizer isso, senão duas telas
// com a mesma cor sugerem o mesmo valor e não é verdade.
function corPorSetor(setores: SetorDoRaioX[], escala: Escala) {
  return [
    "match",
    ["get", "CD_SETOR"],
    ...setores.flatMap((s) => [s.cod_setor, escala(s.valor)]),
    "transparent",
  ];
}
```

---

## Fluxo de dados

```text
1. usuário abre a área salva            → web
2. GET /api/raio-x/{id}                 → agent (sessão do portão)
3. acervo.por_id(id)                    → app_clientes  (geometria em WKB)
4. recusa se tipo == ponto              → 422
5. raio_x_por_geometria(wkb)            → geodata, SOMENTE LEITURA
   ├─ CTE frac      (rateio)
   ├─ agregado      (soma e médias ponderadas)
   ├─ distribuição  (json_agg, teto 500)
   ├─ município     (municipio_resumo, referência)
   ├─ zoneamento    (interseção; disponivel:false fora de SP)
   └─ síntese       (template, sem LLM)
6. contrato Pydantic                    → navegador
7. blocos + match por CD_SETOR          → tela e mapa
8. chat pede obter_raio_x(id)           → o MESMO objeto
```

---

## Pontos de integração

| Integração | Direção | Observação |
|---|---|---|
| `app_clientes` | leitura | Só `por_id`; nada escreve nesta feature |
| `geodata` | leitura | `ibge.setor_censitario`, `ibge_tabular.setor_resumo`, `municipio_resumo`, `regulacao.zoneamento` |
| Portão de sessão | — | A rota herda o `/api`, como o `rotas_desenhos.py` |
| Fonte PMTiles `setor` | leitura no cliente | A pintura depende de `campoDestaque` = `CD_SETOR` existir na camada daquele cliente |
| OpenAI | nenhuma | **A rota não chama modelo.** É o que sustenta o AT-009 |

---

## Estratégia de teste

| Tipo | Escopo | Ferramenta | Cobre |
|---|---|---|---|
| Unidade | `sintese.py` | pytest, sem banco | Arredondamento e frases de aviso |
| Unidade | tetos e recusas | pytest | AT-005, AT-004 |
| Integração | `raio_x_por_geometria` | pytest + PostGIS | AT-001, 002, 003, 006, 007 |
| Integração | rota | pytest + TestClient | AT-004, 008, 012 |
| Regressão | `cruzamento_por_geometria` | `test_queries.py` existente | Que a Decisão 1 seja verdade |
| Manual | tela e impressão | `make preview` | AT-009, AT-010, AT-011 |

**A medição que falta:** rodar `raio_x_por_geometria` contra o município de São Paulo na
**VPS**, não neste Mac — é a premissa A-001, e é o que pode obrigar a baixar os tetos da
Decisão 3.

---

## Tratamento de erro

| Situação | Resposta | Por quê |
|---|---|---|
| Acervo fora do ar | 503 + mensagem | Mapa e camadas seguem de pé |
| Desenho inexistente | 404 | Sem vazar erro de banco |
| Desenho de ponto | 422 com a alternativa | Recusar nomeando a saída é o padrão do `_SEM_AGREGACAO` |
| Área acima de 2.000 km² | 422 dizendo o limite e a área pedida | O usuário precisa saber quanto reduzir |
| `geodata` fora do ar | 503 | Mesmo tratamento do acervo |
| Zoneamento sem cobertura | **200**, bloco com `disponivel: false` | Não é erro; é ausência de dado, e ela se afirma |

---

## Segurança e privacidade

- A rota fica atrás do portão de sessão; o isolamento entre clientes continua sendo do
  Postgres, não da aplicação.
- **O que vai ao LLM é o contrato, nunca WKB.** A geometria bruta do cliente não entra em
  prompt — o `obter_raio_x` devolve números, `cod_setor` e avisos.
- Nada aqui escreve no `geodata`, e nada do cliente sai do `app_clientes`.

---

## Observabilidade

- Log do tempo da consulta e do número de setores tocados, por desenho — é o que permite
  fechar a A-001 com dado de produção em vez de nova medição sintética.
- Contador de truncamento da lista: se o teto de 500 disparar com frequência, ele está
  errado.

---

## Histórico de revisão

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-07 | design (sessão Claude Code) | Versão inicial. Resolve a premissa A-002 do DEFINE por leitura de `layers.ts:41` e `highlight.ts` |

---

## Próximo passo

**Pronto para:** `/build .claude/sdd/features/DESIGN_RAIO_X_DA_AREA.md`

**Bastão para o Codex:** arquivos 1 a 10 do manifesto — Fases 1 e 2. A tela (11 a 16)
fica para o bastão seguinte, porque mistura outro portão de qualidade no mesmo commit.
