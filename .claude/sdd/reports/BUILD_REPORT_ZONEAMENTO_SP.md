# BUILD REPORT: ZONEAMENTO_SP

## Metadata

| Atributo | Valor |
|---|---|
| Feature | ZONEAMENTO_SP |
| Data | 2026-09-03 |
| Autor | Codex |
| DEFINE | [DEFINE_ZONEAMENTO_SP.md](../features/DEFINE_ZONEAMENTO_SP.md) |
| DESIGN | [DESIGN_ZONEAMENTO_SP.md](../features/DESIGN_ZONEAMENTO_SP.md) |
| Status | Completo, com inspeção visual A-003 pendente |

## Resumo

| Métrica | Resultado |
|---|---|
| Itens do manifesto | 25/25 implementados |
| Carga publicada localmente | 61.784 feições, 38 códigos, 10.714 não-zonas |
| PMTiles local | `zoneamento_sp.pmtiles`, 12,1 MB |
| Frontend | 216 testes, portão e build aprovados |
| Query | 51 testes aprovados contra o geodata |
| Agente | 89 testes aprovados; 34 benchmarks pagos excluídos |
| Agentes delegados | Nenhum |

## Execução

| Faixa | Itens | Resultado |
|---|---:|---|
| `servidor-dados-gis` | 1–7 | Schema `regulacao`, papel leitor, helper WFS paginado, curadoria, carga, contrato, README e auditoria implementados. |
| Pipeline | 8 | Dataset declarativo e PMTiles gerado localmente. |
| Web | 9–19 | Capacidade categórica, paleta, cobertura, catálogo, clientes, `match`, snapshot e legenda implementados. |
| Query e agente | 20–25 | Consulta espacial, tool, prompt, testes offline/integração e caso de benchmark implementados. |

## Verificação

| Verificação | Resultado |
|---|---|
| `servidor-dados-gis/scripts/verificar.sh --estatico` | Passou |
| `bash -n` dos scripts alterados | Passou |
| `cargas/geosampa_zoneamento.sh` | Passou duas vezes; segunda carga confirmou idempotência |
| `scripts/verificar.sh --banco --dados` | Passou |
| `query: ruff check . && pytest` | 51/51 passaram |
| `agent: ruff check . && pytest -m 'not benchmark'` | 89 passaram, 32 pulados, 34 benchmarks excluídos |
| `web: format:check, lint, typecheck, test, build` | Passou; 216 testes |

## Aceitação

| ID | Resultado | Evidência |
|---|---|---|
| AT-001 | Passou | 61.784 feições, 38 códigos, geometria, linhagem e leitura por `geo_reader` auditadas. |
| AT-002 | Passou | Segunda execução fez `TRUNCATE` + 61.784 inserts, sem duplicação. |
| AT-003 | Passou | Script aponta para `geoportal:perimetro_zona_lei_18177_24`. |
| AT-004 | Pendente visual | A paleta e o `match` têm testes; a inspeção nos dois temas não foi feita. |
| AT-005 | Passou em dado/código | 10.714 `Praça/Canteiro` ficaram com `e_zona=false` e caem no neutro. |
| AT-006 | Passou por contrato | Tile publica código, descrição e lei; popup usa os atributos da feição. |
| AT-007 | Passou | Query e tool testadas contra PostGIS; destaque usa `COD_ZONA`. |
| AT-008 | Passou | Query retorna `None` e tool explica a cobertura fora de São Paulo. |
| AT-009 | Passou | Painel testa e exibe a cobertura do zoneamento. |
| AT-010 | Passou | Painel testa e exibe a cobertura parcial de bairro. |
| AT-011 | Passou | Testes de clientes e build mantêm a camada nos dois builds, sem cliente em TSX. |

## Desvios e premissas

| Item | Registro |
|---|---|
| Códigos | O WFS consultado em 2026-09-03 devolveu 38 códigos distintos **incluindo** `Praça/Canteiro`. Por isso a curadoria tem 38 entradas e a paleta tem 37 zonas; a exceção não recebe cor de zona. Isto resolve a contradição literal do DESIGN sem esconder dado da fonte. |
| A-002 | Validada pela carga integral: só um código veio sem descrição, preservado como não-zona. |
| A-003 | **Não validada.** É inspeção visual do Guilherme em `make dev-lado-a-lado`; não foi executada nem declarada como conferida. |
| A-004 | Validada pelo PMTiles local de 12,1 MB, sem tuning adicional. |
| Benchmark | `pytest -m benchmark` não foi executado, por chamar a OpenAI e ser explicitamente vedado nesta sessão. |

## Próximo passo

1. Guilherme inspeciona a distinguibilidade da paleta clara/escura em `make dev-lado-a-lado` (A-003).
2. Depois, seguir o procedimento de `/ship`; esta sessão não executou `make ship*` nem publicou na VPS.
