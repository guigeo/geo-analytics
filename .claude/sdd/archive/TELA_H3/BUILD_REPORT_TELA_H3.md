# BUILD REPORT: TELA_H3

> Primeira camada H3 da aplicação: domicílios em apartamento por célula r9.

## Metadados

| Atributo | Valor |
|---|---|
| Feature | TELA_H3 |
| Data | 2026-09-07 |
| Autor | Codex |
| DEFINE | [DEFINE_TELA_H3.md](DEFINE_TELA_H3.md) |
| DESIGN | [DESIGN_TELA_H3.md](DESIGN_TELA_H3.md) |
| Status | Publicado em produção nos dois clientes |

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
| Produção | Cinco tabelas H3 replicadas na VPS; `h3_domicilios.pmtiles` publicado (12,8 MB), Range `0-6` responde 206; os dois bundles entregam `e842303`. |

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
| AT-009 | Passou | Dados replicados, tile publicado e vigiado, agentes reiniciados e bundles `e842303` entregues nos dois clientes. |

## Desvios e achados

| Item | Registro |
|---|---|
| Borda CNEFE | Seis células, com 18 endereços, ficam 12–360 m fora do contorno de setores do Censo. A união as preserva; o desacordo é documentado pela carga, não tratado como erro. |
| Réplica | O publicador leva também os valores longos do Censo (424 MB), porque a tabela de célula Censo não pode existir isolada do seu contrato. O mapa inicial continua usando só as contagens medidas do CNEFE. |
| Inspeção visual | Não houve navegador disponível na sessão. A entrega visual é coberta por testes de configuração/atributos, preview HTTP e publicação; a percepção de uso passa a orientar os próximos ajustes. |

## Publicação

A publicação seguiu **dados → tiles → agente → app**. As cinco tabelas H3 foram replicadas
na VPS e conferidas (incluindo 10.005.534 endereços CNEFE de todas as espécies); o tile foi
publicado no host compartilhado; os dois agentes foram reiniciados pelo Guilherme; e os dois
frontends foram publicados. Uma consulta em produção no ponto `-46.6540, -23.5614` devolveu
829 apartamentos nos dois agentes.

## Próximo passo

Observar a percepção de quem usar o mapa. A próxima iteração pode calibrar a escala, a
legenda ou a narrativa do tema; seletor de variável e o recorte de "onde se constrói"
continuam deliberadamente fora deste primeiro lançamento.
