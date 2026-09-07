# BRAINSTORM: Raio-X da Área

> Proposta de MVP para transformar uma área desenhada em um diagnóstico territorial
> verificável. Documento de produto para debate e enriquecimento; não autoriza
> implementação, carga de dados ou publicação.

## Metadados

| Atributo | Valor |
|---|---|
| **Feature** | `RAIO_X_DA_AREA` |
| **Data** | 2026-09-07 |
| **Autor** | Codex, a partir da conversa com Guilherme Ramos |
| **Status** | Pronto para `/define`, sujeito a revisão de produto |
| **Decisão transversal** | Emenda de 2026-09-07 ao ADR-0001 no `webgis` |

---

## Ideia e tese de produto

O GeoIntelligence deixa de pedir que a pessoa saiba quais camadas ligar ou quais
perguntas formular. Ao desenhar, salvar ou selecionar uma área, ela recebe um
**Raio-X da Área**: uma leitura territorial curta, verificável e navegável no mapa.

O primeiro produto não promete "viabilidade comercial", "fluxo" ou "potencial de
venda". Com o dado atual, ele descreve com segurança **quem mora na área, qual é a
escala residencial, como é a infraestrutura domiciliar e qual a qualidade dessa
leitura**. Isso é útil por si só e cria a superfície certa para acrescentar, depois,
oferta, acessibilidade, regulação e lentes de negócio.

O PDF de relatório rural analisado nesta conversa é referência de comportamento,
não de escopo: começa por uma síntese executiva, desdobra evidências temáticas,
expõe fonte/data/limites e deixa o mapa provar o que afirma. O Raio-X deve seguir
essa disciplina urbana sem copiar as categorias do agronegócio.

### Objetivo do MVP

Em menos de um minuto, uma pessoa autenticada desenha ou escolhe uma área salva e
entende o perfil territorial dela sem depender do chat. O chat passa a explicar e
aprofundar um diagnóstico que já está estruturado, não a inventar o diagnóstico.

### Perguntas que o MVP responde

- Qual é a área, quantos setores ela toca e quão confiável é a agregação?
- Quantas pessoas e domicílios há no recorte?
- Qual é a densidade e o perfil de ocupação residencial?
- Qual é a renda disponível no Censo e a posição socioeconômica estimada, com a
  marca de estimativa preservada?
- Como estão água, esgoto e coleta de lixo?
- O que esses números descrevem e o que eles **não** permitem concluir?

### Perguntas explicitamente fora do MVP

- Há fluxo de pedestres, carros ou pessoas suficiente para um negócio?
- Quantas empresas, concorrentes ou consumidores existem no entorno?
- Esta área é boa para farmácia, posto, varejo ou incorporação?
- Há disponibilidade ou preço imobiliário favorável?

Essas perguntas exigem fontes novas e uma regra de negócio explícita. Respondê-las
com população e renda apenas produziria um "score" persuasivo, mas sem fundamento.

---

## Inventário que já existe

| Capacidade existente | Uso no Raio-X | Limite que deve aparecer ao usuário |
|---|---|---|
| Desenhos, buffers e polígonos salvos no `app_clientes` | Identidade e geometria da área analisada | É dado do cliente; não pode ir para o `geodata` |
| `cruzamento_por_geometria` no PostGIS | Agregação espacial exata dos setores cortados pelo polígono | Borda usa rateio areal e precisa declarar a fração afetada |
| Censo 2022 curado | População, domicílios, densidade, renda, saneamento e composição disponível | Retrato de 2022, não medição atual |
| Classe social estimada | Leitura socioeconômica complementar | Não é dado publicado pelo IBGE; rótulo e aviso são obrigatórios |
| H3 + CNEFE | Próxima leitura de ambiente construído: casas, apartamentos e domicílios | Hoje a tool consulta uma célula por ponto e cobre 37 municípios do recorte SP |
| Chat com tools e grounding | Explicar, comparar e responder perguntas sobre a área | Não calcula nem decide alertas; consome o diagnóstico determinístico |
| Mapa, seleção e acervo | Mostrar a geometria e levar cada achado à evidência geográfica | PMTiles é entrega visual, não fonte analítica do relatório |

O MVP pode nascer sem uma carga nova: o primeiro bloco é Censo + área desenhada.
H3/CNEFE entra como incremento somente depois de existir agregação por geometria,
com sua cobertura e qualidade declaradas.

---

## Experiência proposta

1. A pessoa desenha, escolhe ou abre uma área já salva.
2. O painel de atributos exibe a ação **Gerar Raio-X**.
3. A aplicação abre uma página/painel de diagnóstico para aquela área, composta por
   dados estruturados e não por uma mensagem de chat.
4. A primeira dobra traz uma síntese: dimensão, população, domicílios, densidade e
   o principal aviso de qualidade.
5. Blocos temáticos mostram Pessoas e domicílios; Renda e perfil socioeconômico;
   Infraestrutura domiciliar; Qualidade e cobertura.
6. Cada bloco tem fonte, ano, método e uma ação para localizar/entender o dado no
   mapa. Perguntas curadas levam o contexto ao chat, por exemplo: "compare esta área
   com o município" ou "explique a leitura de renda".
7. A área e o diagnóstico podem ser revisitados. O MVP não gera PDF nem cria uma
   cópia permanente do resultado.

### Forma da síntese

A síntese deve conter fatos, não recomendação de negócio. Exemplo de forma, não de
texto fixo:

> Área de X ha, com Y habitantes e Z domicílios segundo o Censo 2022. A densidade
> é de N hab/km² e a renda mediana do responsável é R$. A leitura usa K setores;
> P% da população resulta de setores cortados parcialmente pelo polígono.

O LLM pode reescrever essa síntese em português natural, mas números, avisos,
fonte e data vêm do objeto de diagnóstico. Não há semáforo, nota ou "oportunidade"
no núcleo universal.

---

## Abordagens consideradas

### A. Raio-X determinístico na tela, PDF depois — **recomendada**

Uma API de análise de área devolve um contrato estruturado; a UI compõe o
diagnóstico; o chat recebe esse mesmo contexto.

**Por que escolher:** prova valor com o dado existente, mantém todos os números
auditáveis e permite descobrir quais blocos são realmente usados antes de investir
em uma máquina de PDFs, novos dados ou scores.

**Custo:** não entrega imediatamente um artefato para encaminhar por e-mail.

### B. Gerar primeiro um PDF extenso

Produzir um laudo de 20+ páginas diretamente a partir do desenho.

**Rejeitada para o MVP:** congela conteúdo antes de saber o que importa, cria dois
produtos (tela e PDF), requer fila/worker/armazenamento e pode dar aparência de
laudo a um retrato ainda limitado de Censo.

### C. Abrir primeiro dezenas de novas camadas e um score de oportunidade

Adicionar empresas, POIs, mobilidade e regras para cada vertical antes de lançar a
experiência de área.

**Rejeitada para o MVP:** demora a primeira demonstração, mistura hipóteses de
negócio com dado universal e esconde qual fonte realmente mudou a decisão.

---

## Plano de execução proposto

### Fase 0 — Definição e protótipo de produto

**Resultado:** uma narrativa e wireframe aprovados para o Raio-X, com uma área real
de demonstração e nenhuma alteração de código.

- Escolher o nome de produto, os quatro blocos iniciais e o tom da síntese.
- Definir um exemplo de área urbana e três perguntas de validação com usuários.
- Conferir, campo a campo, quais métricas do Censo curado entram na primeira tela.
- Fechar os textos obrigatórios de fonte, ano, estimativa e rateio.
- Desenhar estados sem dados, área muito pequena, área muito extensa e acervo
  indisponível.

**Critério de saída:** alguém consegue olhar o wireframe e dizer o que a área
descreve, sem confundir o resultado com recomendação comercial.

### Fase 1 — Núcleo determinístico de diagnóstico

**Resultado:** `DiagnosticoArea`, um contrato de backend versionado que representa
o Raio-X para uma geometria salva.

- Extrair da tool atual de área desenhada uma fachada de análise própria, sem chamar
  modelo de linguagem.
- Fixar as métricas do MVP; a API não aceita campo arbitrário do navegador.
- Devolver área, contagem de setores, valores, avisos de borda/extensão, fonte,
  período e método para cada bloco.
- Preservar como dado os avisos de rateio e de estimativa de classe social.
- Cobrir em testes uma área interna a um setor, uma área que corta setores, uma área
  extensa, desenho inexistente e acervo indisponível.

**Não entra:** H3 agregado, PDF, scores, nova carga ou mudança no `geodata`.

### Fase 2 — Tela de Raio-X e chat contextual

**Resultado:** uma pessoa vê o diagnóstico de uma área salva e consegue aprofundar
um achado no chat.

- Criar a ação no acervo e uma rota de interface para o diagnóstico.
- Renderizar os blocos estruturados, com números, unidades e avisos visíveis.
- Permitir focar a geometria e retornar ao mapa sem duplicar fontes de verdade.
- Transformar perguntas curadas em mensagens de chat com referência explícita à
  área, em vez de pedir que o LLM descubra a intenção pelo nome do desenho.
- Validar em desktop e celular; validar que o agente fora do ar degrada a ação sem
  derrubar mapa, camadas ou áreas já visíveis.

**Não entra:** geração ou persistência de relatório final.

### Fase 3 — Piloto e seletividade

**Resultado:** evidência para decidir a próxima camada, não uma lista genérica de
dados a carregar.

- Usar o Raio-X em áreas reais com o cliente inicial e convidados de teste.
- Registrar quais blocos foram abertos, quais perguntas foram feitas e o que faltou
  para a pessoa tomar a decisão dela.
- Coletar exemplos de perguntas não respondidas, classificando-as em oferta,
  acessibilidade, regulação, dinâmica ou dado específico do cliente.
- Revisar o benchmark do agente com perguntas do Raio-X.

**Critério de saída:** escolher uma única lente adicional por evidência de uso, não
por disponibilidade de dado.

### Fase 4 — Primeiro enriquecimento: ambiente construído

**Resultado:** o Raio-X passa a responder como a área se organiza em casas e
apartamentos onde o H3/CNEFE cobre.

- Implementar agregação H3 por geometria, sem tratar célula fora de cobertura como
  zero.
- Entregar totais, proporções e qualidade das coordenadas em contrato próprio.
- Declarar o recorte de 37 municípios e o caráter medido/estimado de cada métrica.
- Acrescentar o bloco ao Raio-X somente quando a fonte e o mapa suportarem a mesma
  leitura.

### Fase 5 — Página compartilhável e PDF

**Gatilho:** pessoas demonstram que precisam encaminhar o diagnóstico e a tela já
tem blocos estáveis.

- Persistir um *snapshot* imutável dos dados, fontes, versão de cálculo e geometria
  usados no diagnóstico.
- Criar página compartilhável autenticada antes do download.
- Gerar PDF a partir do mesmo contrato visual, por job assíncrono.
- Armazenar metadados/snapshot no `app_clientes` e o arquivo em armazenamento de
  objetos; não colocar binário ou dado do cliente no `geodata`.
- Definir retenção, acesso, marca do cliente e limite de geração.

Essa fase exige desenho de infraestrutura e emenda adicional do ADR antes de
implementação.

---

## Arquitetura-alvo de longo prazo

```text
geometria salva (app_clientes)
            ↓
motor de diagnóstico espacial (geodata, somente leitura)
            ↓
contrato estruturado: dados + evidências + avisos + proveniência
       ┌────┼────┐
       ↓    ↓    ↓
     mapa  chat  página/PDF
```

O motor universal não conhece "farmácia", "posto" ou outro negócio. Ele expõe
lentes territoriais verificáveis. Uma lente de negócio é uma configuração e regras
explícitas do cliente sobre esse núcleo — e só entra depois de haver a fonte que a
sustente.

### Próximas famílias de dado, condicionadas a pergunta validada

| Família | Perguntas que pode responder | Estado |
|---|---|---|
| Ambiente construído (H3/CNEFE) | Casas, apartamentos, domicílios e qualidade de geocodificação | Primeiro enriquecimento proposto |
| POIs e estabelecimentos | Oferta, concorrência e equipamentos próximos | Não carregada |
| Acessibilidade e transporte | Proximidade, rede, tempo e acesso a polos | Não carregada |
| Regulação local | Uso permitido, restrições e risco urbano | Zoneamento somente em São Paulo, por ponto |
| Dinâmica/mobilidade | Fluxos e mudança no tempo | Não carregada; não inferir do Censo |
| Dados próprios do cliente | Cobertura, unidades, resultado e carteira | Fica no `app_clientes`, nunca no banco central |

---

## Decisões já tomadas nesta exploração

| Decisão | Motivo |
|---|---|
| Começar pela tela, não pelo PDF | Validar conteúdo e experiência antes de criar infraestrutura de documento |
| Diagnóstico é determinístico; chat o explica | Números, fontes e ressalvas não podem depender de prompt |
| MVP usa Censo + área desenhada existentes | Cria demonstração real agora e reduz escopo |
| Não produzir score ou recomendação de negócio universal | Oportunidade depende de tese e dado que ainda não existe |
| H3 é o primeiro enriquecimento, não requisito de lançamento | Hoje é consulta por ponto; agregação de área precisa ser construída e validada |
| Dados do cliente continuam separados | Preserva o `geodata` reconstruível e o isolamento entre clientes |

## Fora de escopo confirmado para o MVP

- PDF, download, compartilhamento público e white-label.
- Empresas, CNPJ, POIs, concorrência, mobilidade e preço de imóvel.
- Score, semáforo ou recomendação de negócio.
- Novo pipeline nacional de dados e expansão da VPS.
- Alteração de configuração por cliente; o núcleo inicial é casca comum.

## Métricas de aprendizagem do piloto

- Percentual de áreas salvas que geram Raio-X.
- Tempo entre desenho e primeira leitura útil.
- Blocos abertos e perguntas curadas acionadas.
- Perguntas que o produto não responde, classificadas por família de dado.
- Diagnósticos compartilhados ou solicitados em formato de documento.
- Relato qualitativo: qual decisão a pessoa conseguiu adiantar ou qual evidência
  ainda faltou.

## Questões para enriquecer no `/define`

1. Qual será a primeira audiência de demonstração: incorporador, varejo, consultor
   territorial ou usuário generalista?
2. Quais quatro indicadores, entre os existentes, precisam estar obrigatoriamente na
   primeira dobra para essa audiência?
3. O diagnóstico deve existir para ponto e buffer, ou só para áreas poligonais no
   primeiro recorte?
4. Qual é o nível de compartilhamento aceitável: apenas usuários do mesmo cliente,
   link autenticado ou exportação posterior?
5. Que decisão concreta a pessoa deveria conseguir tomar ou encaminhar depois de
   ver o Raio-X?

## Próximo passo

**Pronto para:** `/define .claude/sdd/features/BRAINSTORM_RAIO_X_DA_AREA.md`

Antes do `/design`, qualquer decisão que acrescente armazenamento de relatório,
fila/worker ou fonte universal nova deve virar emenda do ADR-0001 no `webgis`.
