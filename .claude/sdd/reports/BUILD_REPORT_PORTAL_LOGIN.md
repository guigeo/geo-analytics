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
| **Status** | Construído — **não publicado** |
| **Arquivos** | 37 (12 criados, 25 modificados), em 3 repositórios |

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

## ⚠️ O que NÃO foi validado, e por quê

**O Docker está parado nesta máquina.** Isso deixa três coisas por verificar, e nenhuma
delas é opcional antes de publicar:

| Não validado | O que falta | Onde isso trava |
|--------------|-------------|-----------------|
| **O DDL nunca rodou** | `cargas/app_clientes.sh` foi escrito, não executado. As tabelas `usuario` e `sessao` não existem em banco nenhum | Passo 2 da publicação |
| **8 testes de banco pularam** | `test_contas.py` só roda com `ACERVO_DSN` e um `app_clientes` de pé. São justamente os que provam AT-005 (sair revoga), AT-006 (troca derruba as outras), expiração e CASCADE | Confiança na fachada |
| **`make preview` e `make ensaio`** | Os dois passam pelo build no container | Ver o Caddy sem portão servindo o app |

O que rodou sem banco: hash, tempo constante, o portão inteiro (com dublê), as rotas
(com dublê), e o front inteiro. O que a camada de banco faz de verdade — revogação,
expiração, CASCADE — está escrito e **não medido**.

**Para fechar:** subir o Docker, rodar `cargas/app_clientes.sh geo-analytics '<senha>'`
e depois `cd agent && ACERVO_DSN=... uv run pytest tests/test_contas.py`.

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

| ID | Cobertura | Estado |
|----|-----------|--------|
| AT-001 | `test_entrar_com_credencial_certa` | ✅ |
| AT-002 / AT-003 | Corpo: `test_senha_errada_e_email_inexistente_dao_a_mesma_resposta`. Tempo: `test_conta_inexistente_custa_o_mesmo_tempo_que_senha_errada` | ✅ |
| AT-004 | `test_obriga_a_trocar_a_senha_provisoria` (front) | ✅ |
| AT-005 | Rota: ✅. **Banco: pulou** (`test_sair_revoga_de_verdade`) | ⚠️ |
| AT-006 | Rota: ✅. **Banco: pulou** | ⚠️ |
| AT-007 | Sessão sobrevive ao restart | ⏳ só na VPS |
| **AT-008 (a §9)** | Parar o agente e navegar | ⏳ **só na VPS, e sem substituto automatizado** |
| AT-009 | `test_desenhos_so_responde_com_sessao` | ✅ |
| AT-010 | `test_health_responde_sem_sessao` | ✅ |
| AT-011 | `test_limite_por_ip_barra_forca_bruta` | ✅ |
| AT-012 | Fronteira de cliente (papel do Postgres) | ⏳ exige banco |
| AT-013 | Rota ✅; banco pulou | ⚠️ |
| AT-014 | `auth.test.tsx`, 2 casos | ✅ |
| AT-015 | `verificar-vps.sh` reescrito | ⏳ exige VPS |
| AT-016 | `caddy validate` | ⏳ exige o container |
| AT-017 | `grep PORTAO_` nos dois repositórios: só comentários históricos | ✅ |
| AT-018 | `verificar_portao_da_vps` — os 4 ramos exercitados | ✅ (lógica) / ⏳ (contra a VPS) |

---

## Premissas

| ID | Estado |
|----|--------|
| A-001 (custo do argon2 na VPS) | **Aberta.** Local: `m=65536,t=3,p=4` confirmado no hash gerado. Falta medir na VPS |
| A-002 (três consumidores do `/api`) | Fechada — os três tratam 401 |
| A-003 (nenhum consumidor externo) | Fechada |
| A-004 (30 dias) | Fechada pela D-9 |
| A-005 (o papel alcança as tabelas novas) | **Aberta** — depende do DDL rodar |

---

## Próximo passo

**NÃO é `/ship`.** Falta a validação que só acontece com Docker de pé e, depois, na VPS:

1. Subir o Docker, rodar o `app_clientes.sh` local e os 8 testes que pularam.
2. `make preview` — ver o Caddy sem portão servindo o app.
3. Só então a ordem de publicação em 7 passos do `AGENTS.md`, com o passo 4 (restart)
   num terminal de verdade do Guilherme.
