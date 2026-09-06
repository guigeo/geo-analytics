# BUILD REPORT: PORTAL_LOGIN

> O que foi construído, o que foi validado de verdade, e o que **não** pôde ser validado
> nesta máquina

## Metadata

| Atributo | Valor |
|----------|-------|
| **Feature** | PORTAL_LOGIN |
| **Data** | 2026-09-06 |
| **Autor** | build (sessão Claude Code) |
| **Entrada** | `DESIGN_PORTAL_LOGIN.md` (`1f99e40`) |
| **Status** | Construído e **validado localmente** — não publicado |
| **Arquivos** | 37 (12 criados, 25 modificados), em 3 repositórios |
| **Validação** | 2026-09-06, com Docker de pé: DDL aplicado, 160 testes, fluxo ponta a ponta contra o agente e o banco |

---

## Resultado dos portões

| Portão | Comando | Resultado |
|--------|---------|-----------|
| Testes do agente | `cd agent && uv run pytest` | **75 passaram**, 85 pularam (dependem de banco), 34 fora do run padrão (benchmark) |
| Lint do agente | `uv run ruff check .` | limpo |
| Testes do front | `cd web && npx vitest run` | **224 passaram** (22 arquivos) |
| Typecheck do front | `npx tsc --noEmit` | limpo |
| Lint do front | `npx eslint . --max-warnings 0` | limpo |
| Formato do front | `npx prettier --check .` | limpo |
| Build do front | `npx vite build` | passou (o aviso de tamanho de chunk é anterior a esta feature) |
| Sintaxe dos scripts | `bash -n` nos 7 tocados | limpo |

**Dos 37 arquivos, 32 são novos ou modificados por esta feature e 5 são consequência
descoberta durante o build** — ver "Além do manifesto".

---

## Validação com o banco de pé (2026-09-06, segunda passada)

O Docker subiu e fechou quase tudo que a primeira passada deixou aberto.

| O que | Resultado |
|-------|-----------|
| **O DDL rodou** | `app_clientes.sh` nos dois clientes, local. As 6 tabelas existem (`desenho`, `usuario`, `sessao` × 2 schemas) |
| **Idempotência** | Rodado de novo: 0 erros, nada muda |
| **Suíte completa do agente** | **160 passaram, 0 pularam** (com `ACERVO_DSN` e `GEODATA_DSN`) |
| **AT-005 — sair revoga** | 200 → `sair` 204 → **o mesmo cookie devolve 401** |
| **AT-006 — troca derruba as outras** | Duas sessões; troca no aparelho A: **A continua 200, B cai para 401**. Senha provisória passa a dar 401, a nova dá 200 |
| **AT-007 — restart não desloga** | Processo morto e subido de novo: o mesmo cookie devolve **200** |
| **AT-008 (a §9)** | Agente parado: `/` **200**, bundle **200**, tiles **206**, `/api/chat` **502**. Degrada, não derruba |
| **AT-009 / AT-010** | Sem sessão: `chat` 401, `desenhos` 401, `geocode` 401, **`health` 200** |
| **AT-002 / AT-003** | Senha errada e conta inexistente devolvem corpo **byte a byte idêntico** |
| **AT-011** | `401 401 401 429 429 …` com `retry-after: 260` |
| **D-2 — acervo obrigatório** | O `lifespan` levanta `RuntimeError` com a mensagem que explica por quê |
| **`criar-usuario.sh`** | Criou, imprimiu a provisória, **recusou o e-mail repetido**, e `--listar` funciona |
| **Preview sem portão** | `make preview` serve `/` em **200 sem credencial** — antes era 401 |
| **CASCADE** | Apagar a conta levou a sessão junto; os 2 desenhos ficaram intactos |

**A-001, medido neste Mac** (a medição que conta continua sendo a da VPS):

| Parâmetros | Custo por verificação |
|---|---|
| `m=64 MiB t=3 p=4` (o padrão) | **28,0 ms** |
| `m=32 MiB t=3 p=4` | 11,5 ms |
| `m=16 MiB t=2 p=2` | 6,9 ms |

O pico de memória é por verificação e o limite por IP é de 10 tentativas em 300 s, então
64 MiB não ameaça os 3,7 GB da VPS. O que falta medir lá é a CPU — se passar de uns
200 ms, `ARGON2_MEMORIA_KIB=32768` está no `.env` para isso.

**O que continua só na VPS:** AT-012 (fronteira entre clientes em produção), AT-015
(`verificar-vps.sh` contra os domínios reais), AT-016 (`caddy validate` no 2.6.2) e
AT-018 contra a VPS de verdade.

---

## 🐛 Um defeito que o build introduziu, e um que ele revelou

**O que aconteceu:** a primeira execução do `app_clientes.sh` morreu com
`ERROR: syntax error at or near "2"`, citando uma linha que falava de
`cliente_eb_prime … 2 desenho(s), 2 de carga` — texto que não existe naquele script.

**A causa:** o heredoc do SQL é `<<-SQL` com delimitador **não quotado** — e não pode ser
quotado, porque `${SCHEMA}` e `${PAPEL}` precisam expandir. Então o bash trata **crase
como substituição de comando** antes de o psql ver a linha. Um comentário que escrevi
citava `` `scripts/backup-acervo.sh` `` entre crases, e o bash **executou o script**: o
backup rodou sozinho no meio da carga e a saída dele foi parar dentro do SQL.

**O efeito colateral:** um backup local do acervo foi gerado sem ninguém pedir
(`app_clientes-local-2026-09-06.sql.gz`). Local, não VPS; a rotação guarda 12 cópias, e
o arquivo é um backup válido. Nada se perdeu — mas não era para ter acontecido.

**O defeito mais velho que isso revelou:** as duas crases em volta de `public`, no bloco
de GRANTs, **já estavam lá antes desta feature** e já vinham fazendo o bash rodar
`public` — comando que não existe. O resultado era o comentário sair mutilado
(`-- O  perde so o CREATE`) e um `command not found` no stderr. Passou despercebido por
anos-luz de commits porque o alvo era só um comentário. Provado nesta sessão:

```console
$ bash -c 'cat <<-SQL
	-- O `public` perde so o CREATE, nunca o USAGE.
SQL'
bash: public: command not found
-- O  perde so o CREATE, nunca o USAGE.
```

**A correção:** as 4 crases dentro do heredoc viraram aspas simples, e um aviso de 12
linhas ficou logo acima do `<<-SQL`, onde quem for editar vai ler. Depois disso o script
rodou limpo nos dois clientes.

---

## Além do manifesto: o que o build descobriu

Cinco coisas que o design não previu, todas achadas por rodar em vez de presumir.

### 1. O cookie `Secure` derrubou seis testes, e a lição é a D-6

Os testes de rota falhavam porque **o httpx não guarda cookie `Secure` em `http://`** —
exatamente como navegador nenhum guarda. O padrão do `Settings` é ligado, e o TestClient
fala HTTP.

A correção não foi baixar o padrão: a fixture desliga o `Secure` como o `.env` de
desenvolvimento desliga, e um teste novo (`test_secure_e_ligado_por_padrao`) afirma que o
**padrão** continua ligado — para que o desligamento do teste não possa esconder uma
regressão no valor que vale em produção.

### 2. A ordem dos middlewares é o contrário do que a leitura sugere

O `add_middleware` do Starlette **insere no início** da pilha: quem é adicionado por
último fica por fora. Como o design exige o `ContextoDaRequisicao` por fora (para que um
401 do portão saia com `X-Request-ID`), o `ExigeSessao` teve de ser adicionado **antes**
dele no código. Verificado por medição, não por leitura:

```text
ContextoDaRequisicao   ← mais externo, vê a requisição primeiro
ExigeSessao
```

### 3. `deploy/Caddyfile.local` também tinha portão — arquivo 35

O manifesto listou o `Caddyfile.modelo` e esqueceu o do preview, que tinha o próprio
`basic_auth` (`previa` / `previa-local`). Ele saiu junto, e tinha de sair: o preview
existe para mostrar **exatamente** o que a VPS vai servir, e um preview que pede senha
onde a produção não pede deixaria de cumprir a única função que tem.

### 4. Há node no host, e o `AGENTS.md` dizia que não — arquivo 36

O `AGENTS.md` afirma "NÃO há node no host — usar o container". Há: **v26.7.0**, com
`node_modules` instalado. É o que permitiu rodar o portão inteiro do frontend com o
Docker parado. A linha foi corrigida, com a data em que se mediu.

### 5. `@testing-library/user-event` não está instalado

O teste do front foi escrito com ele e reescrito com `fireEvent`, que já existe.
Dependência nova por um teste não se justifica num projeto que conta as suas.

---

## Manifesto executado

### `geo-analytics` — agente (11)

| Arquivo | Ação | Nota |
|---------|------|------|
| `agent/pyproject.toml` + `uv.lock` | Modificar | `argon2-cffi 25.1.0` — a única dependência nova |
| `agent/src/geo_agent/contas.py` | Criar | Fachada de conta e sessão; hash de descarte para o tempo constante |
| `agent/src/geo_agent/sessao.py` | Criar | Middleware `ExigeSessao` + `LIVRES` |
| `agent/src/geo_agent/rotas_auth.py` | Criar | `/entrar`, `/sair`, `/senha`, `/eu` |
| `agent/src/geo_agent/schemas.py` | Modificar | `Entrar`, `TrocaDeSenha`, `Eu` |
| `agent/src/geo_agent/config.py` | Modificar | 7 chaves novas; e o comentário do `acervo_dsn`, que a D-2 tornou falso |
| `agent/src/geo_agent/main.py` | Modificar | Acervo obrigatório, `Contas` no lifespan, middleware e router |
| `agent/.env.example` | Modificar | Sai `PORTAO_CREDENCIAL`; entram as 7 novas |
| `agent/tests/test_contas.py` | Criar | 15 casos (7 rodam sem banco, 8 pulam) |
| `agent/tests/test_sessao.py` | Criar | 9 casos, incluindo a allowlist congelada e "rota nova nasce fechada" |
| `agent/tests/test_rotas_auth.py` | Criar | 15 casos |

### `geo-analytics` — frontend (11)

| Arquivo | Ação | Nota |
|---------|------|------|
| `web/src/auth/api.ts` | Criar | Cliente + o registro de "a sessão caiu", num lugar só |
| `web/src/auth/contexto.ts` | Criar | **Não previsto**: separado de `sessao.tsx` porque o `react-refresh` exige que um arquivo exporte só componentes, e o lint é `--max-warnings 0` |
| `web/src/auth/sessao.tsx` | Criar | O `ProvedorDeSessao` |
| `web/src/auth/Moldura.tsx` | Criar | **Não previsto**: a marca do cliente, comum às duas telas |
| `web/src/auth/Entrar.tsx` | Criar | |
| `web/src/auth/TrocarSenha.tsx` | Criar | Serve à obrigatória e à voluntária |
| `web/src/auth/MenuDaConta.tsx` | Criar | **Não previsto**: o design dizia "Header.tsx modificar", e o menu virou componente próprio |
| `web/src/auth/auth.test.tsx` | Criar | 8 casos, incluindo AT-014 e o vazamento de nome entre clientes |
| `web/src/main.tsx` | Modificar | `<ProvedorDeSessao>` envolve o `<App/>` |
| `web/src/components/Header.tsx` | Modificar | O menu da conta |
| `web/src/chat/api.ts`, `desenho/api.ts`, `search/geocode.ts` | Modificar | 401 nos **três** |

### `geo-analytics` — deploy (8)

| Arquivo | Ação | Nota |
|---------|------|------|
| `deploy/Caddyfile.modelo` | Modificar | **Só remoção**, como a D-5 previu |
| `deploy/Caddyfile.local` | Modificar | Arquivo 35, achado no build |
| `deploy/clientes/*.env` (2) | Modificar | `PORTAO_USUARIO`/`PORTAO_HASH` saíram |
| `deploy/carregar-cliente.sh` | Modificar | Deixa de definir as duas |
| `deploy/vigia-app.sh` | Modificar | Sem credencial; **afirma o par**; e alerta que acervo fora do ar = ninguém entra |
| `deploy/setup-agente-vps.sh` | Modificar | Imprime o par como teste |
| `deploy/deploy.sh` | Modificar | `verificar_portao_da_vps` antes do `push_app` (D-7) |
| `deploy/README.md` | Modificar | Seção nova: a primeira conta de um cliente |
| `AGENTS.md` | Modificar | "Construído e NÃO publicado", com a ordem em 7 passos |

### `servidor-dados-gis` (3)

| Arquivo | Ação | Nota |
|---------|------|------|
| `cargas/app_clientes.sh` | Modificar | `usuario` e `sessao` — **escrito, não executado** |
| `scripts/criar-usuario.sh` | Criar | Cria, reseta e lista; hash via `uv run --with argon2-cffi` |
| `scripts/backup-acervo.sh` | Modificar | O LEIA-ME embutido passa a avisar que o dump contém hash de senha |

### `webgis` (2)

| Arquivo | Ação | Nota |
|---------|------|------|
| `scripts/verificar-vps.sh` | Modificar | **A correção 2 do DEFINE**: afirma `/` 200 **e** `/api/auth/eu` 401 |
| `docs/VPS.md` | Modificar | O portão descrito como par; e a armadilha do Caddy 2.6.2, que esta feature dissolveu por acidente |

---

## Testes de aceitação

| ID | Estado | Como se verificou |
|----|--------|-------------------|
| AT-001 | ✅ | teste + `curl` real |
| AT-002 / AT-003 | ✅ | corpo idêntico (`curl`) + tempo constante (teste) |
| AT-004 | ✅ | teste do front |
| AT-005 | ✅ | teste com banco **e** `curl`: cookie antigo → 401 |
| AT-006 | ✅ | teste com banco **e** `curl`: A fica, B cai |
| AT-007 | ✅ | processo morto e subido; mesmo cookie → 200 |
| **AT-008 (a §9)** | ✅ *(local)* | agente parado: `/` 200, bundle 200, tiles 206, `/api/chat` 502 |
| AT-009 | ✅ | as três rotas em 401 sem sessão |
| AT-010 | ✅ | `/api/health` 200 sem sessão |
| AT-011 | ✅ | `401 401 401 429…` com `retry-after` |
| AT-012 | ⏳ | exige os dois papéis em produção |
| AT-013 | ✅ | teste com banco |
| AT-014 | ✅ | 2 testes do front |
| AT-015 | ⏳ | `verificar-vps.sh` contra os domínios reais |
| AT-016 | ⏳ | `caddy validate` no 2.6.2 da VPS |
| AT-017 | ✅ | `grep PORTAO_`: só comentários históricos |
| AT-018 | ✅ *(lógica)* / ⏳ *(VPS)* | os 4 ramos exercitados |

---

## Premissas

| ID | Estado |
|----|--------|
| A-001 (custo do argon2 na VPS) | **Aberta, mas com base.** Neste Mac: 28,0 ms no padrão. Falta a VPS, que é a medição que conta |
| A-002 (três consumidores do `/api`) | Fechada — os três tratam 401 |
| A-003 (nenhum consumidor externo) | Fechada |
| A-004 (30 dias) | Fechada pela D-9 |
| A-005 (o papel alcança as tabelas novas) | **Fechada** — o DDL rodou e o agente leu e escreveu nas duas tabelas com o papel do cliente |

---

## Próximo passo

O que faltava com o Docker parado está fechado. O que resta é a VPS, na ordem de 7
passos do `AGENTS.md` — com o passo 4 (`restart` do systemd) e a medição do argon2 num
terminal de verdade do Guilherme.
