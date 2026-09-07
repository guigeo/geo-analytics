# DEFINE: RAIO_X_DA_AREA

> Uma área salva vira diagnóstico territorial estruturado — e a notícia não é a média
> do recorte, é a variação dentro dele

## Metadata

| Atributo | Valor |
|-----------|-------|
| **Feature** | RAIO_X_DA_AREA |
| **Data** | 2026-09-07 |
| **Autor** | define (sessão Claude Code) |
| **Status** | Pronto para `/design` |
| **Clarity Score** | 15/15 |
| **Origem** | [BRAINSTORM_RAIO_X_DA_AREA.md](BRAINSTORM_RAIO_X_DA_AREA.md) |
| **Pré-requisito** | ✅ Emenda ao ADR-0001 feita (`webgis`, `798b321`) |
| **Execução prevista** | Fases 1 e 2 pelo Codex; a tela em bastão seguinte |

---

## Problema

O cruzamento de uma área desenhada com o Censo já existe, mas só como tool do chat: a
pessoa precisa formular a pergunta e o modelo escolhe os campos a agregar. Quem desenha
uma área e quer entendê-la depende de saber o que perguntar — e o resultado sai como
texto de conversa, sem fonte fixa, sem evidência no mapa e sem forma de encaminhar.

**O segundo problema é de conteúdo, e derrubou a primeira versão do plano.** A resposta
natural — média de população, renda e saneamento sob o polígono — confirma o que a
pessoa já supunha. Quem desenha em bairro caro sabe que é caro. Um diagnóstico que só
confirma intuição não é usado duas vezes.

O que o dado em produção tem de surpreendente é a **variação dentro do próprio
desenho**: o `cruzamento_por_geometria` calcula setor a setor e devolve só a média
ponderada. Um buffer de 500 m toca 40 setores (medido, `query/src/geo_query/queries.py:833`),
e "renda média de R$ 4.200" pode estar escondendo setor de R$ 1.100 ao lado de setor de
R$ 9.800. Essa informação já é calculada e é jogada fora a cada consulta.

---

## Usuários

| Usuário | Papel | Dor |
|---------|-------|-----|
| **Cliente 2 (EB Prime)** | Imobiliária — avalia terreno e imóvel | Precisa saber se o recorte é um mercado ou três, e onde fica cada um. Hoje só tem a média, que não distingue |
| **Cliente 1 (Geo Intelligence)** | Análise territorial e demonstração | Tem o dado, não tem a leitura pronta; cada análise recomeça do zero no chat |
| **Quem desenha e não sabe perguntar** | Uso geral | Salva a área e não extrai nada dela sem formular a pergunta certa |
| **Agente de IA** | Explica o diagnóstico | Hoje reagrega por conta própria e pode devolver número diferente do que a tela mostra |

**Primeira audiência decidida (Guilherme, 2026-09-07):** avaliação de terreno e imóvel.
A primeira dobra abre por escala e contraste interno.

---

## Objetivos

| Prioridade | Objetivo |
|------------|----------|
| **MUST** | `raio_x_por_geometria` no `query/`, **ao lado** do `cruzamento_por_geometria` e sem substituí-lo |
| **MUST** | O contrato devolve agregado, **distribuição por setor** e **referência municipal** numa chamada |
| **MUST** | População partida em **contida** e **rateada**, com contagem de setores parciais |
| **MUST** | `GET /api/raio-x/{desenho_id}` respondendo **sem LLM no caminho** |
| **MUST** | Tela por área salva, com endereço próprio, blocos na ordem decidida e avisos visíveis |
| **MUST** | Mapa pinta os setores do desenho por valor, com legenda |
| **MUST** | Bloco de classe social com rótulo "(estimada)", aviso junto da linha e a régua declarada |
| **MUST** | Zoneamento por interseção de área, com percentual do polígono em cada zona |
| **MUST** | Onde não há cobertura, o bloco **afirma a ausência** em vez de sumir |
| **MUST** | `obter_raio_x` como tool do chat no contexto de Raio-X |
| **MUST** | Síntese em template — nenhuma chamada de LLM para montar a tela |
| **SHOULD** | Folha de estilo de impressão |
| **SHOULD** | Perguntas curadas que levam a área ao chat |
| **COULD** | Bloco de saneamento exibido só quando desvia do município |

---

## Critérios de sucesso

- [ ] Um buffer de 500 m devolve o diagnóstico completo em **menos de 1 s** com cache
      quente (hoje o cruzamento sozinho custa 3 ms para 40 setores)
- [ ] O município de São Paulo como desenho — **27.719 setores, 1,32 s** medidos — não
      derruba a rota nem manda a lista inteira ao navegador
- [ ] A distribuição por setor mostra **mínimo, máximo e a população em cada faixa**, e
      cada setor da lista é clicável até o mapa
- [ ] Toda métrica da tela sai com o **valor do município** ao lado. Nenhum número
      aparece sozinho
- [ ] A população vem partida: **contidos** (fração ≥ 0,999, o limiar que já existe) e
      **rateados**, com o número de setores parciais
- [ ] `renda_mediana` **não aparece em lugar nenhum** — `_SEM_AGREGACAO` a recusa, e a
      síntese da versão anterior do brainstorm a citava
- [ ] Classe social sai como **composição A/B/C/DE** — quatro classes —, nunca como média
      de `classe_social_score`
- [ ] A tela **funciona inteira com o agente de chat fora do ar**; só o chat degrada
- [ ] O número que o chat cita é **o mesmo** que a tela mostra, para a mesma área
- [ ] Zoneamento devolve **percentual do polígono por zona** dentro de São Paulo, e a
      frase de ausência fora dela
- [ ] **Zero carga nova e zero escrita no `geodata`**

---

## Testes de aceite

| ID | Cenário | Dado | Quando | Então |
|----|---------|------|--------|-------|
| AT-001 | Polígono urbano típico | Área salva que corta vários setores | Gerar Raio-X | Blocos com valores, comparação municipal, distribuição por setor e avisos de rateio |
| AT-002 | Buffer, o pior caso da borda | Buffer de 500 m (40 setores, 30 parciais) | Gerar Raio-X | População partida; a fatia rateada é declarada em número, não em adjetivo |
| AT-003 | Área dentro de um setor só | Desenho contido em 1 setor | Gerar Raio-X | Diz na primeira dobra que o recorte está inteiro dentro de 1 setor de X ha, desenha a fronteira do setor e **não** exibe contraste interno |
| AT-004 | Desenho de ponto | Ponto salvo no acervo | Abrir o painel do desenho | A ação "Gerar Raio-X" não aparece; se chamada direto, a rota recusa com mensagem própria |
| AT-005 | Área acima do teto | Polígono maior que o limite | Gerar Raio-X | Recusa explicando o limite, sem timeout e sem 500 |
| AT-006 | Zoneamento com cobertura | Área dentro do município de SP | Gerar Raio-X | Bloco de regulação com o percentual do polígono em cada zona e a lei 18.177/2024 |
| AT-007 | Zoneamento sem cobertura | Área em São Caetano do Sul | Gerar Raio-X | O bloco existe e **afirma** que não há regulação carregada para aquele município |
| AT-008 | Acervo indisponível | `ACERVO_DSN` fora do ar | Gerar Raio-X | 503 com mensagem; mapa, camadas e busca seguem de pé |
| AT-009 | Agente de chat fora do ar | Processo do chat parado | Abrir um Raio-X | A tela renderiza inteira; só as perguntas curadas degradam |
| AT-010 | Coerência tela × chat | Um Raio-X aberto | Perguntar no chat sobre a mesma área | O chat cita os mesmos números, via `obter_raio_x`, sem reagregar |
| AT-011 | Classe social | Área qualquer | Ver o bloco | Rótulo "(estimada)", aviso do `_avisos_classe_social()` junto da linha, régua do Critério Brasil declarada — e nunca "segundo a ABEP" |
| AT-012 | Desenho inexistente | Id que não existe | `GET /api/raio-x/{id}` | 404 com mensagem, sem vazar erro de banco |

---

## Fora de escopo

- PDF, download, snapshot imutável, compartilhamento público e white-label.
- Empresas, CNPJ, POIs, concorrência, mobilidade e preço de imóvel.
- Score, semáforo ou recomendação de negócio de qualquer natureza.
- Agregação H3/CNEFE por área — é a correção do rateio, e é a fase seguinte.
- Zoneamento de outras cidades. O spike de São Caetano do Sul vem depois do MVP no ar.
- Saneamento como bloco fixo.
- Raio-X para desenho de ponto.
- Configuração por cliente do conteúdo do Raio-X; o núcleo é casca comum.

---

## Restrições

| Tipo | Restrição | Impacto |
|------|-----------|---------|
| Arquitetura | A geometria do cliente viaja como **parâmetro** da consulta no `geodata`; nada de `postgres_fdw` nem JOIN entre bancos | O contrato nasce da mesma fachada que o `cruzamento_por_geometria` usa hoje |
| Arquitetura | O `geodata` é **somente leitura** nesta feature | Zero carga, zero tabela nova, zero escrita |
| Arquitetura | Regra 8 do ADR: o que muda o sentido do número sai **junto do número** | Avisos de rateio, extensão, estimativa e cobertura são campos do contrato, não texto de componente |
| Produto | A tela não pode depender do LLM | A síntese é template e a rota não chama modelo |
| Dado | `renda_mediana` não se agrega sob área | A métrica não existe no contrato |
| Dado | Zoneamento cobre só o município de São Paulo (38 códigos, lei 18.177/2024) | Bloco condicional que declara ausência |
| Operação | O restart do systemd pede senha e só roda em terminal do Guilherme | A publicação do agente é passo dele, não do agente de IA |
| Operação | `make ship-app` não toca o agente | A rota precisa estar na VPS **antes** do bundle que a chama |

---

## Contexto técnico

| Aspecto | Valor | Notas |
|---------|-------|-------|
| **Onde o código mora** | `query/src/geo_query/queries.py` · `agent/src/geo_agent/rotas_raio_x.py` · `agent/src/geo_agent/tools.py` · `web/src/` | Router novo no molde do `rotas_desenhos.py`; a tela reaproveita a pintura por valor e a legenda que a `TELA_H3` deixou na casca |
| **KB** | `agentes-llm` (contrato de tool) · `maplibre` (pintura por valor) | `.claude/kb/` |
| **Impacto de infra** | **Nenhum** | Sem carga, sem tabela, sem tile, sem armazenamento. `GRANT` ao `geo_reader` só se o DESIGN criar objeto novo — o que não está previsto |

---

## Premissas

| ID | Premissa | Se estiver errada | Validada? |
|----|----------|-------------------|-----------|
| A-001 | Os tempos medidos neste Mac valem na VPS | Lá a memória é menor; a primeira execução **fria** de área grande custou 3,9 s aqui contra 640 ms quente. Pode obrigar a baixar o teto | [ ] Herdada do AGENTS.md, "Em aberto" |
| A-002 | A pintura por valor da `TELA_H3` serve com valores vindos da **consulta**, não do tile | Se não servir, o contraste interno precisa de caminho próprio no mapa e a Fase 3 cresce | [ ] |
| A-003 | Os desenhos reais dos clientes tocam dezenas de setores, não milhares | Se houver desenho gigante em uso, o teto vira recusa frequente em vez de guarda de exceção | [ ] |
| A-004 | `pct_classe_a/b/c/de` agrega por média ponderada em `domicilios_ocupados`, como o `_PESO_DA_MEDIA` já declara | Se a composição não fechar 100% sob a área, o bloco precisa de outra forma | [x] Lido em `queries.py:70` |
| A-005 | A interseção do zoneamento por área tem custo comparável ao do Censo | Se os 61.784 polígonos pesarem sob área grande, o bloco ganha teto próprio | [ ] |

---

## Clarity Score

| Elemento | Nota | Por quê |
|----------|------|---------|
| Problema | 3 | Dois problemas nomeados, um deles medido no próprio código |
| Usuários | 3 | Quatro, com a dor de cada um; a audiência da primeira dobra foi decidida |
| Objetivos | 3 | MUST/SHOULD/COULD separados, e o que é casca comum está dito |
| Sucesso | 3 | Onze critérios, com números vindos de medição e não de estimativa |
| Escopo | 3 | Fora de escopo explícito, incluindo o que foi cortado nesta revisão e por quê |
| **Total** | **15/15** | |

---

## Questões em aberto

**Nenhuma bloqueante.** As quatro do brainstorm foram fechadas:

1. **Audiência da primeira dobra** — avaliação de terreno e imóvel (Guilherme, 2026-09-07).
2. **Zoneamento por área** — entra no MVP (Guilherme, 2026-09-07).
3. **Payload e nome da área para a API do LLM** — resolvido por constatação, não por
   decisão nova: nomes de desenho já viajam hoje (`tools.py:752` recebe `nome`, e
   `listar` devolve a lista), e o payload é Censo público. O Raio-X não abre porta que já
   não esteja aberta. O que **não** pode passar a viajar é geometria bruta do cliente no
   prompt — o contrato manda números, não WKB.
4. **Métricas do contraste interno** — decidido aqui: mínimo, máximo e população por
   faixa, mais a lista de setores clicável. Índice de dispersão estatístico fica fora; o
   bloco existe para mostrar que há dois mercados, não para medir variância.

Para o `/design`: A-002 é a premissa que mais pode mexer no plano de trabalho, e vale
conferir antes de estimar a Fase 3.

---

## Histórico

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-09-07 | define (sessão Claude Code) | Versão inicial, a partir do brainstorm revisado |

---

## Próximo passo

**Pronto para:** `/design .claude/sdd/features/DEFINE_RAIO_X_DA_AREA.md`
