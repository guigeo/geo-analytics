# Deploy — Geo Intelligence na VPS

Site **estático** (app MapLibre + tiles PMTiles), servido por **Caddy** (HTTPS
automático). Os tiles (~2 GB) sobem por **rsync** — não vão pelo git.

```text
seu navegador ──HTTPS──> Caddy (VPS) ──> /var/www/geo  (app)
                                     └──> /var/www/geo/tiles/*.pmtiles
```

Antes de começar, tenha em mãos:

- **IP da VPS** (ex.: `203.0.113.10`)
- **Usuário SSH** com acesso (ex.: `root` ou um usuário `deploy`)
- **Seu domínio** (ex.: `geo.seudominio.com`) e acesso ao painel de DNS

> Faça **uma fase por vez** e confira o resultado antes de seguir.

---

## Fase 2 — Apontar o domínio

No painel de DNS do seu domínio, crie um registro:

| Tipo | Nome              | Valor (Aponta para) | TTL  |
|------|-------------------|---------------------|------|
| `A`  | `geo` (ou `@`)    | `IP_DA_VPS`         | 300  |

- `geo` → o site fica em `geo.seudominio.com`.
- `@` → fica no domínio raiz `seudominio.com`.

Confira a propagação (pode levar de minutos a algumas horas):

```bash
dig +short geo.seudominio.com      # deve retornar o IP da VPS
```

✅ **Pronto quando** o `dig` retorna o IP da VPS.

---

## Fase 3 — Preparar a VPS

Acesse a VPS via SSH e rode:

```bash
# 1) Firewall — libere SSH, HTTP e HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 2) Instale o Caddy (repo oficial)
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# 3) Pasta do site (com permissão para o seu usuário enviar via rsync)
sudo mkdir -p /var/www/geo/tiles
sudo chown -R "$USER":"$USER" /var/www/geo
```

✅ **Pronto quando** `caddy version` responde e `/var/www/geo` existe.

---

## Fase 4 — Enviar app + tiles (rsync)

**Na sua máquina** (raiz do repo). O script faz o build no container e envia tudo:

```bash
VPS_HOST=usuario@IP_DA_VPS ./deploy/deploy.sh
```

- `./deploy/deploy.sh app`   → só o frontend (redeploys rápidos de código)
- `./deploy/deploy.sh tiles` → só os tiles (~2 GB; a 1ª vez demora, depois é incremental)

> O primeiro envio dos tiles depende da sua velocidade de **upload**.
> Pode rodar à noite; o rsync retoma de onde parou se cair.

✅ **Pronto quando** `ls /var/www/geo` (na VPS) mostra `index.html`, `assets/` e `tiles/`.

---

## Fase 5 — Configurar o Caddy (HTTPS automático)

Na VPS, instale o Caddyfile do repo (já enviado? senão cole o conteúdo de
`deploy/Caddyfile`) e troque o domínio:

```bash
sudo cp /var/www/geo/Caddyfile /etc/caddy/Caddyfile 2>/dev/null || sudo nano /etc/caddy/Caddyfile
sudo sed -i 's/SEU_DOMINIO/geo.seudominio.com/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

O Caddy detecta o domínio, fala com o Let's Encrypt e emite o certificado sozinho
(precisa das portas 80/443 abertas e do DNS já apontando — Fases 2 e 3).

Acompanhe:

```bash
sudo systemctl status caddy
journalctl -u caddy -f          # veja a emissão do certificado em tempo real
```

✅ **Pronto quando** o log mostra o certificado obtido, sem erros.

---

## Fase 6 — Validar

```bash
curl -I https://geo.seudominio.com            # 200 OK + HTTPS
```

Abra **https://geo.seudominio.com** no navegador:

- O mapa carrega e o basemap aparece.
- Ligue as camadas (UF, Município, Antenas de telefonia…) — os tiles vêm de `/tiles/*`.
- Clique numa feição → painel de atributos.
- Teste o toggle de tema 🌗.

Se algo não carregar, abra o **DevTools (F12) → Network** e veja se algum
`/tiles/*.pmtiles` deu 404 (arquivo não enviado) ou 403 (permissão).

---

## Redeploys futuros

- **Mudou só código:** `VPS_HOST=usuario@IP ./deploy/deploy.sh app`
- **Re-gerou tiles:** `VPS_HOST=usuario@IP ./deploy/deploy.sh tiles`

## Otimizações opcionais (Fase 7)

- **Encolher o basemap** (z13→z12) corta ~1.4 GB → ~400 MB. Ver `pipeline/datasets.yaml`
  (`basemap.maxzoom`) + `docker compose run --rm pipeline build --basemap-only`.
- **Setor censitário** (593 MB) é a 2ª camada mais pesada — avalie se precisa no deploy público.
