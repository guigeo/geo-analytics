# DESIGN: H3 no agente

## Metadata

| Atributo | Valor |
|---|---|
| **Feature** | `H3_NO_AGENTE` |
| **Data** | 2026-09-13 |
| **DEFINE** | [DEFINE_H3_NO_AGENTE.md](DEFINE_H3_NO_AGENTE.md) |
| **Status** | Entregue em produção nos dois clientes em 2026-09-13 |

## Fluxo

```text
pergunta/endereço → localizar_endereco → h3_no_ponto(temas)
                                      ↓
                         GeoQuery: CNEFE-H3 + Censo-H3
                                      ↓
                    tool filtra tema, declara fonte e avisos
                                      ↓
                           resposta do agente + destaque H3
```

## Decisões

### Temas fechados no contrato

`temas` é uma lista de `moradia`, `populacao`, `renda` e `saneamento`; o padrão é
`moradia`. A lista evita nomes de coluna no prompt e mantém a resposta proporcional à
pergunta. Idade, raça e novos temas entram depois como extensão explícita do contrato.

### Uma consulta, duas procedências

`GeoQuery.h3_no_ponto` lê os campos fixos necessários das tabelas CNEFE e Censo. A tool
separa-os em blocos: moradia tem CNEFE 2022 e qualidade da coordenada; os outros trazem
Censo 2022, o método de rateio e as frações ausentes. Assim o LLM não confunde medida
exata com estimativa.

### Saneamento em percentual

Água, esgoto e lixo são convertidos na tool para percentual sobre `domicilios_ocupados`.
É o denominador da métrica, não domicílios totais. Valores nulos permanecem nulos, nunca
viram zero.

### Renda média declarada

A tool avisa que a renda média H3 é reconstruída e ponderada por responsáveis porque o
denominador dos responsáveis com rendimento não é publicado. Renda mediana permanece
fora do contrato.

## Manifesto

| Arquivo | Ação | Finalidade |
|---|---|---|
| `query/src/geo_query/queries.py` | Alterar | Buscar métricas Censo-H3 junto do CNEFE-H3 |
| `query/tests/test_queries.py` | Alterar | Garantir valores e frações H3 reais |
| `agent/src/geo_agent/tools.py` | Alterar | Validar temas, montar blocos e avisos |
| `agent/src/geo_agent/prompts.py` | Alterar | Ensinar o uso correto da tool |
| `agent/tests/test_tools.py` | Alterar | Cobrir filtro, avisos e compatibilidade de moradia |

## Testes

- Unitário offline para cada tema e para o filtro do payload.
- Consulta real contra a célula de Vila Olímpia: chaves do Censo presentes, percentuais entre 0 e 100 e frações entre 0 e 1.
- Regressão: chamada sem `temas` preserva `moradia`, a célula destacada e o erro fora da cobertura.

## Segurança e operação

Não há escrita nem novo endpoint: a consulta segue pelo papel `geo_reader`, no endpoint
de chat já rate-limited. A entrega é só do agente e exige reinício manual dos dois
serviços depois do upload.
