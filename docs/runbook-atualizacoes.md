# Runbook — como atualizar produção (frontend, backend, banco)

Referência rápida pro dia a dia. Pra entender *por que* a infra é assim (decisões, migração de 2026-10-17),
veja `docs/deploy-vps-hostinger.md` — este documento aqui é só "quais comandos rodar quando eu mexer em X".

> Até 2026-10-17 o backend rodava no Google Cloud Run + Neon (`docs/deploy-cloud-run-neon.md`, histórico).
> Tudo do Google Cloud foi apagado; `cloudbuild.yaml` não é mais usado.

## 0. Onde cada coisa mora

| Peça | Onde roda | Como atualiza |
|---|---|---|
| `apps/web` (Next.js) | Netlify — `https://zhivago.com.br` (e `https://zhivag0.netlify.app`) | push na `main` do repo **`zhivago-web`** (não do `hotelapp`) → build e deploy automáticos (seção 1) |
| `apps/server` (Fastify + Prisma + Socket.IO) | VPS Hostinger `177.7.45.213`, Docker Compose em `/opt/zhivago/deploy/vps` | `atualizar.sh` na VPS (seção 2) |
| Banco de dados | Postgres 18 no Docker da própria VPS (serviço `db`) | migrations aplicadas pelo `atualizar.sh` |
| Uploads (avatar, fotos de imóvel) | Disco da VPS: `/opt/zhivago/deploy/vps/uploads`, servidos em `/uploads/` | nada a fazer |
| Segredos de produção | `/opt/zhivago/deploy/vps/.env` na VPS (só root lê; nunca vai pro Git) | editar o arquivo + recriar o `api` (seção 4) |
| HTTPS | Caddy (certificado Let's Encrypt automático) | nada a fazer |
| Backup | `backup.sh` todo dia 03:00 UTC (cron do root), 14 dias em `deploy/vps/backups` | seção 5 |
| `apps/mobile` (Expo) | não publicado | quando publicar: `EXPO_PUBLIC_API_URL=https://api.zhivago.com.br` |

URL do backend em produção: `https://api.zhivago.com.br` (DNS: registro A `api` → `177.7.45.213` na Netlify).

Acesso à VPS: `ssh root@177.7.45.213` (só por chave — `C:\Users\Fábio de Melo\.ssh\id_ed25519`; sem a chave,
terminal do navegador no hPanel → VPS → Gerenciar).

---

## 1. Atualizar só o frontend (`apps/web`)

⚠️ A Netlify está ligada ao repositório **`Zhivago-labs/zhivago-web`** (clone em `C:\Users\Fábio de Melo\zhivago-web`),
não ao `hotelapp`. Push só no `hotelapp` **não publica o site**.

1. Commitar e dar push na `main` do `hotelapp` (onde o trabalho é feito).
2. Copiar os arquivos alterados de `apps/web` e `packages/shared` para o `zhivago-web` (antes, `git fetch` +
   `git log main..origin/main` lá, pra não sobrescrever algo feito direto nele), conferir com
   `npx tsc --noEmit` em `apps/web`, commitar como "(sync de hotelapp <commit>)" e dar push.
3. A Netlify builda e publica sozinha. Acompanhe em **app.netlify.com** → o site → **Deploys**.

Variáveis de ambiente da Netlify (Site configuration → Environment variables) — o endereço da API está em
**duas**, e as duas têm que ser iguais:

- `API_URL` — usada no servidor da Netlify (server actions: login, cadastro, etc.);
- `NEXT_PUBLIC_API_URL` — usada no navegador (anúncios, chat, Socket.IO).

Depois de mudar uma env var, dispare **Trigger deploy → Clear cache and deploy site** — a Netlify não
re-builda sozinha por causa de env var (na virada, só o "Clear cache" resolveu).

---

## 2. Atualizar o backend (`apps/server`)

Depois do push na `main`:

```bash
ssh root@177.7.45.213 /opt/zhivago/deploy/vps/atualizar.sh
```

O script faz, em ordem:

1. `git pull` — se nada mudou, ou só mudou coisa fora do backend (ex.: só `apps/web`), para aqui;
2. backup do banco + uploads (`backup.sh`);
3. build da imagem nova — **a versão atual continua no ar** durante o build;
4. `prisma migrate deploy`, se o commit trouxe migration nova;
5. troca do container (poucos segundos fora do ar) e teste em `https://api.zhivago.com.br/hello` e
   `/listings`. Se o teste falhar, **volta sozinho pra imagem anterior** e mostra os logs.

`atualizar.sh --forcar` reconstrói mesmo sem commit novo.

⚠️ O rollback automático volta o **código**, não o **banco**: uma migration já aplicada continua aplicada.
Por isso, migration que apaga/renomeia coluna deve ser feita em duas etapas (código compatível com os dois
esquemas primeiro, remoção depois). Se precisar desfazer dados, o backup do passo 2 está em
`deploy/vps/backups/db_<data>.dump` (restauração na seção 5).

**Ver logs:**

```bash
cd /opt/zhivago/deploy/vps
docker compose logs --tail 100 api        # últimas linhas
docker compose logs -f api caddy          # ao vivo (Ctrl+C sai)
docker compose ps                         # os 3 serviços (db, api, caddy) devem estar "Up"
```

---

## 3. Mudou o `prisma/schema.prisma`?

1. Gerar a migration localmente e commitar em `apps/server/prisma/migrations/` (aqui o `prisma migrate dev`
   não roda em modo não interativo — escrever o SQL da migration à mão e aplicar no Postgres local com
   `prisma migrate deploy`).
2. Testar local.
3. Push + `atualizar.sh` — ele detecta a pasta de migrations alterada e aplica no banco da VPS antes de
   trocar o código.

Conferir depois: `docker compose exec api npx prisma migrate status` → "Database schema is up to date!".

⚠️ Isso escreve no banco de produção de verdade.

---

## 4. Segredos e variáveis de ambiente do backend

Ficam todos em `/opt/zhivago/deploy/vps/.env` na VPS (modelo com a lista completa:
`deploy/vps/.env.example`). Não ficam no Git nem em nenhum outro lugar — o backup diário não inclui esse
arquivo, então guarde uma cópia num lugar seguro (gerenciador de senhas).

Mudar um valor:

```bash
cd /opt/zhivago/deploy/vps
nano .env                                  # editar e salvar (Ctrl+O, Enter, Ctrl+X)
docker compose up -d api                   # recria o api com o valor novo
```

Não trocar sem motivo: `JWT_SECRET` diferente desloga todo mundo; `VAPID_*` diferente quebra as inscrições de
push existentes; `POSTGRES_PASSWORD` **não** muda a senha do banco já criado (só serve na criação).

---

## 5. Backup e restauração

- Automático: `backup.sh` às 03:00 UTC (meia-noite em Brasília), log em `/var/log/zhivago-backup.log`.
  Guarda 14 dias de `db_<data>.dump` + `uploads_<data>.tar.gz` em `/opt/zhivago/deploy/vps/backups`.
- Os backups ficam **na própria VPS** (não há destino externo — `BACKUP_REMOTE` vazio). Recomendado ligar
  também o backup semanal da Hostinger (hPanel → VPS → Backups). Pra mandar pra fora depois: configurar um
  remote do `rclone` e preencher `BACKUP_REMOTE` no `.env` (ver seção 5 do plano).

Restaurar um dump (⚠️ substitui o banco atual inteiro):

```bash
cd /opt/zhivago/deploy/vps
docker compose stop api
docker compose exec -T db pg_restore -U zhivago -d zhivago --no-owner --no-acl --clean --if-exists \
  < backups/db_<data>.dump
docker compose start api
```

Acessar o banco pelo PC: DBeaver com túnel SSH (aba SSH: `177.7.45.213`, usuário `root`, chave
`id_ed25519`; aba Main: `localhost:5432`, banco e usuário `zhivago`, senha = `POSTGRES_PASSWORD` do `.env`).

---

## 6. Checklist rápido pra qualquer mudança que toque o backend

1. Testar local primeiro (Postgres local, `.env` local) — `npm run dev` em `apps/server`.
2. Se mudou o schema: migration local (seção 3), testar, commitar.
3. `npm run build` local pra garantir que o `tsc` não quebrou.
4. Push + `atualizar.sh` (seção 2) — tem que terminar em "OK: backend atualizado e respondendo."
5. Testar um fluxo real pelo site (login, anúncio, chat) antes de considerar terminado.

---

## 7. Coisas que só o usuário pode fazer

- Trocar segredo/senha externo de verdade (ex.: nova senha de app do Gmail) — login pessoal na conta.
- Plano/faturamento da Hostinger, Netlify e Neon (o Neon ficou parado como cópia fria até ~17/11/2026).
- DNS do domínio (Netlify → Domains → zhivago.com.br).
