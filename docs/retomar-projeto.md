# Retomar projeto Zhivago — prompt de continuidade

Atualizado em 2026-08-30. Cole este arquivo (ou peça pra ler `docs/retomar-projeto.md`) no início da próxima
conversa para retomar sem perder contexto.

## Contexto

Monorepo já estruturado: `apps/mobile` (Expo), `apps/web` (Next.js), `apps/server` (Fastify + Prisma),
`packages/shared` (tipos/contratos). **Backend em PostgreSQL** (migrado em algum momento após 2026-07-28, sem
registro do porquê/quando — a nota antiga dizia SQLite, não é mais verdade, verifique
`apps/server/prisma/schema.prisma` se precisar confirmar). Site Next.js tem praticamente tudo do marketplace
(home, `/imovel/[id]`, login/cadastro, dashboard, chat, admin) mais uma camada B2B para imobiliárias com
equipe — ver `docs/crm-b2b-organizacoes-leads.md` para o CRM (Organization/OrganizationMember, Fase 1; Lead/
LeadAssignment/distribuição, Fase 2; LeadInteraction/Visit/pipeline Kanban, Fase 3; SLA visual + métricas,
Fase 4 — todas implementadas em 2026-08-30, Fase 4 parcial por decisão do usuário: sem notificação proativa,
sem SLA configurável por organização, sem distribuição `SMART`). Roadmap completo e visão de produto de
longo prazo estão em
`docs/web-mobile-e-imobiliarias.md` (Partes 1–5) — ler antes de propor mudanças de arquitetura.

## Regra de escopo

Não pular para a Parte 5 do roadmap (CRM/multi-tenant "visão completa" — papéis extras, billing) nem para
notificação proativa de SLA, SLA configurável por organização, ou distribuição `SMART` (ver
`docs/crm-b2b-organizacoes-leads.md`) sem que o usuário peça explicitamente — todas ficaram deliberadamente
de fora da Fase 4. As Fases 1 (`Organization`/`OrganizationMember`), 2 (`Lead`/`LeadAssignment`/distribuição
manual e round robin), 3 (`LeadInteraction`/`Visit`/pipeline Kanban em `/imobiliaria`) e 4 (SLA visual +
métricas do dashboard B2B) do CRM **já foram implementadas** em 2026-08-30 — não são mais "não iniciadas",
são a camada que existe hoje.

## Feito em 2026-07-14: autenticação no site Next.js

- `/login` e `/cadastro` implementados com Server Actions (`apps/web/src/lib/actions/auth.ts`), não Route
  Handler — é o padrão idiomático desta versão do Next.js (16.2.10) para mutações com formulário
  (`useActionState` + `'use server'`), com progressive enhancement de graça.
- Sessão via cookie `httpOnly` (`zhivago_token`, `apps/web/src/lib/session.ts`) — mesma decisão de segurança
  do roadmap (2.3), token nunca acessível a JS do navegador.
- `SiteHeader` virou Server Component async: mostra "Entrar/Cadastre-se" ou "Olá, {nome}" + "Sair"
  (`getSessionUser()` chama `GET /auth/me` no backend com o token do cookie).
- Validado ponta a ponta manualmente (build + simulação de submit de formulário via curl, sem JS): cadastro
  seta cookie e redireciona, e-mail duplicado mostra erro do backend, login funciona, senha errada mostra erro,
  logout limpa o cookie. Usuário de teste removido do banco depois.
- **Não implementado ainda**: "Esqueci minha senha" no site (o mobile já tem `/auth/forgot-password` e
  `/auth/reset-password` no backend, faltam as telas web).

## Feito em 2026-07-14 (continuação): dashboard + criar/editar anúncio

- **`/dashboard`** (`apps/web/src/app/dashboard/page.tsx`, protegida via `requireAuth`): 3 stat tiles (imóveis
  ativos, vendas concluídas, receita total), 2 gráficos de linha (reservas mensais, receita estimada — SVG
  próprio em `components/dashboard/LineChart.tsx`, sem lib externa), seção "Meus anúncios" (grid com
  editar/excluir) e "Reservas recebidas" (busca + paginação via query string, cancelar reserva) — tudo isso
  reunido numa página só, já que o site não tem tab bar como o mobile (que separa em duas telas).
- **`/anuncios/novo`** e **`/anuncios/[id]/editar`**: formulários (Server Actions em
  `apps/web/src/lib/actions/listings.ts`) chamando `POST /listings` (multipart, com upload de imagem) e
  `PUT /listings/:id` (JSON, sem imagem — mesma limitação que o mobile já tem, edição não troca a foto).
  Exclusão de anúncio e cancelamento de reserva usam confirmação nativa via um pequeno Client Component
  (`ConfirmSubmitButton`, `confirm()` no `onClick` antes do submit do Server Action).
- **Bug real encontrado e corrigido durante a validação**: `LineChart` é Client Component: passar uma função
  (`formatValue={(v) => ...}`) como prop a partir do Server Component da página quebra a serialização RSC
  ("Functions cannot be passed directly to Client Components...") — só apareceu ao simular o submit de um
  Server Action (não no GET inicial da página, que mascarou o erro). Corrigido trocando a prop por um
  identificador serializável (`format: "number" | "currency"`) resolvido dentro do próprio componente. **Lição:
  nunca passar função como prop de Server → Client Component; sempre um valor serializável.**
- Validado ponta a ponta via curl simulando submits de formulário reais (sem JS): criar anúncio com imagem,
  editar (incluindo um bug de validação — backend rejeita `null` em campos opcionais, só aceita
  string/omitido — corrigido em `updateListingAction`), excluir, e o redirect de `/dashboard` sem sessão para
  `/login?next=/dashboard`. Usuário e imagem de teste removidos depois.

## Feito em 2026-07-15: inbox/chat em tempo real no site Next.js

- **Decisão de arquitetura (com aprovação explícita do usuário)**: o token JWT fica num cookie `httpOnly`
  (inacessível a JS do navegador), mas `socket.io-client` roda no browser e precisa do token cru no handshake
  (`auth: { token }`, igual ao mobile). Optamos pela opção mais simples e pragmática: Server Components
  buscam o token via `getToken()`/`requireAuth()` e o repassam como prop para Client Components (mesmo padrão
  já usado por `SiteHeader` → `UserMenu`) — sem endpoint novo exposto. Isso significa que o JWT aparece no
  payload RSC serializado da página (visível em "view-source") enquanto a sessão durar; é a mesma superfície de
  exposição que uma API de "token de socket" teria, só que sem criar um endpoint a mais. Documentado aqui para
  não ser esquecido caso o modelo de auth mude no futuro.
- **`ChatSocketProvider`** (`apps/web/src/components/chat/ChatSocketProvider.tsx`), montado uma única vez no
  `layout.tsx` raiz: mantém **uma única conexão Socket.io por sessão** (contexto React,
  `useChatSocket()`) — isso evita replicar o bug de conexão duplicada que existe no mobile (`chat/[id].tsx`
  cria sua própria `io(...)` além da já existente em `ChatContext`). **O bug do mobile continua sem correção no
  mobile** — só não foi repetido no port para web.
- **`/inbox`** (lista de conversas) e **`/inbox/[id]`** (conversa): endpoints REST reaproveitados 1:1
  (`GET/POST /conversations`, `GET /conversations/:id`, `GET /conversations/:id/messages`,
  `PATCH /conversations/:id/read|report|close|reopen`), sem nenhuma mudança no backend. Envio de mensagem via
  `socket.emit('sendMessage', {conversationId, content}, callback)` — o remetente recebe a própria mensagem
  pelo callback de ack, não por `receiveMessage` (só o destinatário recebe esse evento), exatamente como no
  mobile.
- Página do imóvel (`/imovel/[id]`): botão "Chat" real (`StartChatButton`, Server Action
  `startConversationAction`) substitui o placeholder desabilitado — esconde para o próprio dono, mostra
  "Chat (Vendido)" desabilitado se `status === 'SOLD'`.
- Moderação portada: denunciar conversa (dono do imóvel), fechar/reabrir (admin), modo "auditor" (admin vendo
  uma conversa da qual não participa, somente leitura).
- **Não portado, fora de escopo desta rodada**: renderização especial de mensagens `OFFER_REQUEST`/
  `BOOKING_REQUEST` com botões de aprovar/rejeitar (o site não tem fluxo de ofertas/reservas ainda — mensagens
  desses tipos aparecem como bolha de texto genérica, sem quebrar, mas sem os botões de ação do mobile).
- Validado ponta a ponta: dois usuários reais (dono + comprador), listagem criada, `POST /conversations` via
  Server Action, inbox e conversa renderizando os dados certos dos dois lados, controle de acesso (terceiro
  usuário não participante recebe 404), troca de mensagem real via `socket.io-client` num script Node
  (comprador → dono, ack + `receiveMessage` confirmados), badge de não lidas, denúncia. Dados de teste
  removidos depois.

## Feito em 2026-07-18: painel admin no site Next.js

- **`/admin`** (`apps/web/src/app/admin/page.tsx`, protegida via `requireAuth` + checagem de `role === "ADMIN"`
  — mostra "Acesso restrito ao administrador" para não-admin, sem redirect, igual ao mobile): duas visões via
  query string (`?view=moderation|stats`, mesmo padrão de `searchParams` do `/dashboard`), sem estado
  client-side.
  - **Moderação** (default, `?status=PENDING|APPROVED|REJECTED|ALL`): grid de `<AdminListingCard>`
    (`components/admin/AdminListingCard.tsx`) com dono (nome+email), e ações Aprovar / Rejeitar (com motivo,
    via `RejectListingButton` — `window.prompt` + valida ≥5 caracteres antes do submit, mesmo padrão do
    `ConfirmSubmitButton`) / Voltar a pendente / Excluir — cada uma seu próprio Server Action em
    `lib/actions/admin.ts` (`approveListingAction`, `rejectListingAction`, `pendingListingAction`,
    `adminDeleteListingAction`), todas void + `revalidatePath("/admin")`, mesmo padrão de
    `deleteListingAction`/`cancelBookingAction`.
  - **Estatísticas**: tiles (usuários, imóveis, contagem por status) + reaproveita o `<LineChart>` já existente
    do `/dashboard` (sem duplicar SVG) para reservas/mês.
  - Endpoints do backend (`/admin/*`) já existiam prontos, nenhuma mudança de backend foi necessária.
- **`UserMenu`** ganhou link "Painel Admin" (ícone `Shield`), visível só para `role === "ADMIN"`.
- **Fora de escopo** (mesma disciplina das rodadas anteriores): gestão de usuários (suspender/banir/promover —
  backend tem os endpoints, mobile não tem UI, não implementado aqui) e `listingsDistribution` (tipo/categoria)
  do `/admin/stats` (mobile não usa).
- Validado ponta a ponta via curl simulando submits de Server Action reais (sem JS, extraindo os
  `$ACTION_ID`/`$ACTION_REF` do HTML renderizado): login como ADMIN, filtro por status, mover
  pendente→rejeitar (motivo curto bloqueado, motivo válido aceito)→excluir, estatísticas com números corretos,
  acesso restrito para usuário comum. Usuários e imóvel de teste removidos depois (incluindo o arquivo de
  upload).

## Feito em 2026-07-18 (continuação): múltiplas imagens por anúncio (backend + web + mobile)

Pré-requisito técnico da Fase 1 (`docs/web-mobile-e-imobiliarias.md`, Parte 3.3 item 1) para o MVP de
imobiliárias (Fase 3) — feito nas 3 bases de uma vez, sem suporte a editar/remover fotos de um anúncio já
criado (decisão explícita do usuário: manter a limitação existente de que editar não mexe em imagem).

- **Dados**: nova tabela `ListingImage` (`id`, `url`, `order`, `listingId` → `Listing`, `onDelete: Cascade`,
  mesmo padrão de `Review`/`Booking`/`Offer`), substituindo a coluna única `Listing.image`. Migração
  (`prisma/migrations/20260718160000_add_listing_images`) escrita à mão (ambiente não-interativo não permite
  `prisma migrate dev`) — preserva as fotos existentes copiando `Listing.image` para `ListingImage(order=0)`
  antes de dropar a coluna (recreate-table do SQLite). Aplicada com `prisma migrate deploy` + `prisma generate`.
- **Backend**: `createListing` aceita N parts de arquivo no campo `images` (limite de 10, sempre drena o
  stream mesmo acima do limite para não travar o multipart), exige ao menos 1 imagem; `getListings`/
  `getListingById`/`getMyListings`/`adminGetListings` incluem `images` ordenadas. **Decisão importante**: chat
  (`chat.controller.ts`) e reservas (`users.controller.ts` — viagens e reservas recebidas) continuam recebendo
  um campo `image: string` único (capa = primeira imagem, computada no backend) — evita mexer nesses
  consumidores nas 3 bases, já que ali só cabe uma miniatura, não uma galeria.
- **Tipos compartilhados** (`packages/shared`): novo `ListingImage`, `Listing.image` → `Listing.images[]`.
- **Web**: novo `MultiImageInput` (seleção múltipla com preview + remover, sincroniza `DataTransfer` no input
  nativo para o Server Action ler via `formData.getAll`); `ListingCard`/`OwnerListingCard`/`AdminListingCard`
  mostram `images[0]`; novo `ListingGallery` (client component) no `/imovel/[id]` com setas, contador e tira de
  miniaturas.
- **Mobile**: `criar-anuncio.tsx` com `allowsMultipleSelection` + lista de miniaturas removíveis; corrigido
  import quebrado em `HotelCard.tsx` (`@/constants/ListingsData` não existe mais — não existia há tempos);
  `imovel/[id].tsx` ganhou galeria (ScrollView horizontal com paging + dots, sem dependência nova).
- Validado ponta a ponta com os dois servidores rodando: criação com 3 imagens via curl (ordem 0/1/2 correta),
  limite de 10 testado com 11 arquivos (11º descartado sem travar), galeria renderizando no `/imovel/[id]`,
  capa correta em home/dashboard/admin panel, chat e "minhas viagens"/reservas recebidas confirmados
  inalterados. Mobile: só typecheck + revisão de código, sem simulador disponível neste ambiente para testar a
  UI de verdade. Dados de teste (usuários, anúncios, uploads) removidos depois.
- **Lição operacional**: `npx prisma migrate dev` não funciona neste ambiente não-interativo (Claude Code) —
  usar `--create-only` não resolve porque ele já falha antes de gerar o SQL; o caminho é escrever a migração à
  mão seguindo o padrão de uma migração anterior e aplicar com `prisma migrate deploy`.
- **Lição operacional (processos)**: neste ambiente Windows, parar uma tarefa em background que rodou `npm run
  dev` (via TaskStop) mata o wrapper mas não sempre a criança `node.exe`/`next dev` de fato — ela pode
  continuar ocupando a porta. Depois de parar, checar `Get-NetTCPConnection -LocalPort <porta>` e usar
  `taskkill /PID <pid> /F` se ainda estiver ouvindo, antes de assumir que a porta está livre.

## Feito em 2026-07-18 (continuação): `accountType` (Pessoa física / Imobiliária) — Fase 3, item 1

Primeiro item do MVP de imobiliárias (`docs/web-mobile-e-imobiliarias.md`, Parte 3.1/3.2), implementado nas 3
bases de uma vez, seguindo o modelo "Fase A" do doc (sem tabela nova, `User` "turbinado").

- **Dados**: `User` ganhou `accountType` (`"INDIVIDUAL" | "AGENCY"`, default `INDIVIDUAL`), `document`, `creci`,
  `companyName`, `logoUrl` (nullable) e `verified` (`Boolean @default(false)`) — migração aditiva simples (6
  `ALTER TABLE ... ADD COLUMN`, sem recreate-table, já que nenhum campo é obrigatório sem default).
- **Backend**: `register` exige `document` quando `accountType === "AGENCY"` (refine do zod); `verified` nasce
  sempre `false` no servidor, nunca confiado do client; `register`/`login`/`me` retornam os novos campos.
  `document` só é exposto nos endpoints "self" (register/login/me) — os selects públicos (`getListings`,
  `getListingById`, `getUserProfile`) expõem `accountType`/`companyName`/`creci`/`verified`, mas **não**
  `document` (CPF/CNPJ não deveria vazar publicamente).
- **Escopo deliberadamente deixado de fora** (perguntei ao usuário, sem resposta, segui a opção recomendada):
  **sem upload de logo** (`logoUrl` sempre `null` — nenhuma das duas plataformas tem hoje um padrão de upload
  de imagem única, só o de múltiplas fotos de anúncio; cadastro continua JSON simples, não virou multipart) e
  **sem UI de aprovação no admin** (`verified` sempre `false` por enquanto — o selo "Imobiliária verificada"
  corretamente não aparece pra ninguém ainda, até a próxima etapa do roadmap implementar a aprovação).
- **Web**: `RegisterForm` ganhou toggle Pessoa física/Imobiliária (mesmo padrão de `useState` controlado do
  `category` em `NewListingForm.tsx`), campos condicionais (nome fantasia, CNPJ, CRECI opcional) só para
  Imobiliária; novo `AgencyBadge` (`components/AgencyBadge.tsx`) mostrando "Imobiliária verificada" quando
  `accountType === "AGENCY" && verified`, ligado em `/imovel/[id]` (perto de "Anunciado por", que agora prioriza
  `companyName` sobre o nome pessoal quando existe). Não existe página de perfil público no site ainda, então
  esse ponto do plano original foi pulado (nada para ligar lá).
- **Mobile**: `register.tsx` ganhou o mesmo toggle (`Selector` copiado do padrão de `criar-anuncio.tsx`) +
  campos condicionais; `AuthContext.register()` mudou de assinatura posicional fixa para um objeto de opções
  (breaking change interno, só usado por `register.tsx`); badge "Imobiliária verificada" na aba de perfil
  (`(tabs)/two.tsx`), estilizado como o `adminBadge` já existente.
- Validado ponta a ponta com os dois servidores rodando: cadastro `INDIVIDUAL` (sem campos extras) e `AGENCY`
  (com CNPJ/CRECI/nome fantasia) via curl simulando o Server Action real; confirmado que `/auth/me` retorna os
  campos certos; confirmado que o selo não aparece com `verified=false` e passa a aparecer (mostrando o
  `companyName`) depois de marcar `verified=true` direto no banco. Mobile: só typecheck + revisão de código,
  sem simulador disponível neste ambiente. Usuários e anúncio de teste removidos depois.

## Feito em 2026-07-18 (continuação): fluxo de verificação de imobiliárias no admin panel

Fase 3, item 2. Antes disso só dava pra marcar `verified=true` editando o banco direto.

- **Backend**: `getAllUsers` (`GET /admin/users`) ganhou filtro por `accountType`/`verified` (query params) e
  passou a retornar `accountType, document, creci, companyName, verified` no `select` (visão de admin — aqui
  `document` aparece, diferente dos endpoints públicos). Novo `PATCH /admin/users/:id/verify` (`{verified:
  boolean}`), mesmo formato de `updateUserStatus`.
- **Web**: terceira aba "Imobiliárias" no `/admin` (ao lado de Moderação/Estatísticas), com filtro
  Pendentes/Verificadas/Todas (default Pendentes) — mesmo padrão de abas/paginação da moderação de imóveis.
  Novo `AgencyAccountCard` com botão Verificar/Remover verificação.
- **Mobile**: terceiro botão "Imobiliárias" no toggle existente do admin panel (`admin-panel.tsx`), mesma
  lógica de filtro e ação.
- Validado ponta a ponta *sem editar o banco manualmente*: cadastrei uma conta `AGENCY` de teste, criei um
  anúncio pra ela, confirmei que aparecia em "Pendentes" no `/admin`, cliquei "Verificar" pelo painel (via curl
  simulando o Server Action), confirmei que o `AgencyBadge` passou a aparecer no anúncio real, depois "Remover
  verificação" e confirmei que o badge sumiu de novo. Mobile: só typecheck + revisão de código. Dados de teste
  removidos.

## Feito em 2026-07-18 (continuação): rascunho de anúncio + duplicar anúncio + vitrine pública da imobiliária

Fechou os 3 últimos itens da Fase 3 do roadmap. Rascunho e duplicar em web + mobile; vitrine só web (o próprio
roadmap já enquadra `/imobiliaria/[id]` como rota exclusivamente Next.js).

- **Decisão de escopo (evita reabrir uma decisão já tomada)**: editar um anúncio continua sem mexer em imagem
  (limitação mantida de uma rodada anterior). Por isso "rascunho" **não** significa "criar sem foto e adicionar
  depois" — a foto continua obrigatória na criação nos dois casos. Rascunho = o anúncio já nasce completo (com
  foto) mas com `status: "DRAFT"` (não é público) até o dono clicar "Publicar".
- **Backend**: `createListing` aceita `status` (`DRAFT`|`APPROVED`, default `APPROVED`); `updateListing` aceita
  `status` pra alternar `DRAFT ⇄ APPROVED` (publicar/despublicar). Novo `POST /listings/:id/duplicate` — clona
  os campos do anúncio + as linhas de `ListingImage` (mesmas URLs, sem re-upload, já que `ListingImage.url` não
  tem constraint de unicidade), nasce sempre como `DRAFT`. **Corrigido um vazamento de segurança pré-existente**
  (não introduzido nesta rodada, mas que rascunho tornava consequente de verdade): `getListingById` não checava
  status nem dono — qualquer link direto expunha um anúncio `DRAFT`/`PENDING`/`REJECTED`. Agora só o dono ou um
  admin (via JWT opcional — tenta verificar o token sem exigir, cai pra 404 se não for nem dono nem admin) vê
  um anúncio fora de `APPROVED`/`SOLD`. `getUserProfile` (perfil público) ganhou `include: {owner, images}` nos
  listings, necessário pra `ListingCard` renderizar na vitrine.
- **Web**: `NewListingForm` ganhou dois botões de submit no mesmo `<form>` (`name="intent"`, valores
  `"publish"`/`"draft"` — truque nativo de HTML, sem JS, o `FormData` recebe o par do botão que disparou o
  submit). `OwnerListingCard` ganhou Publicar/Despublicar (condicional ao status) e Duplicar (sempre, redireciona
  pra edição da cópia). Nova rota `/imobiliaria/[id]` reaproveitando `ListingsExplorer`/`ListingCard`/
  `AgencyBadge` já existentes — 404 se a conta não é `AGENCY`. Nome do dono em `/imovel/[id]` virou link pra
  vitrine quando é imobiliária.
- **Mobile**: `criar-anuncio.tsx` ganhou dois botões (rascunho/publicar) chamando `handleSave(status)`;
  `my-listings.tsx` ganhou os mesmos três botões (Publicar/Despublicar/Duplicar) ao lado de Editar/Excluir.
- Validado ponta a ponta: rascunho criado não aparece na home nem por link direto (nem anônimo nem outro
  usuário, só o dono), aparece no dashboard como "Rascunho"; publicar via UI real torna público de verdade
  (sumiu do 404, apareceu na home); duplicar gera cópia `DRAFT` com a mesma imagem (mesma URL, sem novo
  upload) e redireciona pra edição; vitrine mostra nome/CRECI/badge/grid (só anúncios publicados, rascunho não
  conta) e devolve 404 pra conta `INDIVIDUAL`. Mobile: só typecheck + revisão de código. Dados de teste
  removidos.

## Feito em 2026-07-28 (continuação): Fase B (corretores) implementada de ponta a ponta

A pedido explícito do usuário ("consegue iniciar o plano b?"), os 8 passos da sequência de construção
documentada em `docs/web-mobile-e-imobiliarias.md` Parte 3.1 foram implementados e validados um a um com
servidores reais, na ordem sugerida:

1. **Schema `Company`/`CompanyMember`** (`apps/server/prisma/schema.prisma` + migração
   `20260728020000_add_company`) — `CompanyMember.userId` é `@unique` (v1: um usuário pertence a no máximo uma
   empresa). `User.companyMembership` é a back-relation opcional.
2. **`POST /companies`** (criar equipe, opt-in, exclusivo pra `accountType === "AGENCY"` e só se ainda não
   pertence a uma empresa — 409 se já pertence) + **`GET /companies/me`** (empresa e papel do usuário logado).
3. **`Listing.companyId`/`agentId`** (migração `20260728030000_add_listing_company_agent`, colunas nullable com
   FK e índice) — `createListing` agora checa `companyMember` do criador: se pertence a uma empresa, grava
   `companyId`/`agentId` (o próprio criador) e deixa `ownerId` `null`; senão, comportamento de sempre
   (`ownerId`, sem tocar `companyId`/`agentId`). `getListingById` ganhou uma segunda checagem de "é o dono" pra
   rascunho/pendente: além de `ownerId === requesterId`, agora também conta ser o `agentId` do anúncio ou o
   `OWNER` da empresa dona dele — sem isso, o próprio criador de um rascunho de empresa levaria 404 ao tentar
   ver o que acabou de criar.
4. **`POST /companies/members`** — o `OWNER` busca um usuário já cadastrado pelo e-mail e adiciona como `AGENT`
   direto (sem convite assíncrono em v1); 403 se quem chama não é `OWNER`, 404 se o e-mail não existe, 409 se
   o usuário já está em alguma empresa (mensagem diferencia "já é da sua" vs "já é de outra").
5. **`GET /companies/listings`** (todos os imóveis da empresa, só `OWNER`), **`GET
   /companies/my-assigned-listings`** (os atribuídos a mim, qualquer papel), **`PATCH /listings/:id/agent`**
   (reatribuir `agentId`, só `OWNER`, valida que o novo agente é membro da mesma empresa).
6. **Permissões `OWNER` vs `AGENT`** em `updateListing`/`duplicateListing`/`deleteListing`: `AGENT` só
   gerencia o que lhe foi atribuído (`agentId === si mesmo`); `OWNER` gerencia qualquer imóvel da própria
   empresa; **deletar ficou restrito a `OWNER`** (a doc só lista criar/editar/duplicar como ações de `AGENT`).
   Duplicar um imóvel de empresa preserva `companyId` e atribui `agentId` a quem duplicou.
7. **UI web**: nova seção "Equipe" no `/dashboard` (`TeamSection` + `CreateCompanyForm`/`AddMemberForm`/
   `ReassignAgentSelect`, Server Actions em `apps/web/src/lib/actions/companies.ts`) — mostra o formulário de
   criar equipe pra quem é `AGENCY` sem empresa, ou (já tendo empresa) nome/selo/lista de membros +
   formulário de adicionar membro + grid de imóveis da empresa com seletor de corretor responsável (`OWNER`),
   ou só a lista de "meus imóveis atribuídos" (`AGENT`) — reaproveita `OwnerListingCard` já existente.
8. **Admin**: aba "Imobiliárias" (`/admin?view=agencies`) ganhou um sub-toggle "Contas individuais" / "Empresas
   (Fase B)" — a segunda lista e verifica `Company` (`GET`/`PATCH /admin/companies`), independente da
   verificação de `User` que já existia.

Cada passo foi validado com os dois servidores reais rodando (não só typecheck) antes de seguir pro próximo,
mesmo espírito de [[feedback-thorough-runtime-verification]]: criação de conta AGENCY/individual de teste,
criação de equipe, tentativa de duplicar criação (409), adicionar/reatribuir membro, criar anúncio de empresa
via multipart real (`ownerId` null + `companyId`/`agentId` setados confirmado na resposta), checagem de que só
dono/agente/admin veem um rascunho de empresa (owner vê, terceiro e anônimo levam 404), edição/duplicação/
remoção testadas nos dois papéis (inclusive o caso "AGENT não pode deletar"), e as duas visões do admin
renderizadas de verdade via curl simulando cookie de sessão. Todos os usuários/empresas/anúncios de teste
(prefixo `faseb-*`) foram removidos do banco ao final — o banco voltou ao estado anterior (2 contas `AGENCY`,
0 `Company`).

**Não incluído nesta rodada, escopo deliberadamente deixado de fora** (nenhum bloqueia o que foi construído):
- **Selo "verificada" nos anúncios de empresa**: hoje `AgencyBadge` só olha `owner.accountType`/`owner.verified`
  — para um anúncio com `companyId` (`owner` é `null`), o selo nunca aparece, mesmo com `Company.verified =
  true`. A decisão 4 do doc já previa isso ("o selo passa a olhar `Company.verified`"), mas como nenhuma
  empresa real está verificada ainda, isso é invisível na prática hoje — vale resolver antes da primeira
  empresa de verdade ser verificada pelo admin. Precisa: incluir `company: {select: {verified, name}}` em
  `getListings`/`getListingById`, e um componente de badge que decida entre `owner`/`company` conforme o
  anúncio tenha `ownerId` ou `companyId`.
- **UI mobile da Fase B** (a doc já previa "web primeiro, mobile depois se fizer sentido" no passo 7).
- Billing/planos e os papéis `MANAGER`/`ADMIN`/`ASSISTANT` — fora do MVP por decisão já registrada no doc,
  só valeria a pena se o MVP `Owner`/`Agent` validar demanda real por ir além.
- Convite por e-mail assíncrono pra quem ainda não tem conta (v1 só adiciona quem já é cadastrado).

## Próximo passo concreto (retomando de onde paramos)

**As Fases 1, 3, 4 e agora a Fase B (MVP) do roadmap estão fechadas.** Fase 1: fundação — socket duplicado,
`JWT_SECRET`, CORS; Fase 3: accountType, verificação no admin, rascunho, duplicar, vitrine; Fase 4: importação
em lote via CSV, métricas por anúncio, Web Push no site + infra multiplataforma (push nativo mobile ficou
pendente, precisa de projeto EAS primeiro, ver nota abaixo); Fase B: `Company`/`CompanyMember`, criar equipe,
adicionar membro, imóveis de empresa com corretor responsável, permissões `Owner`/`Agent`, verificação de
empresa no admin (ver seção acima para detalhe completo e o que ficou de fora). Parte 5 (CRM/multi-tenant
completo, papéis extras, billing) continua sendo visão de longo prazo, **não iniciar sem o usuário pedir
explicitamente** — ver [[feedback-zhivago-scope-discipline]].

Sem um "próximo item" óbvio agora que a Fase B fechou — reler `docs/web-mobile-e-imobiliarias.md` antes de
propor o que vem depois (as pendências abertas logo abaixo são candidatas razoáveis, incluindo o selo de
verificação de empresa nos anúncios, que ficou registrado como gap acima).

Seguem em aberto (não bloqueiam nada, mas vale revisitar quando fizer sentido): telas de "esqueci minha senha"
no site, gestão de usuários comuns (não-agência) no admin panel, upload de logo (precisa de um padrão de upload
de imagem única, que não existe ainda), adicionar/remover fotos ao editar um anúncio (limitação mantida
deliberadamente em toda essa sequência de features), edição de `companyName`/`creci`/`document` depois de
criada a conta, e portar oferta/reserva para o chat funcionar por completo (ver nota acima).

**Pendência identificada em 2026-07-27 (usuário perguntou por quê não aparecia):** avaliação de imóveis
alugados (reviews) existe completa no backend (`POST`/`GET /listings/:id/reviews`, regra: só `category ===
"aluguel"` + `Booking` com `status: "CONFIRMED"`) e no mobile (`apps/mobile/app/imovel/[id].tsx` busca, lista
com estrelas e formulário de envio), mas **nunca foi portada pro site** — `apps/web/src/app/imovel/[id]/page.tsx`
não busca `/listings/:id/reviews`, `getListingById` no backend não inclui `reviews` no retorno, e
`packages/shared` não tem o campo na interface `Listing`. Não é bug nem estava listado como "fora de escopo" em
nenhum dos docs de roadmap — só ficou pra trás quando a Fase 2 portou o site. Registrado aqui como pendência,
não decidido ainda quando entrar na fila.

## Feito em 2026-07-27 (continuação): importação em lote de anúncios via CSV — Fase 4, item 1

Primeiro item da Fase 4 (evolução de imobiliárias). Decisões tomadas com o usuário antes de implementar (via
pergunta direta, não assumidas): **só web** (fluxo de back-office/desktop, mesmo racional da vitrine já ser só
Next.js), **só contas `AGENCY`** (403 para `INDIVIDUAL`, primeira restrição de ação por `accountType` no
sistema — até aqui `accountType` só controlava exibição de selo), e anúncios importados nascem sempre como
**`DRAFT`** (dono revisa e publica depois, mesmo espírito do rascunho manual).

- **Problema de design resolvido antes de codar**: criação manual de anúncio exige upload de arquivo de imagem
  (`imageUrls.length === 0` → 400) e editar um anúncio não mexe em imagem — duas regras já reafirmadas
  repetidas vezes (ver acima). Um CSV não consegue carregar bytes de arquivo, então a única forma de respeitar
  as duas regras ao mesmo tempo é a planilha trazer **URLs de imagem já hospedadas** (coluna `imagens`, uma ou
  mais URLs separadas por `|`), gravadas como estão em `ListingImage.url` sem novo processamento — mesmo padrão
  que `duplicateListing` já usa pra copiar imagens por URL, sem re-upload.
- **Backend**: novo `POST /listings/import` (`apps/server/src/controllers/listings.controller.ts`,
  `importListings`) — multipart com um campo `file` (CSV). Dependência nova: `csv-parse` (`csv-parse/sync`).
  Detecta automaticamente `;` como separador (Excel em pt-BR costuma exportar assim, já que `,` é separador
  decimal do locale) comparando a contagem de `;` vs `,` na linha de cabeçalho; remove BOM se presente; normaliza
  nomes de coluna para minúsculo. Limite de 500 linhas por arquivo (rejeita o arquivo inteiro se passar disso,
  com mensagem clara — sem truncar silenciosamente). Cada linha é validada com um schema Zod próprio
  (`importRowSchema`, colunas em português: `nome, descricao, preco, tipo, categoria, ciclo_cobranca,
  localizacao, quartos, banheiros, vagas, imagens`) — **linhas inválidas são puladas e reportadas, não travam o
  arquivo inteiro** (`{ createdCount, listings, errors: [{ row, messages }] }`); as válidas são criadas juntas
  num `prisma.$transaction`. `ciclo_cobranca` é obrigatório só quando `categoria === "aluguel"` (mesma regra do
  formulário manual). Gate de conta: `owner.accountType !== "AGENCY"` → 403 antes de processar qualquer coisa.
- **Web**: nova rota `/anuncios/importar` (`apps/web/src/app/anuncios/importar/page.tsx`), gate por
  `user.accountType !== "AGENCY"` mostrando mensagem restrita sem redirect (mesmo padrão do `/admin` com
  `role !== "ADMIN"`). Novo `ImportListingsForm` (Client Component, `useActionState`) + `importListingsAction`
  em `lib/actions/listings.ts` — **não redireciona no sucesso** (diferente de `createListingAction`/
  `updateListingAction`), porque a página precisa mostrar o resumo por linha (quantos criados, erro de cada
  linha que falhou) na mesma tela. Modelo CSV baixável em
  `apps/web/public/modelo-importacao-anuncios.csv`. Link "Importar em lote" no `/dashboard`, ao lado de "+ Novo
  anúncio", visível só se `isAgency` (variável que a página já calculava).
- **Bug real pego só na validação end-to-end** (não no typecheck): campos obrigatórios *totalmente ausentes* na
  planilha (não só vazios) caíam na mensagem genérica "Required" do Zod em vez da mensagem em português, porque
  `z.string().min(1, 'mensagem')` só aplica a mensagem do `.min()` depois de confirmar que o valor já é uma
  string — um campo `undefined` nunca chega lá. Corrigido adicionando `required_error` em `nome`, `localizacao`
  e `imagens`.
- **Gotcha de infraestrutura descoberto testando o Server Action via curl (simulando no-JS)**: nesta versão do
  Next.js (16.2.10), replicar um submit de formulário via `useActionState` exige um campo
  `<input type="hidden" name="$ACTION_REF_1"/>` (valor vazio) **além** dos já conhecidos `$ACTION_1:0`
  (descritor `{"id":...,"bound":"$@1"}`), `$ACTION_1:1` (args) e `$ACTION_KEY` — sem o `$ACTION_REF_1`, o
  Next.js recusa com "Failed to find Server Action" mesmo com o ID correto (a função
  `areAllActionIdsValid` em `next/dist/server/app-render/action-handler.js` exige explicitamente uma chave
  `$ACTION_REF_<n>` presente no FormData pro caso de "bound args", que é o caso de todo action ligado via
  `useActionState`). Vale lembrar disso da próxima vez que for simular um form com Server Action via curl nesta
  versão do Next.js.
- Validado ponta a ponta com os dois servidores reais rodando: conta `AGENCY` de teste criada via
  `/auth/register`, login real via Server Action simulado, upload de CSV com linhas válidas e inválidas
  misturadas (tipo inválido, localização/imagem ausente, aluguel sem ciclo de cobrança, URL de imagem
  malformada, separador `;` estilo Excel pt-BR) confirmando criação parcial + mensagens de erro corretas por
  linha; conta `INDIVIDUAL` de teste confirmando 403 direto no backend e mensagem restrita + link ausente no
  dashboard no site; o modelo CSV baixável (`modelo-importacao-anuncios.csv`) testado e importa sem erros.
  Submissão real do arquivo através do Server Action (não só do endpoint do backend) confirmada via curl
  simulando o form real, com o resultado (`createdCount` e lista de erros) aparecendo certo na página.
  Typecheck de `apps/server` e `apps/web` sem novos erros. Usuários, anúncios e uploads de teste removidos
  depois via script descartável; servidores de teste derrubados ao final (verificado com
  `Get-NetTCPConnection` que as portas 3000/3333 ficaram livres).

## Feito em 2026-07-28: métricas por anúncio (visualizações + contatos) — Fase 4, item 2

- **Dados**: `Listing.viewCount` (`Int @default(0)`, migração aditiva simples). "Contatos recebidos" **não**
  ganhou coluna própria — é derivado de `conversations.length` (já existe), via `_count: { select: {
  conversations: true } }` no `include` de `getMyListings`.
- **Backend**: `getListingById` passou a tentar verificar o JWT *sempre* (antes só tentava pra status
  não-públicos, pra checar dono/admin) — usa isso tanto pra manter a regra de acesso a rascunho/pendente quanto
  pra decidir se incrementa `viewCount`: incrementa só se o status é público (`APPROVED`/`SOLD`) **e** quem
  está vendo não é o próprio dono (senão o dono olhando o próprio anúncio infla a métrica que ele mesmo está
  checando). Incremento é fire-and-forget (não usa `await`), não atrasa nem quebra a resposta se falhar.
  Contador é bruto, sem deduplicar por visitante/sessão (uma pessoa dando refresh 10x conta 10 views) —
  simplificação deliberada de MVP, mesmo espírito de outras decisões já tomadas no projeto.
- **Web**: `OwnerListingCard` ganhou uma linha com ícones (`Eye`/`MessageCircle` do lucide-react) mostrando
  "N visualizações" e "N contatos".
- **Mobile**: `my-listings.tsx` ganhou a mesma linha (ícones Ionicons `eye-outline`/`chatbubble-outline`).
- **Tipos compartilhados**: `Listing.viewCount` adicionado em `packages/shared`.
- Validado ponta a ponta com os dois servidores reais: dono vendo o próprio anúncio não incrementa
  (`viewCount` ficou em 0), visitante autenticado incrementa (foi pra 1), visitante anônimo (sem token)
  também incrementa (foi pra 2); conversa aberta por um visitante fez `_count.conversations` aparecer como 1 em
  `GET /me/listings`; confirmado renderizando "2 visualizações" e "1 contato" no HTML real do `/dashboard`
  (login simulado via curl). Usuários e anúncio de teste removidos depois.

## Feito em 2026-07-27 (continuação): Web Push (VAPID) + infra multiplataforma de push — Fase 4, item 3

Decisão tomada com o usuário antes de codar: como o mobile não tem projeto EAS configurado (sem `eas.json`,
sem `projectId` no `app.json`), pegar um Expo push token real não funciona nesse ambiente — implementei **só a
parte web funcional** + toda a infra de backend (que já serve os dois, mobile só precisa registrar um device
quando o EAS existir).

- **Dados**: `User.pushToken` (coluna única) virou tabela `UserDevice` (`platform: "IOS"|"ANDROID"|"WEB"`,
  `token`, único em `userId+platform` — um device por usuário por plataforma, o mais recente substitui o
  anterior; limitação deliberada de MVP, não modela múltiplos dispositivos simultâneos da mesma plataforma).
  Migração escrita à mão (recreate-table do `User` pra tirar a coluna, como de praxe no SQLite) migrando
  qualquer `pushToken` existente como `ANDROID` (única plataforma mobile já exercitada). `token` guarda o Expo
  push token (IOS/ANDROID) ou o JSON serializado da `PushSubscription` inteira do navegador (WEB) — sem
  colunas extras pra chaves, só pra bater com o formato mínimo que o próprio roadmap já sugeria.
- **Backend**: nova dependência `web-push` + par de chaves VAPID reais gerado e colocado em `apps/server/.env`
  (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, chave pública também em
  `apps/web/.env.local` como `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) — ausência delas não derruba o boot (diferente do
  `JWT_SECRET`), só desativa o envio de Web Push. `notification.service.ts` reescrito: busca todos os
  `UserDevice` do destinatário, manda via `expo-server-sdk` pros de IOS/ANDROID e via `web-push` pros de WEB;
  se o `web-push` retornar 404/410 (inscrição expirada/revogada pelo navegador), apaga o device automaticamente
  pra não tentar de novo. `PATCH /users/me/push-token` agora recebe `{platform, token}` e faz upsert.
- **Web**: novo `public/sw.js` (Service Worker — mostra a notificação no evento `push`, foca/abre janela no
  `notificationclick`), novo `PushNotificationOptIn` (Client Component, botão "🔔 Ativar notificações" no
  `/dashboard`) que registra o SW, pede permissão do navegador **só no clique** (nunca automático ao carregar a
  página — anti-padrão de UX), assina via `pushManager.subscribe` com a chave VAPID pública, e manda a
  inscrição pro backend. Detecta os 3 estados (`default`/`denied`/`subscribed`) e silenciosamente
  re-sincroniza a inscrição existente se a permissão já tiver sido concedida antes.
- **Bug pego durante o typecheck** (não em runtime): `Uint8Array` da chave VAPID convertida não batia com o
  tipo `BufferSource` esperado por `applicationServerKey` nesta versão do TS/lib.dom (`Uint8Array<ArrayBufferLike>`
  vs `ArrayBuffer` — TS 5.7+ tornou `Uint8Array` genérico) — resolvido com um cast pontual.
- **Não portado, decisão explícita do usuário**: registro real de push no mobile (`expo-notifications` já é
  dependência mas nunca chama `getExpoPushTokenAsync`) — bloqueado por não existir projeto EAS configurado;
  fica pendente até o usuário criar um (`eas init`, precisa de conta Expo).
- Validado ponta a ponta com os dois servidores reais: `PATCH /users/me/push-token` testado com plataforma
  inválida (400 com mensagem Zod — endpoint corrigido nessa validação pra parar de devolver 500 genérico em
  qualquer erro), inscrição WEB (JSON de `PushSubscription`) e device ANDROID (Expo token) registrados pro
  mesmo usuário sem duplicar (upsert confirmado direto no SQLite); reregistro do backend/frontend real após a
  migração; mensagem de chat real via socket.io disparando `sendNotification` — `Notification` criada no
  banco, ambos os `UserDevice` sobrevivem (nenhum recebeu 404/410, só falha de conexão esperada de endpoints
  falsos de teste); `/sw.js` confirmado servido com `Content-Type: application/javascript`; `/dashboard`
  confirmado renderizando o botão "Ativar notificações" pra um usuário logado de verdade (via curl simulando
  login real). **Não testado**: o clique real do botão num navegador de verdade (pedir permissão, assinar,
  receber a notificação) — o usuário não tinha a extensão Claude in Chrome instalada nesta sessão; ele precisa
  testar esse último passo manualmente. Dados de teste (2 usuários, 1 anúncio, conversa, mensagem, upload)
  removidos depois.

## Feito em 2026-07-27: fechando a Fase 1 (fundação)

Os 3 itens de fundação que ficaram pendentes desde a decisão de separar mobile/web foram fechados nesta sessão:

- **Bug de socket duplicado no mobile**: `apps/mobile/app/chat/[id].tsx` criava sua própria conexão
  `io(API_URL, ...)` em vez de reusar o socket global de `ChatContext`. Agora consome `useChat().socket`: um
  `useEffect` separado só registra/remove o listener `receiveMessage` (`socket.on`/`socket.off`) por conversa
  aberta, sem chamar `disconnect()` (o socket é do contexto, não da tela — quem fecha a conexão é o
  `ChatContext` no logout). `sendMessage` também passou a emitir pelo socket do contexto.
- **`JWT_SECRET` sem fallback perigoso**: novo `apps/server/src/lib/env.ts` centraliza a leitura — se
  `JWT_SECRET` não estiver definido e `NODE_ENV === 'production'`, lança erro e recusa subir; fora de produção,
  só avisa no console e usa um valor de dev óbvio (`insecure_dev_only_fallback_do_not_use_in_production`).
  `server.ts` (plugin `@fastify/jwt`) e `socket.ts` (verificação manual do handshake) agora importam
  `JWT_SECRET` daqui em vez de cada um ter seu próprio `?? 'fallback_secret_change_in_production'`.
- **CORS restrito**: novo `ALLOWED_ORIGINS` em `env.ts`, lido de `WEB_URL` no `.env` (`http://localhost:3000` em
  dev, suporta lista separada por vírgula para múltiplos domínios em produção). Usado tanto no `@fastify/cors`
  quanto no CORS do Socket.io — antes eram `origin: true` e `origin: '*'`. O app mobile não envia header
  `Origin` (não é navegador), então não é afetado; validado com curl que origem permitida recebe
  `Access-Control-Allow-Origin` e origem não listada (e requisição sem `Origin`, simulando mobile) não recebe,
  mas a requisição em si não é bloqueada no servidor (bloqueio de CORS é sempre client-side, no navegador).
- Validado com o servidor real rodando: boot normal com o `.env` atual (sem warning, pega o secret certo),
  simulação de `NODE_ENV=production` sem `JWT_SECRET` lança e recusa subir, boot sem `JWT_SECRET` fora de
  produção emite o warning e sobe mesmo assim. Typecheck de `apps/server` e `apps/mobile` sem novos erros
  (erros pré-existentes de `exactOptionalPropertyTypes` em outros controllers não têm relação com esta mudança).
- Processo de teste do server derrubado ao final; nesta sessão o PID do MSYS/bash não bateu com o PID real do
  Windows — foi preciso achar o PID real via `Get-NetTCPConnection -LocalPort 3333` e `taskkill //PID`.

## Pendências de fundação que ainda não foram feitas (Fase 1 do roadmap)

Nenhuma — os 3 itens acima fechavam a Fase 1 por completo.

~~Múltiplas imagens por anúncio (`ListingImage`)~~ — feito em 2026-07-18 (ver acima).
~~Socket duplicado no chat mobile~~, ~~`JWT_SECRET` sem fallback~~, ~~CORS restrito~~ — feito em 2026-07-27 (ver
acima).

## 2026-08-30: CRM B2B (Organization/OrganizationMember) — Fase 1 implementada

Usuário trouxe uma especificação detalhada de CRM B2B (Organization/OrganizationMember/Lead/LeadAssignment/
LeadInteraction/Visit/Proposal, distribuição round-robin, SLA) pedindo análise de viabilidade antes de
qualquer código. Análise completa, schema proposto e decisões de arquitetura registrados em
`docs/crm-b2b-organizacoes-leads.md` — leia esse documento antes de tocar em qualquer coisa relacionada a
`Organization`. Resumo do que já existe: `Company`/`CompanyMember` (Fase B) foi **evoluído** (não duplicado)
para `Organization`/`OrganizationMember` com 4 papéis (`OWNER`/`ADMIN`/`MANAGER`/`BROKER`), convite por
e-mail via `OrganizationInvite` (token + expiração, único caminho de ingresso), permissões checadas 100% no
backend via `requireOrgRole`. Migração de dados existentes preservada (nenhum dado apagado). Validado
ponta a ponta com 26 asserções contra o servidor real — detalhe completo, incluindo um bug real encontrado e
corrigido durante o teste (auto-criação de organização fantasma para ex-membros), está na seção "Fase 1 —
IMPLEMENTADA" de `docs/crm-b2b-organizacoes-leads.md`.

**Não iniciar a Fase 2 do CRM (Lead/LeadAssignment/distribuição) sem o usuário pedir explicitamente** — mesma
disciplina de escopo de sempre, ver [[feedback-zhivago-scope-discipline]].

## 2026-08-30 (continuação): CRM B2B — Fase 2 implementada (Lead, LeadAssignment, distribuição)

Usuário pediu explicitamente para iniciar a Fase 2. Implementada de ponta a ponta na mesma sessão: `model
Lead` e `model LeadAssignment` (schema, migração `20260830130000_add_leads`, só `CREATE TABLE`), distribuição
em dois modos por organização (`MANUAL` padrão, `ROUND_ROBIN` cicla `OrganizationMember` `BROKER`/`ACTIVE`),
gatilho via chat existente. **Achado durante a exploração**: chat em imóveis de organização estava quebrado
antes desta rodada (`createOrGetConversation` dava 400 sempre que `ownerId` era `null`, o que é sempre o caso
pra imóvel de organização desde a Fase B) — corrigido como parte do gatilho do Lead (contato passa a ser
`listing.ownerId ?? listing.agentId`). Endpoints novos: `GET /leads`, `GET /leads/mine`,
`PATCH /leads/:id/assign`, `PATCH /leads/:id/status`, `PATCH /organizations/lead-distribution-mode`. Web
ganhou uma seção mínima "Leads" em `/equipe` (lista + atribuir + status + toggle de modo de distribuição) —
sem Kanban, isso é Fase 3. Validado com 37 asserções via script Node contra a API real + 1 submissão real de
Server Action a partir do HTML servido por `/equipe`. Detalhe completo, incluindo a decisão registrada sobre
o segundo participante da conversa não trocar quando um Lead é reatribuído (gap conhecido), está na seção
"Fase 2 — IMPLEMENTADA" de `docs/crm-b2b-organizacoes-leads.md`.

**Não iniciar a Fase 3 do CRM (LeadInteraction, Visit, pipeline Kanban) sem o usuário pedir explicitamente** —
mesma disciplina de escopo de sempre, ver [[feedback-zhivago-scope-discipline]].

## 2026-08-30 (continuação): CRM B2B — Fase 3 implementada (LeadInteraction, Visit, pipeline Kanban)

Usuário pediu para seguir pra próxima fase ("pode ir pra próxima"). Confirmado antes de codar: a tabela
simples de leads da Fase 2 em `/equipe` foi **removida**, substituída por um link "Ver pipeline de leads →" —
`/imobiliaria` (rota nova, coexiste sem conflito com `/imobiliaria/[id]`, a vitrine pública) passou a ser a
única tela de gestão de leads: um Kanban por status (sem drag-and-drop — mover de coluna é via `<select>`,
mesmo componente `LeadStatusSelect` da Fase 2, decisão deliberada por não haver nenhuma dependência de DnD no
projeto) com link pra `/imobiliaria/leads/[id]` (detalhe: atribuição, linha do tempo de interações, visitas).
Schema novo: `model LeadInteraction` e `model Visit` (migração `20260830140000_add_lead_interactions_visits`,
só `CREATE TABLE`). Endpoints novos: `GET /leads/:id`, `POST /leads/:id/interactions` (`STATUS_CHANGE`
reservado ao auto-log, não escolhível manualmente), `POST /leads/:id/visits` (exige atribuição aberta),
`PATCH /visits/:id/status`. `PATCH /leads/:id/status` agora auto-loga uma `LeadInteraction STATUS_CHANGE` a
cada mudança real de status — deu uso ao valor do enum que só existia no schema desde a Fase 2.
`LeadAssignment.firstContactAt` (campo já existia desde a Fase 2, reservado pra SLA) passou a ser preenchido
de verdade, só na 1ª interação de cada atribuição. Validado com 23 asserções via script Node + 1 submissão
real de Server Action a partir do HTML servido por `/imobiliaria/leads/[id]`. Detalhe completo na seção
"Fase 3 — IMPLEMENTADA" de `docs/crm-b2b-organizacoes-leads.md`.

**Não iniciar a Fase 4 do CRM (SLA, métricas, distribuição SMART) sem o usuário pedir explicitamente** —
mesma disciplina de escopo de sempre, ver [[feedback-zhivago-scope-discipline]].

## 2026-08-30 (continuação): CRM B2B — Fase 4 implementada (parcial, por decisão do usuário)

Usuário pediu explicitamente ("faça a fase 4"). Três decisões de escopo confirmadas antes de codar (o doc
deixava todas em aberto): **SLA é só indicador visual sob demanda** (sem job/notificação proativa — o
projeto não tem nenhum cron em background e criar essa infra só para isso não se pagava), **limite fixo de
3h "em risco"/4h "atrasado"** (constante no código, não configurável por organização), e **distribuição
`SMART` continua adiada** (3ª vez que essa decisão é tomada). Entregue: `computeSlaStatus` em
`lib/leads.ts` (puro cálculo a partir de `assignedAt`/`firstContactAt`, zero migração —
`UNASSIGNED`/`ON_TIME`/`AT_RISK`/`OVERDUE`, embutido em toda resposta de lead) e `GET /organizations/metrics`
(funil por status, conversão, tempo médio de resposta, % dentro do SLA, leads/mês, desempenho por corretor —
`Ver métricas` já era ❌ pra BROKER desde o desenho original da Fase 1). Web: `/imobiliaria` ganhou toggle
`?view=pipeline|metricas` (mesmo padrão do `/admin`), `SlaBadge` nos cards do Kanban e no detalhe do lead,
aba Métricas reaproveitando o `LineChart` já existente. Validado com 14 asserções via script Node
(retrocedendo `assignedAt` manualmente no banco pra simular os estados de SLA sem esperar horas de verdade)
+ 1 submissão real de Server Action. Detalhe completo na seção "Fase 4 — IMPLEMENTADA" de
`docs/crm-b2b-organizacoes-leads.md`.

**Em aberto, por decisão explícita do usuário, sem data prevista** — só entram se/quando ele pedir:
notificação proativa de SLA (1º job/cron do projeto), limite de SLA configurável por organização,
distribuição `SMART` (região/especialidade/carga).

## 2026-08-30 (continuação): itens soltos pós-Fase 4 — bugs de organização, papel ASSISTANT, billing mock

Usuário perguntou se todas as fases estavam feitas ou se faltava uma "Fase 5" — confirmado que não existe
nenhuma escrita em doc nenhum (só menções soltas de itens deixados de fora). Usuário pediu pra fechar tudo,
incluindo billing (mock/manual, sem Stripe). Três decisões via `AskUserQuestion`: billing mock
(`Organization.plan` FREE/PRO, botão "simular assinatura", sem cobrança real), planos FREE (até 2 `BROKER`,
sem CRM) vs PRO (CRM completo), `ASSISTANT` (5º papel, somente leitura). **Achado corrigindo a própria
memória**: o gap de `/dashboard`/`/meus-anuncios` ignorarem `organizationId` já tinha sido corrigido na Fase
1; o que continuava quebrado de verdade era mais específico — `/imovel/[id]` escondia a seção "Anunciado por"
inteira pra imóvel de organização, e `/imobiliaria/[id]` (vitrine pública) mostrava zero imóveis pra quem
criou uma organização. Ambos corrigidos, junto com `ASSISTANT` (backend: `canViewLeadAccess` separado de
`resolveLeadAccess`; web: `canManage`/`canMutate` decidindo o que vira controle vs texto) e billing mock
(`requirePlan('PRO')` protegendo toda rota de CRM, chat sem Lead em organização FREE, limite de 2 `BROKER`
no FREE, `PlanToggle` em `/equipe`, aviso de upgrade em `/imobiliaria`). Validado com 21 asserções via script
Node + verificação visual das 4 telas + 1 submissão real de Server Action. Detalhe completo na seção
"itens soltos pós-Fase 4" de `docs/crm-b2b-organizacoes-leads.md`.

Com isso, todo o CRM B2B (Fases 1-4) e os itens soltos que ficaram pendentes ao longo do projeto estão
fechados. O que continua fora, só por decisão explícita do usuário quando pedir: notificação proativa de SLA
(exige o 1º job/cron do projeto), SLA configurável por organização, distribuição `SMART`, integração real de
pagamento (Stripe ou outro) no lugar do billing mock, e a Parte 5 do roadmap maior
(`docs/web-mobile-e-imobiliarias.md`) — que também nunca foi escrita, só é mencionada como visão de longo
prazo.
