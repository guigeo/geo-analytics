# BUILD REPORT: TELA_H3

> Primeira camada H3 da aplicação: domicílios em apartamento por célula r9.

## Metadados

| Atributo | Valor |
|---|---|
| Feature | TELA_H3 |
| Data | 2026-09-07 |
| Autor | Codex |
| DEFINE | [DEFINE_TELA_H3.md](../features/DEFINE_TELA_H3.md) |
| DESIGN | [DESIGN_TELA_H3.md](../features/DESIGN_TELA_H3.md) |
| Status | Completo localmente; pronto para publicação manual |

## Entrega

| Faixa | Resultado |
|---|---|
| Pipeline | Fonte `h3_geodata` deriva hexágono diretamente de `H3_R9`; dataset une 68.448 células do Censo e seis células CNEFE de borda. |
| Mapa | Capacidade comum de pintura numérica, escala azul contínua 0–820, legenda e destaque pelo campo declarado. |
| Produto | Um único tema: domicílios em apartamento. O clique expõe casas, total e as seis contagens de qualidade da coordenada. |
| Consulta/agente | `h3_no_ponto` calcula o mesmo índice r9, devolve dados determinísticos e destaca a célula; fora do recorte, explica a cobertura. |
| Operação | Criado publicador de cinco tabelas H3 por COPY streaming e incluído `h3_domicilios` na verificação do host compartilhado. |

## Medições e validações

| Evidência | Resultado |
|---|---|
| Exportação real local | 68.454 índices únicos; 2.434.856 apartamentos, 6.059.973 casas, 8.735.615 domicílios particulares; geometrias válidas. |
| Distribuição da escala | mínimo 0; p95 216; p99 820; máximo 5.524. Valores acima de 820 saturam na cor final. |
| PMTiles local | 68.454 feições; 13,4 MB. |
| Preview Caddy | `h3_domicilios.pmtiles` responde 200 com `Accept-Ranges: bytes`; Range `0-6` responde 206 e assinatura `PMTiles`. |
| Pipeline | 33 testes e Ruff aprovados. |
| Query | 53 testes contra o geodata local e Ruff aprovados. |
| Agente | 77 testes aprovados, 85 pulados por dependência externa e Ruff aprovado. |
| Frontend | Prettier, ESLint, TypeScript, 231 testes e build de produção aprovados. |
| Servidor de dados | `bash -n`, ensaio do publicador e `scripts/verificar.sh --estatico` aprovados. |
| Host compartilhado | `bash -n scripts/verificar-tiles.sh` aprovado. |

## Aceitação

| ID | Resultado | Evidência |
|---|---|---|
| AT-001 | Passou | Exportação local de 68.454 células H3 válidas e índices únicos. |
| AT-002 | Passou | SQL do dataset faz `coalesce(..., 0)` para os três totais CNEFE. |
| AT-003 | Passou por código/teste | `interpolate` contínuo para `DOM_APARTAMENTO`; snapshot e teste específico. |
| AT-004 | Passou | Painel testa a legenda com título, gradiente e extremos. |
| AT-005 | Passou | Teste de atributos H3 cobre apartamentos, casas e coordenada original. |
| AT-006 | Passou | Catálogo e painel exibem os 37 municípios da concentração urbana de São Paulo. |
| AT-007 | Passou | Consulta real dentro do recorte e tool offline devolvem `H3_R9` para o destaque. |
| AT-008 | Passou | Consulta real em Salvador retorna ausência; a tool transforma isso em cobertura limitada. |
| AT-009 | Parcial, por desenho operacional | PMTiles e Range foram validados localmente; host de tiles, bundles publicados e agentes reiniciados são passos manuais de publicação. |

## Desvios e achados

| Item | Registro |
|---|---|
| Borda CNEFE | Seis células, com 18 endereços, ficam 12–360 m fora do contorno de setores do Censo. A união as preserva; o desacordo é documentado pela carga, não tratado como erro. |
| Réplica | O publicador leva também os valores longos do Censo (424 MB), porque a tabela de célula Censo não pode existir isolada do seu contrato. O mapa inicial continua usando só as contagens medidas do CNEFE. |
| Inspeção visual | Não houve navegador disponível na sessão. A entrega visual é coberta por testes de configuração/atributos e pelo preview HTTP; conferir os dois temas antes da publicação é recomendável. |

## Próximo passo

Sem publicar automaticamente: seguir a ordem **dados → tiles → app → agente**.

1. No `servidor-dados-gis`, rodar `./scripts/vps-publicar-h3.sh` e conferir espaço na VPS.
2. No `webgis`, rodar `make ship-tiles` e `make tiles-check`.
3. No `geo-analytics`, validar `make preview`, depois `make ship-app` e `make ship-ia` para cada cliente.
4. Guilherme reinicia os serviços dos agentes no terminal interativo, como exige a operação.
