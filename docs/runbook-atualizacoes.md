# Runbook — como atualizar produção (frontend, backend, banco)

Referência rápida pro dia a dia depois que a infra já existe. Pra entender *por que* a infra é assim
(decisões, contas, custos), veja `docs/deploy-cloud-run-neon.md` — este documento aqui é só "quais comandos
rodar quando eu mexer em X".

## 0. Onde cada coisa mora

| Peça | Onde roda | Como atualiza |
|---|---|---|
| `apps/web` (Next.js) | Netlify — `https://zhivag0.netlify.app` | push pro branch conectado à Netlify → build e deploy automáticos |
| `apps/mobile` (Expo) | dispositivo/loja — não tem "produção" hospedada | build via EAS, fora do escopo deste runbook |
| `apps/server` (Fastify + Prisma + Socket.IO) | Google Cloud Run — serviço `zhivago-server`, projeto `zhivago-backend`, região `southamerica-east1` | `gcloud builds submit` + `gcloud run deploy` (seção 2) |
| Banco de dados | Neon (Postgres), projeto `zhivago`, branch `production` | `prisma migrate deploy` (seção 3) |
| Uploads (avatar, fotos de imóvel) | Bucket `gs://zhivago-uploads-648179758872` | não precisa de ação manual — o código já grava lá via `GCS_BUCKET_NAME` |
| Segredos de produção | Secret Manager do GCP (projeto `zhivago-backend`) | `gcloud secrets versions add` (seção 4) |

URL do backend em produção: `https://zhivago-server-648179758872.southamerica-east1.run.app`

---

## 1. Atualizar só o frontend (`apps/web`)

Não precisa de nenhum comando especial — a Netlify já está conectada ao repositório (ou ao branch que você
configurou nela). Basta:

1. Commitar e dar push nas mudanças de `apps/web` pro branch que a Netlify observa.
2. A Netlify builda e publica sozinha. Acompanhe em **app.netlify.com** → o site → **Deploys**.

Só mexa manualmente nas **Environment variables** da Netlify (Site configuration → Environment variables) se
precisar trocar `API_URL` / `NEXT_PUBLIC_API_URL` (ex.: se um dia o backend mudar de URL) — depois de mudar
uma env var, sempre dispare **Trigger deploy → Deploy site**, porque a Netlify não re-builda sozinha só por
causa de uma env var alterada.

---

## 2. Atualizar o backend (`apps/server`)

Sempre que mexer em código de `apps/server` (ou em `packages/shared`, que ele usa), o fluxo é: buildar a
imagem nova → fazer o Cloud Run apontar pra ela.

```powershell
# 1) build da imagem via Cloud Build (roda a partir da raiz do monorepo — o cloudbuild.yaml já sabe usar
#    apps/server/Dockerfile com o contexto certo)
gcloud builds submit --config=cloudbuild.yaml .

# 2) aponta o Cloud Run pra imagem nova (a tag "latest" é sempre a mais recente buildada acima)
gcloud run deploy zhivago-server `
  --image=southamerica-east1-docker.pkg.dev/zhivago-backend/zhivago-server/api:latest `
  --region=southamerica-east1
```

Esse segundo comando reaproveita toda a configuração do deploy anterior (env vars, secrets, min/max
instances, etc.) — só troca a imagem. Não precisa repetir `--set-env-vars`/`--set-secrets` a menos que esteja
mudando alguma dessas variáveis (aí veja a seção 4).

**Rollback rápido** (se o deploy novo quebrar algo): o Cloud Run guarda as revisões anteriores.

```powershell
gcloud run revisions list --service=zhivago-server --region=southamerica-east1
gcloud run services update-traffic zhivago-server --region=southamerica-east1 --to-revisions=<REVISION_ANTIGA>=100
```

**Ver logs** (útil pra debugar um deploy que deu errado):

```powershell
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=zhivago-server" --limit=50 --freshness=1h
```

---

## 3. Mudou o `prisma/schema.prisma`? Rodar a migration em produção

Toda mudança de schema já deveria ter uma migration gerada localmente (`npx prisma migrate dev --name
<algo>`, contra o Postgres local) e commitada em `apps/server/prisma/migrations/`. Isso é trabalho normal de
desenvolvimento, sem risco — o passo abaixo é só quando essa migration, já testada localmente, precisa ir pro
banco real do Neon.

```bash
cd apps/server
DATABASE_URL="<connection string pooled do Neon>" \
DIRECT_URL="<connection string direct do Neon>" \
npx prisma migrate deploy
```

As duas connection strings do Neon (pooled e direct) estão nos segredos `neon-database-url` e
`neon-direct-url` do Secret Manager (veja como puxar o valor na seção 4 — comando de leitura). **Nunca**
cole essas strings no `apps/server/.env` local nem troque o `DATABASE_URL`/`DIRECT_URL` de lá — o `.env`
local deve continuar sempre apontando pro Postgres local de dev.

Depois de rodar, `npx prisma migrate status` (com as mesmas env vars) confirma que "Database schema is up to
date!".

⚠️ Isso escreve no banco de produção de verdade — trate como uma ação irreversível (mesmo que Prisma
Migrate seja desenhado pra ser seguro, sempre existe risco em mudança de schema num banco com dado real).

---

## 4. Segredos e variáveis de ambiente do Cloud Run

Os segredos (senhas, chaves, connection strings) vivem no **Secret Manager**, não direto no serviço. O
serviço só referencia a versão mais recente de cada um (`:latest`).

**Ver quais segredos existem:**
```powershell
gcloud secrets list
```

**Ler o valor atual de um segredo** (ex.: pra copiar a connection string do Neon pra rodar uma migration —
seção 3):
```powershell
gcloud secrets versions access latest --secret=neon-database-url
```

**Atualizar o valor de um segredo** (cria uma nova versão; o Cloud Run já usa `:latest`, então na próxima
`gcloud run deploy`/`gcloud run services update` ele pega o valor novo — revisões já rodando não atualizam
sozinhas, precisa de um novo deploy pra pegar o valor novo):
```powershell
echo "novo-valor-aqui" | gcloud secrets versions add jwt-secret-prod --data-file=-
# depois, force o Cloud Run a criar uma revisão nova pra pegar o valor:
gcloud run services update zhivago-server --region=southamerica-east1 --no-traffic --tag=refresh-secret
gcloud run services update-traffic zhivago-server --region=southamerica-east1 --to-latest
```

**Segredos hoje configurados:** `neon-database-url`, `neon-direct-url`, `jwt-secret-prod`, `smtp-user`,
`smtp-pass`, `vapid-public-key`, `vapid-private-key`.

**Env vars simples (não-secretas) do serviço**, pra referência — mudar uma delas:
```powershell
gcloud run services update zhivago-server --region=southamerica-east1 --update-env-vars="NOME=valor"
```
Hoje configuradas: `NODE_ENV=production`, `WEB_URL=https://zhivag0.netlify.app`,
`GCS_BUCKET_NAME=zhivago-uploads-648179758872`, `VAPID_SUBJECT=mailto:fabiodemelo682@gmail.com`,
`BASE_URL=https://zhivago-server-648179758872.southamerica-east1.run.app`, `SMTP_HOST=smtp.gmail.com`,
`SMTP_PORT=587`.

---

## 5. Checklist rápido pra qualquer mudança que toque o backend

1. Testar local primeiro (Postgres local, `.env` local) — `npm run dev` em `apps/server`.
2. Se mudou `prisma/schema.prisma`: gerar a migration local (`prisma migrate dev`), testar, commitar.
3. Rodar `npm run build` local pra garantir que o `tsc` não quebrou (pega erro de tipo antes do Cloud Build).
4. Se tem migration nova: aplicar no Neon (seção 3) **antes** de fazer deploy do código que depende dela.
5. Build + deploy no Cloud Run (seção 2).
6. Testar a URL de produção (`curl .../hello`, um fluxo real pelo site) antes de considerar terminado.

---

## 6. Coisas que só o usuário pode fazer (não automatizável por aqui)

- Trocar segredo/senha externo de verdade (ex.: gerar uma nova senha de app do Gmail) — precisa de login
  pessoal na conta.
- Qualquer mudança de faturamento/plano no GCP ou no Neon.
- Mudar o domínio/DNS do site na Netlify.
