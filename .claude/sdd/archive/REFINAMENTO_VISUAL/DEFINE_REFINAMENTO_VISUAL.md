# DEFINE: Refinamento Visual do Mapa

> Polish visual do mapa da Fase 1: basemap com ruas no zoom próximo, paleta refinada das camadas, rótulos de UF/município, highlight ao clicar e legenda.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | REFINAMENTO_VISUAL |
| **Data** | 2026-06-27 |
| **Autor** | define-agent |
| **Status** | ✅ Shipped (2026-06-27) |
| **Clarity Score** | 14/15 |

---

## Problema

O mapa entregue na Fase 1 cumpre o escopo funcional, mas a percepção visual ficou "simples demais": o **basemap** tem ruas grosseiras ao aproximar (gerado com `maxzoom: 8`) e as **camadas de dados** têm cores chapadas, sem rótulos, sem legenda e sem destaque ao clicar. Isso reduz a legibilidade e a sensação de qualidade da ferramenta para a equipe de geomarketing.

---

## Usuários-Alvo

| Usuário | Papel | Dor |
|---------|-------|-----|
| Analista de geomarketing | Explora territórios e antenas | Fundo sem ruas no zoom de cidade dificulta orientar-se; cores chapadas dificultam distinguir/ler camadas |
| Guilherme (autor) | Desenvolvedor/operador | Quer uma ferramenta com aparência profissional como base para evoluir (chat Fase 2) |

---

## Objetivos

| Prioridade | Objetivo |
|-----------|----------|
| **MUST** | Basemap com ruas detalhadas no zoom próximo (regenerar com `maxzoom: 13`), mantendo visão nacional simples |
| **MUST** | Paleta refinada das 5 camadas (cores distintas/harmônicas, opacidade e outline legíveis) |
| **MUST** | Highlight da feição ao clicar (polígonos e pontos) sem regenerar tiles de dados |
| **SHOULD** | Rótulos com nomes de UF e município em faixas de zoom apropriadas |
| **SHOULD** | Legenda com a cor de cada camada |
| **COULD** | Cursor/transições suaves de realce |

---

## Critérios de Sucesso

- [ ] Ao aproximar numa cidade, o basemap mostra **ruas** (vs. ausência no z8 atual)
- [ ] As **5 camadas** têm cores distintas e legíveis sobre o basemap claro
- [ ] Clicar em qualquer feição (polígono ou ponto) a **realça** no mapa em **< 200 ms**
- [ ] Clicar fora limpa o realce; nova feição substitui o anterior
- [ ] **UF e município** exibem rótulos de nome; bairro/setor **não**
- [ ] Legenda visível com as cores das camadas
- [ ] **Tiles de dados inalterados** (apenas `basemap.pmtiles` regenerado)
- [ ] Tamanho do novo `basemap.pmtiles` medido e registrado

---

## Testes de Aceite

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| AT-001 | Ruas no zoom próximo | Basemap regenerado (maxzoom 13) | Dou zoom numa cidade | Vejo a malha de ruas no fundo |
| AT-002 | Visão nacional simples | Mesmo basemap | Vejo o Brasil inteiro (zoom baixo) | Fundo permanece limpo (sem poluição) |
| AT-003 | Paleta legível | App com nova paleta | Ligo as 5 camadas | Cores distintas e legíveis, sem "lavar" o mapa |
| AT-004 | Highlight polígono | Camada de município visível | Clico num município | A feição é realçada com contorno contrastante |
| AT-005 | Highlight ponto | Camada de antenas visível | Clico numa antena | O ponto é realçado |
| AT-006 | Limpar/trocar realce | Uma feição realçada | Clico fora / em outra feição | Realce some / passa para a nova feição |
| AT-007 | Rótulos | UF e município visíveis | Navego nos zooms | Nomes de UF/município aparecem; bairro/setor sem rótulo |
| AT-008 | Legenda | App carregado | Olho a legenda | Cada camada aparece com sua cor |

---

## Fora de Escopo

- Estilo data-driven (antenas por operadora, choropleth de setor) — feature analítica futura
- Dark mode (escolhido tema claro)
- Rótulos de bairro e setor (densidade alta)
- Highlight por `feature-state`/`promoteId` (exigiria re-tilar todos os dados)
- Auto-hospedar fontes/sprites do tema Protomaps
- Qualquer mudança nos tiles de dados (uf/municipio/bairro/setor/antenas)

---

## Restrições

| Tipo | Restrição | Impacto |
|------|-----------|---------|
| Técnica | Não regenerar tiles de dados (evitar re-tilagem do setor ~28 min) | Highlight via GeoJSON de seleção, não feature-state |
| Técnica | Manter "100% estático" e PMTiles via `pmtiles://` | Basemap continua auto-hospedado |
| Técnica | Estilo no MapLibre (paint/layout/symbol) | Mudanças concentradas em `web/src/map/` |
| Recurso | Regeração do basemap roda no container do ETL | `pmtiles extract` com novo `maxzoom` |

---

## Contexto Técnico

| Aspecto | Valor | Notas |
|---------|-------|-------|
| **Local de Deployment** | `web/src/map/{layers,basemap,MapView}.tsx/ts`, `web/src/panels/`, `pipeline/datasets.yaml`, `pipeline/src/geo_pipeline/basemap.py` | Majoritariamente frontend + 1 config de ETL |
| **Domínios de KB** | `maplibre` (a criar via `/create-kb`) | Padrões de symbol/highlight/estilo |
| **Impacto IaC** | Nenhum | Sem infra; mesma esteira estática |

---

## Premissas

| ID | Premissa | Se Errada, Impacto | Validada? |
|----|----------|--------------------|-----------|
| A-001 | `pmtiles extract` aceita `--maxzoom` para limitar o detalhe do recorte | Precisaria de outro método de recorte/zoom | [ ] (validar no build) |
| A-002 | Basemap z13 do Brasil tem tamanho aceitável para disco/VPS | Recuar para z11–12 | [ ] (medir no build) |
| A-003 | `queryRenderedFeatures` retorna geometria utilizável para o realce | Usar bounding box ou feature-state | [ ] |
| A-004 | Corte de geometria nas bordas de tile é aceitável visualmente | Migrar para feature-state (Abordagem B) | [ ] |

---

## Clarity Score Breakdown

| Elemento | Score (0-3) | Notas |
|----------|-------------|-------|
| Problem | 3 | Percepção "simples" bem localizada (basemap + cores) |
| Users | 3 | Mesmos perfis da Fase 1, dores visuais claras |
| Goals | 3 | MUST/SHOULD/COULD priorizados |
| Success | 3 | Mensuráveis e testáveis (8 ATs) |
| Scope | 2 | Claro, mas detalhe fino da paleta/zoom de rótulos será calibrado no design/build |
| **Total** | **14/15** | |

**Mínimo para prosseguir: 12/15** ✅

---

## Questões em Aberto

- `Q-A001` Confirmar flag `--maxzoom` do `pmtiles extract` no build (premissa A-001).
- `Q-A002` Medir o tamanho do basemap z13 e decidir se mantém ou recua (premissa A-002).

Nenhuma bloqueante para o Design.

---

## Histórico de Revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-06-27 | define-agent | Versão inicial a partir de BRAINSTORM_REFINAMENTO_VISUAL |

---

## Próximo Passo

**Pronto para:** `/design .claude/sdd/features/DEFINE_REFINAMENTO_VISUAL.md`
