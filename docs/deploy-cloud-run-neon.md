# Deploy do backend (apps/server) — Cloud Run + Neon

Criado em 2026-09-15. Plano combinado com o usuário: backend em **Cloud Run** (Google Cloud, free tier
permanente), banco em **Neon** (Postgres gerenciado, free tier permanente, sem custo). Uploads (`uploads/`)
precisam sair do disco local porque o Cloud Run tem filesystem efêmero — vão para um bucket do **Google Cloud
Storage**.

Este documento separa o que é trabalho de código (eu faço) do que depende de conta/credencial/aprovação
(só o usuário pode fazer). A ordem das seções é a ordem de execução recomendada.

---

## 0. Arquitetura alvo

```
apps/web (Netlify — https://zhivag0.netlify.app —, já em produção — sem mudança)
        │
        ▼
apps/server (Cloud Run, container Docker)
        │                       │
        ▼                       ▼
   Neon (Postgres)      Google Cloud Storage (uploads)
```

- Socket.IO continua embutido no mesmo processo Fastify (sem serviço separado).
- Sem mudança nenhuma em `apps/web` ou `apps/mobile` além de trocar a URL da API (`API_URL` /
  `NEXT_PUBLIC_API_URL`) quando o Cloud Run estiver no ar.

---

## 1. O que eu faço (código, dentro do repo)

Nenhum destes passos toca em conta na nuvem nem gasta nada — são só mudanças no `apps/server`.

- [x] **Porta dinâmica**: `src/server.ts` agora lê `Number(process.env.PORT) || 3333` — 2026-09-16.
- [x] **Scripts de build/start**: `"build": "prisma generate && tsc"` e `"start": "node dist/server.js"` no
  `package.json`; `tsconfig.json` ganhou `rootDir`/`outDir`/`include: ["src"]` pra não tentar compilar os
  scripts soltos da raiz (`check-bookings.ts`, `seed-browser-test.ts`, `prisma/seed.ts`) — 2026-09-16.
- [x] **Dockerfile** (multi-stage: `npm ci` só com os manifests de `apps/server` + `packages/shared`, build,
  imagem final com `node_modules` + `dist/` + `prisma/`) + `.dockerignore` na raiz do monorepo (contexto do
  build) excluindo `node_modules`, `uploads/`, `.env*`, `.git` — 2026-09-16. Não testado com `docker build` de
  verdade (Docker não está instalado nesta máquina) — validação real só vai acontecer no primeiro
  `gcloud run deploy` (seção 2.4).
- [x] **Migrar uploads pra Cloud Storage**: novo `src/lib/storage.ts` com `saveUpload()` — grava no bucket via
  `@google-cloud/storage` quando `GCS_BUCKET_NAME` está definido, senão cai para o disco local (dev). Os 3
  pontos que liam/gravavam em disco local direto (`server.ts` estático, `auth.controller.ts` avatar,
  `listings.controller.ts` fotos) foram atualizados pra usar essa função — 2026-09-16.
- [x] **Prisma + Neon**: `directUrl = env("DIRECT_URL")` adicionado no `datasource db` de
  `prisma/schema.prisma`; `.env` local ganhou `DIRECT_URL` apontando pro mesmo Postgres local — 2026-09-16.
- [x] **CORS/URLs de produção**: já eram 100% via env var (`WEB_URL`, `BASE_URL`), sem hardcode — só precisou
  documentar no `.env.example`.
- [x] **`.env.example` criado** (não existia) documentando todas as env vars, incluindo as novas
  (`DIRECT_URL`, `GCS_BUCKET_NAME`, `PORT`) — 2026-09-16.
- [x] **Bônus não previsto no plano original**: `npm run build` (`tsc`) revelou 8 erros de TypeScript
  pré-existentes (não relacionados ao deploy, em `auth.controller.ts`, `chat.controller.ts`,
  `reviews.controller.ts` — `exactOptionalPropertyTypes` e tipagem de `request.user`) que travavam o build.
  Corrigidos — 2026-09-16.

Validado depois de cada mudança: `tsc --noEmit` limpo, `npm run build` funcionando, e o servidor rodando de
verdade via `node dist/server.js` (porta dinâmica, fallback de upload local, `/hello` e `/listings` via Prisma
contra o Postgres local) — sem regressão no que já funcionava.

---

## 2. O que só você pode fazer (contas, credenciais, aprovações)

Essas etapas exigem login pessoal, cartão de crédito ou uma decisão de custo/risco — não posso fazer por
você.

### 2.1 — Google Cloud
1. Instalar e autenticar o `gcloud` CLI (já te passei o passo a passo — `gcloud init`).
2. **Criar (ou escolher) um projeto no GCP** e **vincular uma conta de faturamento** (cartão de crédito).
   > ⚠️ Isso é obrigatório pro Cloud Run funcionar, mesmo ficando dentro do free tier. Não vamos gastar nada
   > enquanto o uso ficar dentro da cota gratuita, mas a conta de faturamento *pode* cobrar se você passar do
   > limite — vale configurar um alerta de orçamento (eu te ajudo a configurar isso via `gcloud`, mas a
   > vinculação do cartão em si só você faz, pelo console).

### 2.2 — Neon (banco de dados)
1. Criar conta em `neon.tech` (pode ser com login Google).
2. Criar um projeto e um banco Postgres.
3. Copiar as duas connection strings que o Neon fornece: a **pooled** (contém `-pooler` no host) e a
   **direct** (sem `-pooler`).
4. Me passar essas duas strings **como variáveis de ambiente**, não coladas em texto puro na conversa se der
   pra evitar — o ideal é você mesmo colocar no Secret Manager do GCP (eu te dou o comando exato) ou, se
   preferir mais simples, cola aqui mesmo e eu uso só pra configurar o serviço.

### 2.3 — Segredos de produção
Decidir (com você) se reaproveitamos os segredos de dev ou geramos novos pra produção:
- `JWT_SECRET` (recomendo gerar um novo, só de produção)
- Credenciais SMTP (Gmail) — reaproveitar ou criar um remetente dedicado
- Chaves VAPID (push) — pode reaproveitar

### 2.4 — Aprovar os passos que gastam ou publicam decon verdade
Vou pausar e confirmar com você antes de:
- Rodar `prisma migrate deploy` contra o banco Neon de produção (ação em dado real, ainda que seja a primeira
  vez populando um banco vazio).
- Rodar o primeiro `gcloud run deploy` (publica o serviço, ainda que gratuito).
- Trocar `API_URL`/`NEXT_PUBLIC_API_URL` no `apps/web` em produção pra apontar pro novo backend (esse é o
  momento em que o tráfego real passa a ir pro Cloud Run).

---

## 3. Ordem de execução

1. Você instala/autentica o `gcloud` CLI (feito, se já rodou `gcloud init`).
2. Você cria o projeto GCP + vincula faturamento (2.1).
3. Você cria o banco no Neon e me passa as connection strings (2.2).
4. Eu faço as mudanças de código da seção 1, testando local contra o Neon (troco só o `.env` local pra
   apontar pro Neon temporariamente, sem mexer no Postgres local de dev).
5. Eu habilito as APIs necessárias no GCP (Cloud Run, Artifact Registry, Cloud Storage, Secret Manager) via
   `gcloud services enable` — isso não custa nada, mas só roda depois que sua conta/projeto já existem.
6. Eu crio o bucket do Cloud Storage e configuro as permissões.
7. Eu configuro os segredos no Secret Manager (JWT, SMTP, VAPID, Neon `DATABASE_URL`/`DIRECT_URL`).
8. **Aprovação sua** → rodo `prisma migrate deploy` contra o Neon.
9. **Aprovação sua** → build da imagem Docker + `gcloud run deploy` (com `--session-affinity` e
   `--min-instances=1` pro Socket.IO não cair).
10. Testo o serviço no ar (rotas principais + upload de imagem + WebSocket).
11. **Aprovação sua** → atualizo `API_URL` do `apps/web` em produção pra apontar pro novo backend.

---

## 4. Riscos e limitações conhecidas

- **Cold start / min-instances**: com `--min-instances=1` o Cloud Run mantém uma instância sempre viva (pro
  Socket.IO não perder conexão), o que consome uma fração da cota gratuita de tempo de CPU — ainda assim
  deve ficar dentro do free tier pro volume de uso atual, mas vale monitorar.
- **Escala horizontal do Socket.IO**: se um dia o Cloud Run escalar pra mais de 1 instância simultânea, as
  conexões WebSocket dos usuários vão ficar "presas" cada uma numa instância diferente sem um adapter
  compartilhado (ex.: Redis) — hoje, com `min-instances=1` e baixo tráfego, não é um problema prático, mas é
  uma limitação a lembrar se o uso crescer.
- **Neon "sleep"**: o compute do Neon no free tier pode hibernar após período de inatividade, causando uma
  latência extra na primeira query depois de um tempo parado (não é uma falha, é comportamento esperado do
  free tier).
- **Faturamento GCP**: mesmo com free tier, a conta de faturamento fica vinculada ao projeto — recomendo
  configurar um alerta de orçamento (ex.: em R$1) pra ser avisado antes de qualquer cobrança real.

---

## 5. Checklist final (resumo)

- [x] `gcloud` instalado e autenticado (`fabiodemelo682@gmail.com`) — 2026-09-15
- [x] Projeto GCP criado (`zhivago-backend`, número `648179758872`, região padrão `southamerica-east1`) —
  2026-09-15
- [x] Faturamento vinculado (conta "Minha conta de faturamento", `019004-720752-0A1C87`) + alerta de
  orçamento criado (R$1, avisos em 50%/100%) — 2026-09-15
- [x] APIs do GCP habilitadas (Cloud Run, Artifact Registry, Cloud Storage, Secret Manager, Cloud Build) —
  2026-09-15
- [x] Conta Neon criada + projeto `zhivago` (branch `production`, região AWS São Paulo) + connection strings
  obtidas — 2026-09-16
- [x] Código do `apps/server` ajustado (porta, build/start, Dockerfile, uploads no GCS, Prisma `directUrl`) —
  2026-09-16
- [x] Bucket do Cloud Storage criado (`gs://zhivago-uploads-648179758872`, região `southamerica-east1`,
  uniform bucket-level access, objetos públicos pra leitura via `allUsers`/`objectViewer`, service account
  padrão do Compute com `objectAdmin` pra escrever) — 2026-09-16
- [x] Segredos configurados no Secret Manager (`neon-database-url`, `neon-direct-url`, `jwt-secret-prod` —
  gerado novo —, `smtp-user`/`smtp-pass` — reaproveitados do dev —, `vapid-public-key`/`vapid-private-key` —
  reaproveitadas —, todos com acesso liberado pra service account padrão do Compute) — 2026-09-16
- [x] `prisma migrate deploy` rodado contra o Neon — as 7 migrations aplicadas com sucesso,
  `migrate status` confirma schema atualizado — 2026-09-16
- [x] Deploy no Cloud Run feito (`--session-affinity`, `--min-instances=1`, `--max-instances=2`) — serviço
  `zhivago-server`, URL `https://zhivago-server-648179758872.southamerica-east1.run.app` — 2026-09-16
- [x] Serviço testado no ar (API via `/auth/register`, upload de avatar gravando e servindo do bucket
  público, handshake do Socket.IO) — dados de teste já removidos do Neon e do bucket — 2026-09-16
- [ ] `apps/web` (Netlify, `https://zhivag0.netlify.app`) em produção apontando pro novo backend — **próximo
  passo, aguardando sua aprovação**
