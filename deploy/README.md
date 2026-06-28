# Deploy — Geo Intelligence na VPS

Site **estático** (app MapLibre + tiles PMTiles), servido pelo **Caddy** (HTTPS
automático). Os tiles (~2 GB) sobem por **rsync** — não vão pelo git.

```text
navegador ──HTTPS──> Caddy (VPS Hetzner) ──> /var/www/geo  (app)
                                          └──> /var/www/geo/tiles/*.pmtiles
```

## Ambiente real (apurado em 2026-06-28)

| Item | Valor |
|------|-------|
| VPS  | Hetzner `91.99.176.140`, Ubuntu 26.04, 28 GB livres |
| SSH  | `ssh hetzner-gramos` (usuário `gramos`; `sudo` pede senha) |
| Caddy| **já instalado (2.6.2)**, servindo `invest-certo-dash.averisen.com` |
| DNS  | `averisen.com` no **Cloudflare** |
| Alvo | `geo-intelligence.averisen.com` |

> ⚠️ O Caddy é **compartilhado**: a config nova é **acrescentada**, nunca substitui o arquivo.

---

## Fase 2 — DNS no Cloudflare

No painel do Cloudflare → `averisen.com` → **DNS** → **Add record**:

| Campo | Valor |
|-------|-------|
| Type  | `A` |
| Name  | `geo-intelligence` |
| IPv4  | `91.99.176.140` |
| Proxy | **DNS only** (nuvem **cinza**, não laranja) |
| TTL   | Auto |

> A nuvem **cinza** é importante: deixa o Caddy emitir o certificado Let's Encrypt
> direto (o site existente já funciona assim). Proxy laranja fica pra depois (Fase 7).

Confira (na sua máquina):
```bash
dig +short geo-intelligence.averisen.com    # tem que retornar 91.99.176.140
```
✅ **Pronto quando** o `dig` devolve `91.99.176.140`.

---

## Fase 3 — Pasta do site na VPS  (você roda — tem `sudo`)

```bash
ssh hetzner-gramos
sudo mkdir -p /var/www/geo/tiles
sudo chown -R gramos:gramos /var/www/geo   # p/ o rsync escrever sem sudo
exit
```
✅ **Pronto quando** `/var/www/geo` existe e é do `gramos`.
*(Caddy já instalado e portas 80/443 já abertas — nada a fazer aqui.)*

---

## Fase 4 — Enviar app + tiles  (eu rodo, na sua máquina)

```bash
VPS_HOST=hetzner-gramos ./deploy/deploy.sh        # build + app + tiles
# alvos: ./deploy/deploy.sh app  |  tiles  |  all
```
O `rsync` usa o atalho `hetzner-gramos` do seu `~/.ssh/config` (chave, sem senha).
A 1ª remessa dos tiles (~2 GB) depende do seu **upload**; o rsync é incremental e retoma se cair.

✅ **Pronto quando** `ssh hetzner-gramos 'ls /var/www/geo'` mostra `index.html`, `assets/`, `tiles/`.

---

## Fase 5 — Acrescentar o site ao Caddy  (você roda — tem `sudo`)

```bash
# 1) (segurança) backup do Caddyfile atual
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)

# 2) acrescente o bloco do deploy/Caddyfile ao FINAL do arquivo
sudo nano /etc/caddy/Caddyfile
#   → cole o conteúdo de deploy/Caddyfile (bloco geo-intelligence.averisen.com)
#     ABAIXO do bloco existente. Não remova o invest-certo-dash.

# 3) valide a sintaxe e recarregue sem derrubar o site atual
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 4) acompanhe a emissão do certificado
journalctl -u caddy -f
```
✅ **Pronto quando** o log mostra o certificado de `geo-intelligence.averisen.com` emitido, sem erro.

---

## Fase 6 — Validar

```bash
curl -I https://geo-intelligence.averisen.com     # 200 OK + HTTPS
```
Abra **https://geo-intelligence.averisen.com**:
- mapa + basemap carregam;
- ligue as camadas (UF, Município, Antenas de telefonia…) → tiles vêm de `/tiles/*`;
- clique numa feição → painel de atributos; teste o toggle 🌗.

Se algo falhar, **DevTools (F12) → Network**: `/tiles/*.pmtiles` em 404 (não enviado)
ou 403 (permissão da pasta).

---

## Redeploys futuros
- **Só código:** `VPS_HOST=hetzner-gramos ./deploy/deploy.sh app`
- **Re-gerou tiles:** `VPS_HOST=hetzner-gramos ./deploy/deploy.sh tiles`

## Otimizações opcionais (Fase 7)
- **Encolher o basemap** (z13→z12): ~1.4 GB → ~400 MB. `pipeline/datasets.yaml` (`basemap.maxzoom`)
  + `docker compose run --rm pipeline build --basemap-only`.
- **Setor censitário** (593 MB) é a 2ª camada mais pesada — avalie se entra no deploy público.
- **Proxy do Cloudflare** (nuvem laranja) p/ CDN/DDoS — exige ajuste de SSL (Full) e cache.
