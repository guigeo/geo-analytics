# DEFINE: H3 no agente

> O agente passa a responder, na célula H3 do endereço, população, domicílios ocupados, renda média e saneamento além das contagens de moradia já existentes.

## Metadata

| Atributo | Valor |
|---|---|
| **Feature** | `H3_NO_AGENTE` |
| **Data** | 2026-09-13 |
| **Autor** | Codex |
| **Status** | Entregue em produção nos dois clientes em 2026-09-13 |
| **Clareza** | 15/15 |

## Problema

A célula H3 já concentra 40 variáveis do Censo 2022, mas o agente só expõe as três contagens de moradia do CNEFE. Quem pergunta sobre o endereço perde o recorte fino que já existe no banco.

## Objetivos

| Prioridade | Objetivo |
|---|---|
| **MUST** | Consultar por ponto os temas `moradia`, `populacao`, `renda` e `saneamento` |
| **MUST** | Distinguir no payload o CNEFE exato do Censo re-agregado por rateio areal |
| **MUST** | Preservar o destaque da célula no mapa |
| **SHOULD** | Não enviar ao modelo campos que não respondeu |

## Critérios de sucesso

- [ ] Os quatro temas são argumentos validados da tool `h3_no_ponto`.
- [ ] População, domicílios ocupados, renda média e três percentuais de saneamento chegam em uma consulta ao banco.
- [ ] Todo tema do Censo leva aviso de rateio areal; renda média leva também o aviso de aproximação.
- [ ] `moradia` continua sendo o padrão e conserva a resposta atual do CNEFE.

## Aceitação

| ID | Cenário | Quando | Então |
|---|---|---|---|
| AT-001 | População no endereço | O agente pede `populacao` | Recebe população e domicílios ocupados, com aviso de estimativa H3 |
| AT-002 | Renda no endereço | O agente pede `renda` | Recebe renda média e o aviso de média reconstruída |
| AT-003 | Saneamento no endereço | O agente pede `saneamento` | Recebe percentuais de água, esgoto e lixo sobre domicílios ocupados |
| AT-004 | Verticalização no endereço | O agente não informa tema | Mantém as contagens CNEFE e a qualidade das coordenadas |
| AT-005 | Fora do recorte | O ponto não pertence à malha | Mantém o erro de cobertura, sem pintar o mapa |

## Fora de escopo

- Variáveis de idade, raça, educação, saúde ou outros temas H3.
- Novos atributos no tile, no seletor H3 ou na tela.
- Renda mediana: mediana não é agregável e não foi publicada na malha H3.
- Carga, réplica ou mudança de schema no banco.

## Restrições e premissas

| Tipo | Restrição | Estado |
|---|---|---|
| Dados | Censo-H3 é estimativa por rateio areal; CNEFE-H3 é contagem exata por coordenada | Validada |
| Dados | `V06004` é média reconstruída ponderada por responsáveis; não é mediana | Validada |
| Arquitetura | Avisos que mudam o sentido dos números saem da tool, não só do prompt | Validada |
| Infraestrutura | A tabela H3 já está no `geodata` dos dois clientes | Validada |

## Próximo passo

`DESIGN_H3_NO_AGENTE.md`
