# Zhivago — Web separado (Next.js), app mobile e contas de imobiliária

Documento de análise técnica e plano de ação. Data de referência: 2026-07-13.

## Decisão de arquitetura

Decisão registrada nesta data: a versão web **deixa de usar `react-native-web`** e passa a ser um site
próprio (recomendação: Next.js), construído do zero, consumindo a mesma API. O Expo passa a servir **apenas
mobile** (iOS/Android). Backend (Fastify + Prisma + Socket.io) não muda de framework — ele já era agnóstico de
cliente, só precisa de ajustes de CORS/segurança para atender dois clientes distintos em vez de um só.

Isso substitui a abordagem anterior ("um código só, dois alvos de execução") por duas bases de UI mantidas em
paralelo. Ganha-se SSR/SEO nativo, responsividade real e liberdade de layout sem as amarras de componentes
React Native; perde-se o compartilhamento automático de tela entre mobile e web — toda tela usada hoje pelo
Expo em modo web (login, listagem, chat, dashboard, criar anúncio, admin) precisa ser reconstruída no novo site.

Estrutura de repositório recomendada (monorepo, evita duplicar tipos/contratos de API):
```
zhivago/
  apps/
    mobile/     Expo — só iOS/Android
    web/        Next.js — site completo
    server/     Fastify + Prisma + Socket.io (já existe, migra para apps/server)
  packages/
    shared/     Tipos TS e schemas Zod dos payloads de API, constantes de enum
                (status de listing, tipos de pagamento de oferta, etc.)
```
`packages/shared` é o que evita que mobile e web divirjam silenciosamente sobre o formato dos dados — não há
compartilhamento de componente de UI entre eles (é código React Native de um lado, React DOM do outro), só de
contratos/tipos.

---

## Resumo executivo

O Zhivago hoje é um único código Expo (React Native) que também compila para navegador via
`react-native-web`. A partir desta decisão, essa duplicidade unificada é abandonada em favor de dois clientes
separados falando com a mesma API: **Expo (mobile)** e **Next.js (web)**. O backend já era compartilhado e
continua sendo — a maior parte do trabalho é (1) simplificar o Expo removendo tudo que só existia para o modo
web funcionar, (2) construir o site novo, e (3) ajustar segurança do backend para dois clientes com origens
diferentes em vez de um app só.

Este documento cobre, nesta ordem:
1. Situação atual (levantamento feito antes da decisão, serve de inventário do que existe).
2. Como fica a arquitetura de dois clientes — o que sai do Expo, o que entra no Next.js, autenticação, tempo
   real, mídia, segurança.
3. Proposta da nova funcionalidade de contas para imobiliárias.
4. Roadmap por fases.

---

## Parte 1 — Situação atual (inventário)

Levantamento do estado do código antes da decisão de separar o web do Expo — serve de referência do que existe
hoje e precisa ser recriado ou aproveitado.

| Funcionalidade | Estado hoje (Expo + react-native-web) | O que muda com o Next.js separado |
|---|---|---|
| Autenticação (login/token) | `AsyncStorage`, sem refresh/expiração tratada | Web ganha opção de sessão via cookie `httpOnly` (mais seguro que token em `localStorage`); mobile continua com token em `AsyncStorage`. |
| Chat em tempo real | Socket.io-client, com **conexão duplicada** na tela de chat (bug independente da plataforma) | Corrigido nas duas implementações novas/ajustadas — não é um problema que a separação resolve por si só. |
| Notificação push | `expo-notifications` instalado, nunca registrado; sem Web Push | Mobile: registrar de fato o device. Web: Web Push (Service Worker + VAPID) fica natural de implementar em Next.js. |
| Upload de imagem do anúncio | Hack de `Platform.OS === 'web'` convertendo URI em Blob | Deixa de existir no Expo (mobile só usa `{uri,name,type}`); no Next.js é `<input type="file">` + `FormData` padrão do browser. |
| Layout / responsividade | Layout mobile-first esticado no navegador | Resolvido de fábrica — Next.js/CSS não tem as restrições de `react-native-web`. |
| Diálogos nativos (`Alert.prompt`) | 2 telas com fallback manual para web | Deixa de ser relevante no Expo (só mobile, `Alert.prompt` sempre disponível); Next.js usa modal HTML nativo do fluxo web. |
| SEO / preview ao compartilhar | Sem meta tags, renderização client-side | Resolvido de fábrica — `generateMetadata`/SSR do Next.js. |
| PWA / instalar no navegador | Não configurado | Fica opcional no Next.js (manifest + service worker), não é mais um workaround dentro do Expo. |
| CORS / segredos | `origin: true` (Fastify) / `origin: '*'` (Socket.io); `JWT_SECRET` com fallback fixo no código | Precisa ficar mais estrito agora que existem dois clientes de origens diferentes para autorizar (ver Parte 2.5). |

---

## Parte 2 — Arquitetura de dois clientes: Expo (mobile) + Next.js (web)

### 2.1 — Simplificar o Expo (mobile-only)
- Remover `react-native-web` e `expo-web-browser`/config de bundler web do `app.json`, se presentes.
- Remover os arquivos de variante web do template (`useColorScheme.web.ts`, `useClientOnlyValue.web.ts`) e o
  `app/+html.tsx` (só existe para o export web do Expo Router).
- Remover os desvios `Platform.OS === 'web'` que só existiam por causa do navegador: conversão de imagem para
  Blob em `criar-anuncio.tsx`, resolução de `API_URL` via `window.location.hostname` em `src/config/api.ts`, e
  os 2 fallbacks de `Alert.prompt` em `admin-panel.tsx`.
- Resultado esperado: código do app fica mais simples, sem branches de plataforma que não fazem mais sentido.

### 2.2 — Construir o site Next.js
Ordem de construção sugerida, público primeiro (também é o que a Parte 3 de imobiliárias precisa):
1. Páginas públicas sem login: listagem de imóveis, `/imovel/[id]` (com `generateMetadata` para Open Graph) e,
   já pensando na Parte 3, `/imobiliaria/[id]` (vitrine).
2. Autenticação: telas de login/registro, chamando os mesmos endpoints `/auth/login` e `/auth/register` que o
   Expo já usa.
3. Área autenticada: dashboard do proprietário, criar/editar anúncio, inbox e chat, admin panel.

### 2.3 — Autenticação no site
Como o Next.js tem servidor (Route Handlers / Server Components), há uma opção mais segura do que replicar o
padrão mobile de token em storage do navegador:
- Um Route Handler (`/api/login`) recebe usuário/senha, chama `POST /auth/login` no Fastify, e ao receber
  `{ user, token }` seta o token num cookie `httpOnly` + `secure` na resposta ao navegador — o token nunca fica
  acessível a JavaScript do lado do cliente (mitiga XSS).
- Server Components/Route Handlers subsequentes leem esse cookie e anexam `Authorization: Bearer <token>` nas
  chamadas ao Fastify — permite proteger rotas como o dashboard já no servidor (redirect antes de renderizar),
  sem "flash" de conteúdo autenticado.
- Alternativa mais simples para uma primeira versão: guardar o token em `localStorage` do navegador, igual ao
  padrão do Expo hoje. Funciona, mas reintroduz exposição a XSS que o cookie `httpOnly` evita. Recomendo cookie
  desde o início — o custo de implementação é baixo e evita ter que migrar depois.
- Mobile continua com `AsyncStorage` + bearer token — não faz sentido usar cookie em app nativo.

### 2.4 — Tempo real e mídia no Next.js
- `socket.io-client` funciona igual em Client Components do Next.js — mesma API, mesmo protocolo do backend.
  Ao portar a tela de chat, cuidado para **não repetir** o bug de conexão duplicada que existe hoje no Expo
  (um socket por contexto global de app, não um por tela).
- Upload de imagem passa a ser o fluxo padrão de browser: `<input type="file">` → `FormData` → `fetch` — sem
  necessidade de nenhum tratamento especial, o hack de conversão em Blob do Expo-web deixa de existir.

### 2.5 — Backend: suportar dois clientes com segurança
O backend não muda de framework, mas o modelo de confiança muda — hoje ele assume implicitamente "um app só"; a
partir de agora são dois clientes de origens diferentes:
- Restringir CORS do Fastify à URL real do site Next.js em produção (`origin: [NEXT_PUBLIC_WEB_URL]`) — e, se
  adotar cookies (2.3), habilitar `credentials: true`, o que exige origem explícita (não pode usar `origin: true`
  nem `'*'` junto com credenciais).
- Mesma restrição no CORS do Socket.io (`origin: '*'` hoje) — vale só para o cliente web; o app mobile não é um
  navegador e não é afetado por essa política.
- Remover o fallback fixo de `JWT_SECRET` — falhar a inicialização do servidor se a env var não existir em
  produção.
- Rate limiting em `/auth/login`, `/auth/register` e criação de `Offer` — um site público aberto amplia a
  superfície de exposição a bots/abuso em relação a um app distribuído só por loja.
- Modelo de push multiplataforma — trocar a coluna única `User.pushToken` por uma tabela, já que agora há dois
  mecanismos de push genuinamente diferentes (Expo Push para mobile, Web Push/VAPID para o site):
```prisma
model UserDevice {
  id       String @id @default(uuid())
  userId   String
  platform String   // "IOS" | "ANDROID" | "WEB"
  token    String
  user     User   @relation(fields: [userId], references: [id])
}
```

### 2.6 — Sessão expirada / 401
Independente da plataforma, hoje cada tela decide sozinha o que fazer com um `401`. Recomendo, nas duas bases
novas, um client HTTP central (um `fetch` wrapper no Next.js, outro no Expo) que trata `401` de forma única —
evita comportamento divergente entre mobile e web bem no momento em que já são duas implementações distintas de
UI, onde é mais fácil elas divergirem sem essa centralização.

---

## Parte 3 — Nova funcionalidade: contas de Imobiliária

### 3.1 — Modelo de conta

Hoje `User.role` só distingue `"USER" | "ADMIN"` e todo anúncio pertence a uma pessoa física. Proposta em duas
fases:

**Fase A (MVP — conta de imobiliária como um `User` "turbinado")**
```prisma
model User {
  ...
  accountType String  @default("INDIVIDUAL") // "INDIVIDUAL" | "AGENCY"
  document    String? // CPF ou CNPJ
  creci       String? // registro CRECI do corretor/imobiliária
  companyName String? // nome fantasia, exibido na vitrine pública
  logoUrl     String?
  verified    Boolean @default(false) // aprovado pelo admin
}
```
Uma imobiliária é uma conta comum com `accountType = "AGENCY"`. Sem tabela nova, sem migração de dados de
anúncios existentes — menor esforço de implementação e reaproveita 100% do fluxo de moderação que já existe no
admin panel (agora recriado no Next.js, ver 2.2).

**Fase B (multiusuário/corretores) — IMPLEMENTADA em 2026-07-28**

> Atualização 2026-07-28 (mesmo dia, mais tarde): o usuário pediu explicitamente pra iniciar a Fase B
> ("consegue iniciar o plano b?"). Os 8 passos da sequência de construção abaixo foram implementados e
> validados com servidores reais, um a um — detalhe completo em `docs/retomar-projeto.md`, seção "Feito em
> 2026-07-28 (continuação)". A análise de viabilidade e o modelo de dados abaixo são mantidos como registro
> histórico da decisão; o que segue depois da sequência de 8 passos é o que ficou de fora deliberadamente
> (billing, papéis extras, selo de verificação nos anúncios de empresa, UI mobile).

Proposta trazida pelo usuário em 2026-07-28, registrada aqui como plano caso decidissem seguir. Análise fria
feita antes de registrar (mantida como contexto histórico da decisão de seguir):

- **Verdict**: tecnicamente viável (é o padrão clássico de multi-tenancy — `Company` + `CompanyMember` com
  role), mas **não é incremental**: é uma re-arquitetura, não uma feature. Hoje "imobiliária" é um *flag num
  usuário individual* (`User.accountType`), não uma organização separada com vários usuários dentro. A proposta
  substitui esse modelo inteiro.
- **Dado concreto (2026-07-28)**: só existem 2 contas `AGENCY` no banco, **nenhuma verificada** — zero sinal
  real de demanda por múltiplos corretores por conta ainda. Confirma que não é a hora de construir isso
  especulativamente.
- **O que muda, se for pra frente** (não é lista exaustiva, é o suficiente pra dimensionar): `Listing` ganha
  `companyId` (obrigatório pra imóvel de empresa) *e* `agentId` (opcional) — toca `getListings`,
  `getListingById`, `getMyListings`, admin, dashboard, duplicar, e a importação em lote (Fase 4, hoje gated em
  `user.accountType === "AGENCY"`, precisaria virar "empresa ativa"); sessão/JWT precisa carregar contexto de
  "empresa ativa" (hoje só carrega `{id, email, role}`); fluxo de convite por e-mail é novo; sistema de
  permissão granular pra vários papéis é novo (hoje só existem os 2 papéis de plataforma inteira,
  `USER`/`ADMIN` — nenhum precedente de permissão por organização/recurso existe no código); "planos"
  (billing) é outro subsistema inteiro, não tocado ainda.
- **Recomendação**: maior salto de escopo do projeto até aqui — maior que Fase 3 e Fase 4 juntas. Não começar
  sem demanda real validada (algum cliente/prospect pedindo múltiplos logins de corretor de verdade). Se
  seguir, cortar escopo da primeira versão: só papéis `Owner`/`Agent` (não os 5 completos), sem convite por
  e-mail (adicionar direto pelo admin/owner), sem billing — expandir depois.

Modelo de referência proposto (Prisma, ainda não implementado):
```prisma
model Company {
  id       String @id @default(uuid())
  name     String
  document String // CNPJ
  verified Boolean @default(false)
  members  CompanyMember[]
  listings Listing[] // via companyId — paralelo a ownerId, ver decisão abaixo
}

model CompanyMember {
  id        String @id @default(uuid())
  userId    String @unique // v1: um usuário pertence a NO MÁXIMO uma empresa (ver "Sessão" abaixo)
  companyId String
  role      String // v1 só "OWNER" | "AGENT" — Manager/Admin/Assistant ficam pra depois, se precisar
  status    String @default("ACTIVE") // v1 não tem convite assíncrono, ver "Fluxo de adesão" abaixo
  user      User    @relation(fields: [userId], references: [id])
  company   Company @relation(fields: [companyId], references: [id])
}
```

**2026-07-28 (revisão, mesmo dia — resolvendo lacunas encontradas numa releitura crítica a pedido do
usuário):** as 5 decisões abaixo precisam estar resolvidas *antes* de qualquer código, pra essa seção servir
de ponto de partida numa sessão futura sem precisar re-analisar do zero.

1. **Convivência de `ownerId` (pessoa física) com `companyId` (empresa)** — `Listing.ownerId` **não muda**,
   continua servindo 100% do fluxo atual de pessoa física (a maioria do sistema hoje). `companyId`/`agentId`
   são colunas novas, nullable, **paralelas**: um anúncio tem `ownerId` OU `companyId`, nunca os dois — regra
   de aplicação (Zod/lógica), não constraint de banco, mesmo padrão já usado em outras validações do projeto.
   Isso significa duas visões de "meus imóveis" em vez de uma query só: `getMyListings` (hoje, por `ownerId`,
   intocada) continua servindo pessoa física e o dono/corretor sem empresa; uma nova
   `getCompanyListings`/`getMyAssignedListings` serve quem está numa empresa (por `companyId` pro
   Owner ver tudo da empresa, por `agentId` pro Agent ver só o que é responsável).
2. **Adesão é opt-in, não migração forçada** — as contas `AGENCY` que já existem (Fase A) **não são
   convertidas automaticamente** em `Company`. `User.accountType`/`verified`/`companyName`/`creci`/`logoUrl`
   continuam existindo e funcionando exatamente como hoje pra quem não quiser time. Uma empresa só passa a
   existir quando o dono de uma conta `AGENCY` explicitamente cria uma (`Company` + `CompanyMember` role
   `OWNER` apontando pro próprio usuário) — ação nova, não migração de dados em produção. Evita o risco de
   mexer em conta real de cliente sem ele pedir.
3. **Contexto de "empresa ativa" na sessão** — v1 resolve isso **eliminando o problema**: `CompanyMember.userId`
   é `@unique`, ou seja, um usuário pertence a no máximo uma empresa. Nada de trocar de "empresa ativa" nem
   claim novo no JWT — o backend só faz `prisma.companyMember.findUnique({ where: { userId } })` a partir do
   `id` que o JWT já carrega (mesmo padrão que `accountType`/`verified` já usam hoje: nunca confiados do JWT,
   sempre lidos frescos do banco). Multi-empresa por usuário fica pra uma eventual Fase C, fora de escopo.
4. **Verificação (selo "Imobiliária verificada")** — `Company.verified` é independente de `User.verified`.
   Quando uma empresa existe, o selo no anúncio passa a olhar `Company.verified` (não mais `User.verified`) pra
   anúncios com `companyId`; anúncios com `ownerId` continuam olhando `User.verified`, sem mudança. A aba
   "Imobiliárias" do admin (`/admin?view=agencies`) precisa ganhar uma visão de `Company` ao lado da atual de
   `User` — dois tipos de "conta pra verificar" em vez de um.
5. **Sequência de construção sugerida** (nessa ordem, cada item testável isoladamente antes do próximo):
   1. `Company` + `CompanyMember` (schema + migração aditiva, sem dado a migrar — ver decisão 2).
   2. Ação "Criar equipe" pro dono de uma conta `AGENCY` — vira `OWNER` da própria `Company` nova.
   3. `Listing.companyId`/`agentId` (schema + migração aditiva) + regra `ownerId` XOR `companyId` na
      criação/edição.
   4. Adicionar membro por e-mail — v1 sem convite assíncrono: `OWNER` busca um usuário existente pelo e-mail e
      adiciona direto como `AGENT` (sem token/aceite — token de convite por e-mail fica pra depois, se
      precisar suportar convidar quem ainda não tem conta).
   5. Endpoints de listagem/atribuição: imóveis da empresa (`OWNER`), imóveis atribuídos a mim (`AGENT`),
      reatribuir `agentId`.
   6. Permissões: `OWNER` faz tudo que `AGENT` faz + gerencia membros; `AGENT` cria/edita/duplica só os
      imóveis atribuídos a ele dentro da empresa.
   7. UI (web primeiro, mobile depois se fizer sentido): seção "Equipe" no dashboard (só `OWNER`), visão de
      imóveis da empresa.
   8. Admin: estender a aba "Imobiliárias" pra também verificar `Company` (decisão 4).
   - Billing/planos e os papéis `MANAGER`/`ADMIN`/`ASSISTANT` ficam **fora** dessa primeira versão —
     adicionar só se o MVP acima (Owner/Agent) validar que há demanda de verdade por ir além.

Um corretor que sai da empresa não leva o histórico do imóvel junto (basta reatribuir `agentId`); o imóvel
nunca deixa de pertencer à empresa (`companyId` não muda).

### 3.2 — Cadastro
- Tela de registro (Next.js e Expo) passa a perguntar o tipo de conta (Pessoa física / Imobiliária).
- Se Imobiliária: campos adicionais de CNPJ, CRECI (opcional, mas caso preenchido entra em fila de verificação),
  nome fantasia e logo.
- Conta de imobiliária nasce com `verified = false`; o selo "Imobiliária verificada" só aparece após aprovação do
  admin — reaproveitando a mesma tela de moderação, só adicionando uma aba "Verificação de contas".

### 3.3 — Tornar o anúncio mais rápido de publicar
Pontos concretos para reduzir a fricção de quem anuncia em volume (uma imobiliária tem dezenas de imóveis, não
um):

1. **Múltiplas fotos por anúncio.** Hoje `Listing.image` é uma única string. Trocar para uma tabela
   `ListingImage(id, listingId, url, order)` — pré-requisito para qualquer imobiliária levar o anúncio a sério
   (comprador de imóvel não decide com 1 foto só).
2. **Rascunho.** Adicionar `"DRAFT"` ao enum de `Listing.status`, permitindo montar o anúncio em etapas e
   publicar quando estiver pronto.
3. **Duplicar anúncio.** Botão "Duplicar" na listagem de anúncios do proprietário, pré-populando o formulário de
   criação com os dados de um anúncio existente — útil para várias unidades semelhantes (ex.: apartamentos do
   mesmo prédio).
4. **Importação em lote (fase futura).** Upload de CSV/planilha com várias unidades de uma vez — a maioria das
   imobiliárias já mantém uma planilha de estoque. Não é MVP, mas é o item de maior retorno depois do básico.
5. **Vitrine pública da imobiliária.** Rota `/imobiliaria/[id]` (Next.js) mostrando logo, nome, selo de
   verificação e grid com todos os anúncios ativos daquela conta — como essa rota já nasce em Next.js (Parte
   2.2), ganha SEO/Open Graph de fábrica, sem esforço extra de implementação.
6. **Painel com métricas por anúncio** (visualizações, contatos recebidos) — extensão do dashboard do
   proprietário, que hoje só mostra reservas/receita (caso de aluguel), precisa também servir o caso de uma
   imobiliária vendendo várias unidades.

Itens fora do MVP mas mapeados como oportunidade futura: destaque pago de anúncio, múltiplos corretores por
conta (Fase B do modelo), resposta automática de primeiro contato.

---

## Parte 4 — Roadmap sugerido

1. **Fundação** — simplificar o Expo para mobile-only (2.1); corrigir o bug de socket duplicado do chat; travar
   `JWT_SECRET`/CORS para dois clientes distintos (2.5); permitir múltiplas imagens e edição de imagem no
   anúncio no backend (pré-requisito técnico da Parte 3).
2. **Construir o site Next.js** — páginas públicas com SEO nativo (`imóvel`, `imobiliária`) primeiro; depois
   autenticação (com cookie `httpOnly`, 2.3), dashboard, criar/editar anúncio, chat, admin panel.
3. **Imobiliárias — MVP** — `accountType`/verificação no cadastro (mobile e web); fluxo de aprovação no admin;
   rascunho de anúncio; duplicar anúncio; vitrine pública da imobiliária.
4. **Imobiliárias — evolução** — importação em lote via planilha; métricas por anúncio; Web Push/VAPID e push
   nativo mobile completos (`UserDevice`); ~~avaliar necessidade real de multiusuário por conta (Fase B) antes
   de construir~~ — Fase B implementada em 2026-07-28 a pedido do usuário (ver Parte 3.1 e
   `docs/retomar-projeto.md`).

O acoplamento real entre fases: "múltiplas fotos + edição de imagem" (parte do backend na Fase 1) precisa vir
antes do MVP de imobiliárias (Fase 3) — sem isso, a funcionalidade nasce capenga. As páginas públicas do Next.js
(Fase 2, item 1) também deveriam vir antes da vitrine de imobiliária (Fase 3), já que a vitrine é construída
sobre a mesma base.
