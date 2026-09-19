# BUILD REPORT: EQUIPAMENTOS_OFICIAIS_NO_MAPA

> CNES e Inep no mapa, no Raio-X e no agente. Build local concluído; tiles gerados
> neste Mac; nada publicado.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | EQUIPAMENTOS_OFICIAIS_NO_MAPA |
| **Date** | 2026-09-19 |
| **Author** | build (Cursor Grok 4.6) |
| **DEFINE** | [`DEFINE_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md`](DEFINE_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md) |
| **DESIGN** | [`DESIGN_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md`](DESIGN_EQUIPAMENTOS_OFICIAIS_NO_MAPA.md) |
| **Status** | Complete locally — espera aceite visual antes de qualquer `ship-*` |

---

## Summary

| Metric | Value |
|--------|-------|
| **Tasks Completed** | 6/6 do manifesto (publicação de tile/app fora do /build) |
| **Repos** | `geo-analytics` + `servidor-dados-gis` |
| **Tests Passing** | web 278; query 19 (com GEODATA_DSN); agent 87 + 3 de contrato real; pipeline 35 |
| **Portão frontend** | typecheck · lint · prettier · vitest · vite build |
| **Ruff** | query, agent, pipeline limpos |
| **Carga local** | `infraestrutura.cnes_tipo_unidade`: 46 tipos, 26 no mapa, 18 na manchete |
| **Tiles locais** | `escolas.pmtiles` 36,7 MB · `saude.pmtiles` 36,1 MB |
| **Commit / ship** | não — aceite visual pendente |

**Números medidos no parquet, 2026-09-19:**

| Camada | Feições | Observação |
|---|---:|---|
| `escolas` | 166.062 | federal 694 · estadual 27.944 · municipal 97.051 · privada 40.373 |
| `saude` | 236.187 | especialidade 106.994 · atenção básica 51.914 · apoio 32.819 · farmácia 29.739 · hospital 8.037 · promoção 4.654 · urgência 2.030 |
| consultório isolado no tile | 0 | AT-003 |
| tipo sem linha no de-para | 0 | AT-010 |

---

## Task Execution

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | De-para CSV + carga + GRANT + `verificar.sh` + `--ensaio` | ✅ | 46 feições; `geo_reader` lê; ensaio sem SSH |
| 2 | `datasets.yaml` escolas + saude | ✅ | JOIN no de-para; `where t.no_mapa`; minzoom 6; apelido sem aspas |
| 3 | Catálogo, filtro `setFilter`, SeletorDeClasses, dois clientes | ✅ | farmácia/apoio/promoção nascem desligadas |
| 4 | Raio-X `versao_calculo` 6, recorte nomeado, AT-005/007/008 | ✅ | zero é zero, cobertura nacional |
| 5 | Tool `equipamentos_no_ponto` + regras 3d/3e | ✅ | nome e rede; CNEFE H3 não misturado |
| 6 | Docs + tiles locais | ✅ | `AGENTS.md`, `DECISOES.md`; sem `ship-tiles` |

---

## Verification Results

### servidor-dados-gis

- `./cargas/_tipo_unidade.sh` — ok
- `GRANT SELECT` a `geo_reader` — verdadeiro
- `./scripts/verificar.sh` — ok (AT-010)
- `./scripts/vps-publicar-tipo-unidade.sh --ensaio` — 46 tipos, 26 no mapa; nenhuma conexão SSH

### Python

```text
query:  19 passed (test_raio_x.py contra o geodata local)
agent:  87 passed + 3 contrato RaioX.model_validate no dado real
pipeline: 35 passed
ruff:   All checks passed (query, agent, pipeline)
```

### Frontend

```text
typecheck  ok
eslint     ok (--max-warnings 0)
prettier   ok
vitest     30 files / 278 tests
vite build ok
```

### Tiles (locais, host compartilhado)

Gerados com `docker compose run --rm pipeline build --only escolas|saude`, DSN com
`host.docker.internal` (o `.env` nativo aponta `localhost` e o ogr2ogr do container
recusa).

```text
escolas.pmtiles  36,7 MB
saude.pmtiles    36,1 MB
```

Não copiados para a VPS. `webgis/scripts/verificar-tiles.sh` não foi editado: a lista
de lá é a do que está publicado.

---

## Deviations from Design

| Deviation | Reason | Impact |
|-----------|--------|--------|
| DDL com `rotulo_oficial` e `observacao` | HANDOFF: o CSV tem colunas a mais que o DESIGN | Tabela auditável contra a TP_ESTAB.CNV |
| `novidades.ts` fora do manifesto de 30 | Anúncio é dado, não JSX | Chip e pergunta específica no chat |
| Ponto do AT-008 de contrato | Oceano (−46, −24,8) não tem setor; o Raio-X inteiro some | Superfície de setor grande no extremo sul de SP, sem equipamento a 80 m |
| `LIMIAR_COBERTURA_COMPLETA_EQUIPAMENTOS_PCT` removido | Cadastro nacional; limiar do CNEFE não se aplica | Ruff não reclama de constante morta |

---

## Blockers

| Blocker | Required Action | Owner |
|---------|-----------------|-------|
| Aceite visual (AT-001, AT-006, AT-007) | Ligar as camadas, filtrar hospital, abrir um Raio-X | Gui |
| Publicação | Só depois do "pode subir": de-para na VPS, `ship-tiles`, `ship-ia`, `ship-app` | Gui |

Disco da VPS continua apertado (4,2 GB livres na última medição). Os dois tiles somam
~73 MB — cabe, mas `ship-tiles` tem de medir antes e depois.

---

## Acceptance Test Verification

| ID | Cenário | Status | Evidence |
|----|---------|--------|----------|
| AT-001 | Camada desenha com fonte Inep | ⏳ visual | Catálogo + tile local prontos |
| AT-002 | Cliente 2 lista as duas, apagadas | ✅ | `clientes.test.ts` |
| AT-003 | Sem consultório no tile | ✅ | parquet 236.187; `consultorio` = 0 |
| AT-004 | Filtro sem nova fonte | ✅ | `layers.test.ts`, `MapView.test.tsx`, `SeletorDeClasses.test.tsx` |
| AT-005 | Manchete = visível no estado inicial | ✅ | `_bloco_equipamentos` + `inicialmenteLigada` = `conta_no_raio_x` |
| AT-006 | Popup com nome e tipo | ⏳ visual | atributos no catálogo |
| AT-007 | Cartão Inep/CNES, sem CNEFE | ⏳ visual | `blocos.test.tsx` + contrato v6 |
| AT-008 | Zero real, não "sem cobertura" | ✅ | unitário + geodata + Pydantic |
| AT-010 | Código sem de-para derruba | ✅ | carga + `verificar.sh` |
| AT-011 | Tool devolve nome e rede | ✅ | `test_tools.py` |
| AT-012 | Disco na publicação | ⏳ | só no `ship-tiles` |

---

## Final Status

### Overall: ✅ COMPLETE — aceite visual cumprido; falta publicar

- [x] Manifesto implementado
- [x] Portão e testes locais
- [x] Tiles gerados neste Mac
- [x] Aceite visual (Gui, 2026-09-19)
- [ ] Publicado na VPS

**Quem publica não reconstrói e não mexe na malha H3/CNEFE.** Sobe só o que foi
validado no local: camadas `escolas` e `saude`, Raio-X `versao_calculo` 6, tool
`equipamentos_no_ponto`, de-para `cnes_tipo_unidade`.

Ordem, e só nesta:

1. `servidor-dados-gis`: `./scripts/vps-publicar-tipo-unidade.sh` (**não** o `--ensaio`). CNES e Inep já estão na réplica desde 19/09.
2. `webgis`: medir disco (`df -h`); `make ship-tiles`; incluir `escolas` e `saude` em `scripts/verificar-tiles.sh`. Tiles locais: 36,7 MB + 36,1 MB em `/Users/gui_ramos/dados/webgis/tiles/`.
3. `geo-analytics`: `make ship-ia` nos dois clientes e restart do unit (senha no terminal do Gui); depois `make ship-app` nos dois. Conferir `mtime` do `agent/.env` remoto antes, ou `PRESERVAR_ENV_REMOTO=1`.

O `/ship` do SDD (arquivar artefatos) vem **depois** da publicação, não no lugar dela.
