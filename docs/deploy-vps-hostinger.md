# Migração do backend para VPS Hostinger (Docker Compose)

Criado em 2026-10-15. Substitui a stack descrita em `docs/deploy-cloud-run-neon.md` (Cloud Run + Neon +
Cloud Storage + Secret Manager) por uma VPS só, com Docker Compose. O `apps/web` **continua na Netlify**
(só muda a URL da API); dá pra trazê-lo pra VPS depois, se valer a pena.

**Por quê:** o Cloud Run exigiu gambiarras pro Socket.IO (`max-instances=1`, `timeout=3600`, session
affinity), o Neon tem cold start ("Can't reach database server" na primeira conexão), e a instância mínima
sempre ligada já deixou de ser "free". Na VPS o processo é contínuo, o banco é local e o custo é fixo.

**Em troca, passa a ser nossa responsabilidade:** backup do banco (seção 5 — não pular), atualizações do
sistema e monitoramento de disponibilidade.

A ordem das seções é a ordem de execução.

---

## 0. Arquitetura alvo

```
apps/web (Netlify — zhivago.com.br / zhivag0.netlify.app — sem mudança, só NEXT_PUBLIC_API_URL)
        │
        ▼  https://api.zhivago.com.br
┌──────────────── VPS Hostinger (Ubuntu 24.04, Docker Compose) ────────────────┐
│  caddy (80/443, HTTPS automático) ──► api (apps/server, porta 8080)         │
│                                         │            │                       │
│                                         ▼            ▼                       │
│                              db (postgres:18)   ./uploads (disco)            │
└──────────────────────────────────────────────────────────────────────────────┘
        │  backup diário (pg_dump + uploads) via rclone
        ▼
  armazenamento externo (Backblaze B2 / Cloudflare R2 / Google Drive)
```

- Socket.IO continua no mesmo processo Fastify; o Caddy repassa WebSocket sem configuração extra.
- Uploads voltam pro disco: com `GCS_BUCKET_NAME` vazio o `src/lib/storage.ts` já grava em `uploads/` e o
  `server.ts` já serve `/uploads/` — **nenhuma mudança de código no `apps/server`**.
- Firebase (login com Google) só precisa do `FIREBASE_PROJECT_ID`, sem credencial do Google Cloud.

---

## 1. Arquivos no repo (feito — 2026-10-15)

- [x] `deploy/vps/docker-compose.yml` — serviços `db`, `api` (build do `apps/server/Dockerfile` existente,
  contexto na raiz do monorepo) e `caddy`; Postgres publicado só em `127.0.0.1`; logs rotacionados.
- [x] `deploy/vps/Caddyfile` — reverse proxy com HTTPS automático pro `API_DOMAIN`.
- [x] `deploy/vps/.env.example` — todas as variáveis que o `.env` da VPS precisa.
- [x] `deploy/vps/backup.sh` — `pg_dump` + tar dos uploads, retenção de 14 dias, envio via rclone.
- [x] `deploy/vps/.gitignore` (`.env`, `uploads/`, `backups/`) e entradas novas no `.dockerignore` da raiz.

Nada disso foi testado com Docker de verdade ainda (Docker não está instalado nesta máquina) — a validação
real é a seção 4.

---

## 2. O que só você pode fazer (contas/credenciais)

- [ ] **Contratar a VPS** — KVM 2 (2 vCPU / 8 GB) é folgado. Sistema: **Ubuntu 24.04**, sem painel.
  Datacenter: **São Paulo** se disponível (os usuários e o Neon atual estão no Brasil).
- [ ] **Chave SSH**: no PC, `ssh-keygen -t ed25519` e cadastrar a `.pub` no painel da Hostinger ao criar a VPS.
- [ ] **DNS**: registro `A` de `api.zhivago.com.br` → IP da VPS (onde o `zhivago.com.br` é gerenciado). TTL
  baixo (300s) facilita rollback.
- [ ] **Destino do backup externo**: criar conta/bucket no Backblaze B2 ou Cloudflare R2 (ambos têm faixa
  gratuita de ~10 GB) — ou usar o Google Drive.
- [ ] **Separar os segredos atuais** do Secret Manager (`JWT_SECRET`, `VAPID_*`, `SMTP_*` etc.). Têm que ser os
  **mesmos valores** de hoje: `JWT_SECRET` diferente desloga todo mundo, `VAPID_*` diferente quebra as
  inscrições de push existentes.
  ```powershell
  gcloud secrets versions access latest --secret=JWT_SECRET --project=zhivago-backend
  ```
- [x] **App mobile**: não publicado (confirmado em 2026-10-15), então nenhuma build depende do `*.run.app`.
  Quando for publicar, usar `EXPO_PUBLIC_API_URL=https://api.zhivago.com.br`.

---

## 3. Preparar a VPS (uma vez)

> **Estado em 2026-10-15 — FEITO**, com estes desvios do roteiro abaixo:
> - VPS KVM 2, IP **177.7.45.213**, veio com **Ubuntu 26.04** e **Docker 29 + Compose v5 já instalados**
>   (opção "Gerenciador Docker" da Hostinger) + Monarx (scanner de malware).
> - Feito: apt upgrade, ufw (OpenSSH/80/443), fail2ban, unattended-upgrades, swap 2 GB, login por senha
>   desligado via `/etc/ssh/sshd_config.d/00-hardening.conf` (testado: chave entra, senha é recusada).
> - **Não** foi criado o usuário `deploy`: operamos como `root` só por chave (chave ed25519 sem passphrase em
>   `~/.ssh/id_ed25519` no PC do usuário). Onde abaixo diz `deploy@`, usar `root@`.
> - DNS do `zhivago.com.br` é gerenciado pela **Netlify** (nameservers `*.nsone.net`) — o registro A
>   `api → 177.7.45.213` é criado lá. Pendente com o usuário.
> - Repo é privado no GitHub (`Zhivago-labs/zhivago-hotelapp`) — precisa de deploy key pra clonar na VPS.

Logado como root via SSH:

```bash
# Sistema atualizado + atualizações de segurança automáticas
apt update && apt upgrade -y
apt install -y ufw fail2ban unattended-upgrades git rclone
dpkg-reconfigure -plow unattended-upgrades

# Usuário de deploy (não operar como root no dia a dia)
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# SSH só por chave
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall: só SSH e web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# Docker (script oficial) + permissão pro usuário deploy
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# Swap de 2 GB (folga pro build da imagem)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Depois, como `deploy`:

```bash
sudo mkdir -p /opt/zhivago && sudo chown deploy:deploy /opt/zhivago
git clone <url do repo hotelapp> /opt/zhivago      # precisa ser o monorepo (o build usa a raiz)
cd /opt/zhivago/deploy/vps
cp .env.example .env && nano .env                   # preencher (seção 2)
mkdir -p uploads backups
```

> Repo privado: criar uma *deploy key* (somente leitura) no GitHub com `ssh-keygen` na VPS.

---

## 4. Subir a stack e copiar os dados (sem tocar na produção atual)

Até o fim desta seção o site continua 100% no Cloud Run + Neon. Isto é um **ensaio** — os dados copiados
aqui serão sobrescritos pela cópia final na seção 8.

```bash
cd /opt/zhivago/deploy/vps

# 4.1 Só o banco primeiro
docker compose up -d db

# 4.2 Dump do Neon direto da VPS (usar a connection string DIRETA, sem "-pooler").
#     Confira a versão do Postgres do Neon no painel: o pg_dump precisa ser >= ela (o Neon está no 18 e a imagem também).
docker run --rm postgres:18 pg_dump "postgresql://...neon.tech/...?sslmode=require" \
  -Fc --no-owner --no-acl > backups/neon.dump

# 4.3 Restaurar no Postgres local (a tabela _prisma_migrations vem junto)
docker compose exec -T db pg_restore -U zhivago -d zhivago --no-owner --no-acl --clean --if-exists \
  < backups/neon.dump

# 4.4 API + Caddy (DNS da seção 2 já precisa estar propagado pro certificado sair)
docker compose up -d --build
docker compose exec api npx prisma migrate status   # deve dizer "Database schema is up to date"
docker compose logs -f api caddy
```

### 4.5 Uploads (imagens que hoje estão no Cloud Storage)

As URLs gravadas no banco são `https://storage.googleapis.com/<bucket>/<arquivo>`. Copiar os arquivos pra
VPS e reescrever as URLs **no Postgres da VPS** (nunca no Neon):

```powershell
# No PC (gcloud já está instalado e logado)
gcloud storage rsync -r gs://<bucket> .\uploads-gcs
scp -r .\uploads-gcs\* deploy@<ip-da-vps>:/opt/zhivago/deploy/vps/uploads/
```

```bash
# Na VPS
docker compose exec -T db psql -U zhivago -d zhivago <<'SQL'
\set old 'https://storage.googleapis.com/<bucket>/'
\set new 'https://api.zhivago.com.br/uploads/'
UPDATE "User"         SET avatar  = replace(avatar,  :'old', :'new') WHERE avatar  LIKE :'old' || '%';
UPDATE "User"         SET "logoUrl" = replace("logoUrl", :'old', :'new') WHERE "logoUrl" LIKE :'old' || '%';
UPDATE "ListingImage" SET url     = replace(url,     :'old', :'new') WHERE url     LIKE :'old' || '%';
SQL
```

Conferir que não sobrou nada apontando pro bucket:
`docker compose exec -T db pg_dump -U zhivago -d zhivago | grep -c storage.googleapis.com` → `0`.

### 4.6 Testar pela URL nova (sem mexer no site)

- `curl https://api.zhivago.com.br/hello` e `/listings`.
- Rodar o `apps/web` **local** com `NEXT_PUBLIC_API_URL=https://api.zhivago.com.br`: login (e-mail e Google),
  busca, anúncio com fotos, upload de foto nova, chat em tempo real entre dois navegadores (Socket.IO),
  `/proposta`, push.
- Reiniciar a VPS (`sudo reboot`) e confirmar que tudo volta sozinho (`restart: unless-stopped`).

---

## 5. Backup (antes da virada — obrigatório)

```bash
rclone config        # criar o remote (ex.: "b2") com as credenciais da seção 2
# no .env: BACKUP_REMOTE=b2
chmod +x /opt/zhivago/deploy/vps/backup.sh
/opt/zhivago/deploy/vps/backup.sh                   # rodar uma vez na mão
crontab -e
# 0 3 * * * /opt/zhivago/deploy/vps/backup.sh >> /home/deploy/zhivago-backup.log 2>&1
```

**Testar a restauração** pelo menos uma vez (backup nunca restaurado não conta como backup):

```bash
docker run -d --name restore-test -e POSTGRES_PASSWORD=x postgres:18
docker cp backups/db_<data>.dump restore-test:/tmp/
docker exec restore-test sh -c 'createdb -U postgres t && pg_restore -U postgres -d t /tmp/db_*.dump'
docker exec restore-test psql -U postgres -d t -c 'select count(*) from "User"'
docker rm -f restore-test
```

Snapshot semanal da VPS pelo painel da Hostinger é um bônus, não substitui o backup externo.

---

## 6. Monitoramento

- Uptime Kuma (gratuito, self-hosted) **fora** da VPS — ou UptimeRobot (free) — checando
  `https://api.zhivago.com.br/hello` a cada 1–5 min com alerta por e-mail/Telegram.
- Espaço em disco: `df -h` e `docker system df` de vez em quando; `docker image prune -f` depois de deploys.

---

## 7. Acesso ao banco pelo PC

O Postgres só escuta em `127.0.0.1` da VPS. Túnel SSH:

```powershell
ssh -N -L 5434:127.0.0.1:5432 deploy@<ip-da-vps>
# e conectar em postgresql://zhivago:<senha>@localhost:5434/zhivago (DBeaver, Prisma Studio etc.)
```

---

## 8. Virada (cutover)

Fazer num horário de pouco uso. Tudo que for escrito no Neon entre o dump final e a troca de URL se perde,
então os passos são em sequência rápida:

1. [ ] Dump final do Neon + restore na VPS (repetir 4.2–4.3) e reescrever URLs (4.5 — rodar
   `gcloud storage rsync` de novo antes, pra pegar fotos novas).
2. [ ] Netlify → Site configuration → Environment variables: `NEXT_PUBLIC_API_URL=https://api.zhivago.com.br`
   → **Trigger deploy** (a Netlify não re-builda sozinha ao trocar env var).
3. [ ] Testar o fluxo da 4.6 no site de produção.
4. [ ] Atualizar o `docs/runbook-atualizacoes.md` (seção do backend → seção 10 deste doc).

**Rollback:** voltar o `NEXT_PUBLIC_API_URL` da Netlify pra URL do Cloud Run e re-deployar. Dados criados na
VPS depois da virada não voltam sozinhos pro Neon — por isso o teste do passo 3 é logo em seguida.

---

## 9. Desligar o Google Cloud (depois de ~7 dias estável)

- [ ] `gcloud run services delete zhivago-server --region southamerica-east1 --project zhivago-backend`
- [ ] Apagar as imagens do Artifact Registry (`zhivago-server`) e os secrets do Secret Manager.
- [ ] Bucket do Cloud Storage: só apagar depois de confirmar (4.5) que nenhuma URL no banco aponta pra ele.
- [ ] Neon: manter o projeto parado por mais ~30 dias como backup frio, depois apagar.

---

## 10. Deploy de atualizações (dia a dia, depois da virada)

```bash
ssh deploy@<ip-da-vps>
cd /opt/zhivago && git pull
cd deploy/vps
docker compose up -d --build api                    # rebuild + troca do container (~segundos fora do ar)
docker compose exec api npx prisma migrate deploy   # só se o commit trouxe migration nova
docker image prune -f
```

---

## Gates de aprovação (eu não faço sem o seu "ok" explícito)

- Qualquer comando contra o **Neon** (mesmo leitura de dump) ou contra o banco da VPS depois da virada.
- O UPDATE de URLs da 4.5.
- Trocar a env var da Netlify / disparar deploy do site.
- Qualquer `delete` no Google Cloud (seção 9).
