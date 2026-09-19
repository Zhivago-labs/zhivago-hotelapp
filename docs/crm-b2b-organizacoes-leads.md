# Zhivago — CRM B2B (Organization/Lead) sobre o marketplace existente

Documento de análise técnica e plano de ação. Data de referência: 2026-08-30. Registra a proposta trazida
pelo usuário para transformar o modelo atual de "imobiliária com equipe" (`Company`/`CompanyMember`, Fase B)
numa estrutura B2B completa com CRM de leads, sem quebrar o marketplace atual. **Especificação revisada e
fechada pelo usuário em 2026-08-30** (4 ajustes sobre a primeira versão, ver seção "Revisão do usuário"
abaixo) — **ainda aguardando autorização explícita para iniciar a codificação da Fase 1**, nada abaixo foi
codado ainda.

## Revisão do usuário (2026-08-30) — decisões que fecham a especificação

1. **Decisão da pergunta 1: evoluir, não duplicar.** `Company → Organization`, `CompanyMember →
   OrganizationMember`. Confirmado — criar uma estrutura paralela seria duplicação desnecessária e risco de
   inconsistência.
2. **`userId @unique` mantido na V1, mas documentado como escolha de versão, não limite arquitetural
   definitivo.** Ver seção "Multi-organização" abaixo.
3. **Convite simplificado**: um único caminho (`OrganizationInvite → aceito → OrganizationMember ACTIVE`)
   para todo mundo, exista ou não o `User` no momento do convite — nada de `OrganizationMember` em estado
   `INVITED`. Ver seção "Fluxo de convite" revisada.
4. **Distribuição de leads em dois modos explícitos** (`MANUAL` e `ROUND_ROBIN`, escolhido por organização),
   em vez de round robin como comportamento padrão único — evita atribuir por ordem de fila um imóvel de alto
   padrão para quem é especialista em aluguel. Distribuição inteligente por especialidade/região fica de fora
   da V1, arquitetura só precisa deixar espaço para o modo `SMART` no futuro.
5. **Sem `currentAssignmentId` no `Lead`.** Otimização prematura — `LeadAssignment WHERE leadId = X AND
   unassignedAt IS NULL` resolve isso no MVP.
6. **Decisão de produto para a UI**: rótulos em português por papel — `OWNER` → "Proprietário", `ADMIN` →
   "Administrador", `MANAGER` → "Gerente", `BROKER` → "Corretor". Nunca "vendedor" na interface — o produto é
   específico para imobiliárias, não um CRM genérico de vendas.

---

## Ponto de partida: o que já existe hoje (não é greenfield)

| Pedido do usuário | Já existe como | Estado |
|---|---|---|
| `Organization` | `model Company` (`id, name, document, verified, createdAt`) | Real, em uso no projeto |
| `OrganizationMember` | `model CompanyMember` (`userId` `@unique`, `role`: `OWNER\|AGENT`, `status` sempre `ACTIVE`, `companyId`) | Real, convite simplificado (`POST /companies/members` por e-mail, sem estado `INVITED`) |
| `Property` | `model Listing` — já tem `ownerId` (pessoa física) **XOR** `companyId`+`agentId` (empresa) | Regra XOR já implementada e testada em produção do projeto |
| Autenticação | JWT só carrega `{id, tokenVersion}`; toda rota que precisa de contexto de empresa faz `prisma.companyMember.findUnique({where:{userId}})` fresco no banco a cada request — nunca confia no token pra isso | Padrão já estabelecido — a proposta segue ele |
| "Lead" | Não existe como entidade — hoje "demonstrar interesse" = abrir uma `Conversation` (chat) ligada ao `Listing` | Ponto de integração natural para criar o `Lead` |
| `User.role` | `"USER" \| "ADMIN"` — plataforma inteira, não por organização | Continua assim; permissão de organização é um conceito à parte, checado via `OrganizationMember`, não via `User.role` |
| `User.accountType` | `"INDIVIDUAL" \| "AGENCY"` (Fase A — imobiliária solo, sem equipe): `document`, `creci`, `companyName`, `logoUrl`, `verified` | Não muda — convive com a estrutura de organização, ver decisão 2 abaixo |

---

## Decisões de arquitetura (pontos que definem o resto do documento)

### 1. Evoluir `Company`/`CompanyMember` em vez de duplicar

Em vez de criar `Organization`/`OrganizationMember` como modelos novos e paralelos, a recomendação é
**evoluir o modelo existente** (rename + campos novos). Motivo: `Company`/`CompanyMember` já tem 8 endpoints,
tela de equipe (`/equipe`), verificação no admin e regras de propriedade de imóvel funcionando — recriar do
zero duplicaria o que já existe e exigiria migrar dados reais duas vezes (uma agora, outra se um dia
unificar). Concretamente:

- `Company` → `Organization`: mantém `document` (CNPJ) e `verified` (usados pelo selo/admin hoje),
  **adiciona** `type`, `email`, `phone`, `logo`, `description`, `updatedAt`.
- `CompanyMember` → `OrganizationMember`: expande `role` de `OWNER|AGENT` para `OWNER|ADMIN|MANAGER|BROKER`
  (linhas existentes com `AGENT` migram para `BROKER` na migração de dados). `status` passa a ter
  `ACTIVE|INACTIVE` (sem `INVITED` — ver decisão de convite revisada abaixo, o membro só é criado quando o
  convite já foi aceito). `userId` continua `@unique` — decidido explicitamente como escolha de V1, não
  limite definitivo, ver "Multi-organização" logo abaixo.
- `Listing.companyId` → `Listing.organizationId` (rename de coluna). `Listing.agentId` mantém o nome (virar
  `brokerId` seria só cosmético, alto custo de blast radius sem ganho funcional).
- `Listing` **não** é renomeado para `Property` — tocaria em toda controller, rota, tipo compartilhado e
  componente web/mobile que já usam "listing" hoje, sem ganho funcional. "Property"/"imóvel" continua sendo
  só o termo de produto/CRM na UI.
- `User.accountType/verified/companyName/creci/document/logoUrl` (Fase A, imobiliária solo sem equipe)
  **não muda** — continua servindo quem não quer estrutura de equipe, exatamente como hoje.

Decidido: evoluir o modelo existente, sem estrutura paralela. Ponto fechado.

### 1.1 Multi-organização (documentando o que `userId @unique` significa de fato)

`OrganizationMember.userId @unique` = **um usuário pertence a no máximo uma organização ativa na V1** — não
é uma limitação arquitetural definitiva, é uma simplificação deliberada desta versão. Trocar de imobiliária
(sair da A, entrar na B) já funciona sem fricção: basta remover o `OrganizationMember` antigo e criar um
novo. O que a V1 não resolve — de propósito, não por limitação de design — é alguém pertencer a **duas
organizações simultaneamente**; isso exigiria um conceito de "organização ativa" na sessão, que o projeto já
decidiu adiar (mesma lógica documentada em `docs/web-mobile-e-imobiliarias.md`, Parte 3.1, decisão 3). Se
essa necessidade aparecer de verdade, a mudança é aditiva (trocar `@unique` por índice composto
`[userId, organizationId]` + campo de "organização ativa"), não uma reforma.

### 2. Convivência com a Fase A (conta AGENCY solo, sem equipe)

Nenhuma mudança na Fase A. Uma organização só passa a existir quando o dono de uma conta `AGENCY` decide
criar uma equipe (ação opt-in, já é assim hoje) — sem migração automática de contas existentes.

### 3. Escopo do CRM: só imóveis de organização

`Lead.organizationId` é obrigatório — Lead só existe para imóvel de empresa (`Listing.organizationId`
preenchido). Imóvel de pessoa física continua só com o chat existente, sem CRM. Isso mantém o CRM como uma
camada B2B sobre o marketplace, não uma reforma do marketplace inteiro (regra explícita do usuário: não
transformar tudo em CRM).

---

## Modelos — o que muda e o que é novo

### Evoluídos (rename + campos novos, dados preservados)

**`Organization`** (era `Company`)
```prisma
model Organization {
  id          String @id @default(uuid())
  name        String
  type        String  @default("AGENCY") // "AGENCY" | "INDIVIDUAL" (reservado p/ CONSTRUTORA, INCORPORADORA no futuro)
  document    String  // CNPJ — mantido do modelo atual
  email       String?
  phone       String?
  logo        String?
  description String?
  verified    Boolean @default(false) // mantido do modelo atual — selo de verificação do admin

  members  OrganizationMember[]
  invites  OrganizationInvite[]
  listings Listing[]

  leadDistributionMode String  @default("MANUAL") // "MANUAL" | "ROUND_ROBIN" — "SMART" reservado p/ Fase 4
  leadRoundRobinCursor String? // último OrganizationMember que recebeu um lead (só usado em modo ROUND_ROBIN)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**`OrganizationMember`** (era `CompanyMember`)
```prisma
model OrganizationMember {
  id     String @id @default(uuid())
  role   String @default("BROKER") // "OWNER" | "ADMIN" | "MANAGER" | "BROKER"
  status String @default("ACTIVE") // "ACTIVE" | "INACTIVE" — sem INVITED: membro só existe após aceitar convite

  userId String @unique // v1: um usuário pertence a no máximo uma organização
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([organizationId])
}
```

**`Listing`**: `companyId`/`company` renomeados para `organizationId`/`organization`; `agentId`/`agent` mantidos.

### Novos (não existem hoje)

**`OrganizationInvite`** — caminho único de convite, exista ou não o `User` no momento do convite (revisão do
usuário: nada de `OrganizationMember` em estado `INVITED` como caminho paralelo — um `OrganizationMember` só
passa a existir quando o convite já foi aceito)
```prisma
model OrganizationInvite {
  id             String   @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  email          String
  role           String
  invitedBy      String    // userId de quem convidou
  token          String    @unique
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime  @default(now())

  @@index([organizationId])
  @@index([email])
}
```
Mesmo padrão que `User.resetToken`/`resetTokenExpiry` já usa hoje para reset de senha.

```
Organization
    │
    ├── OrganizationMember[]   (ACTIVE | INACTIVE — só existe após aceite)
    │
    └── OrganizationInvite[]   (pendente até acceptedAt ser preenchido)
```

**`Lead`** (Fase 2)
```prisma
model Lead {
  id             String @id @default(uuid())
  userId         String
  user           User   @relation(fields: [userId], references: [id])
  listingId      String
  listing        Listing @relation(fields: [listingId], references: [id])
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  status         String @default("NEW") // NEW|CONTACTED|QUALIFIED|VISIT_SCHEDULED|PROPOSAL|NEGOTIATION|WON|LOST
  source         String // ex.: "CHAT", futuramente "SITE_FORM", "WHATSAPP", etc.

  assignments  LeadAssignment[]
  interactions LeadInteraction[]
  visits       Visit[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([organizationId, status])
  @@index([listingId])
}
```

**`LeadAssignment`** (Fase 2)
```prisma
model LeadAssignment {
  id         String   @id @default(uuid())
  leadId     String
  lead       Lead     @relation(fields: [leadId], references: [id])
  brokerId   String   // aponta para OrganizationMember, não User — garante que o corretor pertence à organização
  broker     OrganizationMember @relation(fields: [brokerId], references: [id])
  assignedBy String?  // OrganizationMember que atribuiu manualmente; null = round robin automático
  assignedAt DateTime @default(now())
  firstContactAt DateTime? // preenchido na 1ª LeadInteraction — base para SLA na Fase 4
  unassignedAt   DateTime?
  reason         String?

  @@index([leadId])
  @@index([brokerId])
}
```

**`LeadInteraction`** (Fase 3)
```prisma
model LeadInteraction {
  id       String @id @default(uuid())
  leadId   String
  lead     Lead   @relation(fields: [leadId], references: [id])
  memberId String // OrganizationMember que registrou a interação
  member   OrganizationMember @relation(fields: [memberId], references: [id])
  type     String // PHONE_CALL|WHATSAPP|EMAIL|NOTE|VISIT|STATUS_CHANGE
  content  String?

  createdAt DateTime @default(now())

  @@index([leadId])
}
```

**`Visit`** (Fase 3)
```prisma
model Visit {
  id         String   @id @default(uuid())
  leadId     String
  lead       Lead     @relation(fields: [leadId], references: [id])
  brokerId   String
  broker     OrganizationMember @relation(fields: [brokerId], references: [id])
  scheduledAt DateTime
  status     String   @default("SCHEDULED") // SCHEDULED|CONFIRMED|COMPLETED|CANCELLED|NO_SHOW
  notes      String?

  createdAt DateTime @default(now())

  @@index([leadId])
}
```
`listingId` não é duplicado aqui — deriva-se de `lead.listingId`, evitando uma segunda fonte de verdade.

**Sem `currentAssignmentId` em `Lead`**: cogitado e descartado — otimização prematura para o MVP. Descobrir
o corretor atual é uma query direta (`LeadAssignment WHERE leadId = X AND unassignedAt IS NULL`), não precisa
de um campo desnormalizado agora. Revisitar só se essa consulta virar gargalo real de performance.

**`Proposal`**: **não criar agora**. `Lead.status = "PROPOSAL"` já cobre o estágio do funil; uma entidade
própria (valor, condições, PDF) só se justifica quando a UI precisar guardar detalhes da proposta — não está
nas Fases 1–4 do roadmap. Fica registrado como opção futura, não implementar sem pedido explícito.

---

## Autenticação e permissões

Sem organização no JWT — mesmo padrão que o projeto já usa hoje (JWT só carrega `{id, tokenVersion}`,
tudo mais é lido fresco do banco a cada request). Nova peça: `requireOrgRole(...roles)`, um middleware no
mesmo estilo do `requireAdmin` já existente, usado como `preHandler` em toda rota B2B — busca o
`OrganizationMember` do usuário autenticado no banco e confere a role, nunca aceita `organizationId` vindo do
corpo da requisição do frontend (regra 17 do pedido original: nunca confiar no client para isso).

Matriz de permissões (checada no backend, não escondendo botão no frontend):

**Rótulos em português na UI (decisão de produto, revisão do usuário)**: `OWNER` → "Proprietário", `ADMIN` →
"Administrador", `MANAGER` → "Gerente", `BROKER` → "Corretor". Os valores de `role` no backend continuam em
inglês (consistente com o resto do enum-como-string do projeto: `status`, `category`, `accountType`); só a
UI traduz. Nunca "vendedor" — o produto é específico para imobiliárias, não um CRM genérico.

| Ação | OWNER | ADMIN | MANAGER | BROKER |
|---|:-:|:-:|:-:|:-:|
| Gerenciar organização (dados, verificação) | ✅ | — | — | — |
| Convidar / remover membros | ✅ | ✅ | — | — |
| Ver todos os imóveis da organização | ✅ | ✅ | ✅ | — (só os atribuídos) |
| Ver todos os leads da organização | ✅ | ✅ | ✅ (da equipe) | — (só os próprios) |
| Distribuir leads (manual) | ✅ | ✅ | ✅ | — |
| Ver métricas | ✅ | ✅ | ✅ | — |
| Criar/editar imóvel | ✅ (qualquer) | ✅ (qualquer) | — | ✅ (só os seus) |
| Atualizar lead / registrar interação / agendar visita | ✅ | ✅ | ✅ | ✅ (só os seus) |

---

## Fluxo de convite (Fase 1) — revisado: um único caminho

1. `OWNER`/`ADMIN` chama `POST /organizations/invites {email, role}`.
2. Backend valida `requireOrgRole(['OWNER','ADMIN'])`, bloqueia com 409 se o e-mail já corresponde a um
   `User` que pertence a outra organização (mesma checagem de hoje, só antecipada para o momento do convite).
3. Cria **sempre** um `OrganizationInvite` (token + expiração) — independe de o `User` já existir ou não.
   - Se o e-mail já é um `User` cadastrado: notifica via `Notification` (model já existente) + e-mail
     (reaproveitando `mail.ts`, já usado no reset de senha).
   - Se não é: o convite fica pendente; nada acontece até a pessoa criar conta ou logar com aquele e-mail.
4. Aceite, em ambos os casos: `POST /organizations/invites/:token/accept` — exige estar autenticado com um
   `User` cujo e-mail bate com o do convite. Cria o `OrganizationMember` (`status: ACTIVE`) e marca
   `OrganizationInvite.acceptedAt = now()`. Recusar → marca o convite como expirado/recusado sem criar nada.
5. Se o e-mail do convite ainda não tem conta, o fluxo de cadastro (`/cadastro`) detecta um `OrganizationInvite`
   pendente para aquele e-mail e oferece aceitar logo após criar a conta — sem passo manual extra.

Vantagem sobre a v1 anterior: só existe **um** jeito de virar membro (aceitar convite), nunca um
`OrganizationMember` "meio existente" antes do aceite. Nunca cria conta de usuário duplicada — regra 3/4 do
pedido original mantida.

---

## Distribuição de leads (Fase 2)

- **Gatilho do Lead**: reaproveita o fluxo de chat que já existe (`POST /conversations` num imóvel de
  organização) como ponto de criação do `Lead` — evita inventar uma ação nova de "demonstrar interesse"
  quando já existe uma que captura exatamente isso.
- **Dois modos explícitos por organização** (`Organization.leadDistributionMode`), não round robin como
  comportamento padrão único — round robin puro atribui por ordem de fila, ignorando especialidade
  (exemplo do usuário: um apartamento de R$1,5mi cair para quem é especialista em aluguel só porque era a vez
  dela). A V1 não resolve isso com inteligência, resolve dando à organização a escolha do modo:
  - **`MANUAL`** (padrão): todo `Lead` novo nasce sem `LeadAssignment` — `OWNER/ADMIN/MANAGER` escolhem um
    `OrganizationMember` com `role: BROKER` e `status: ACTIVE` da mesma organização pelo painel; fecha
    (`unassignedAt` + `reason`) a atribuição anterior se houver, cria uma nova `LeadAssignment` — histórico
    completo preservado, nunca sobrescreve. Redistribuição manual sempre disponível, independente do modo.
  - **`ROUND_ROBIN`**: para quem quer distribuição automática simples. Usa `Organization.leadRoundRobinCursor`
    (último `OrganizationMember` que recebeu um lead); o próximo lead vai para o próximo `BROKER` ativo na
    ordem, ciclando. Exclui `INACTIVE` e qualquer role que não seja `BROKER` — regra 9 do pedido original.
- **`SMART` reservado, não implementado**: região, especialidade, faixa de preço, carga de trabalho,
  desempenho ficam como um terceiro valor futuro de `leadDistributionMode` — o modelo já comporta (
  `LeadAssignment` guarda histórico completo, `Lead`/`Listing` já carregam localização/tipo/preço que uma
  regra futura consultaria), mas não é resolvido nem tentado nesta fase.

---

## SLA (preparação apenas — Fase 4)

`LeadAssignment.assignedAt` (já existe desde a Fase 2) e `firstContactAt` (preenchido pela primeira
`LeadInteraction` de um lead, Fase 3) já deixam pronto o cálculo de `responseTime = firstContactAt -
assignedAt` sem precisar de nova migração quando a Fase 4 chegar. Alertas e redistribuição automática por
SLA ficam fora de escopo até lá, conforme pedido explícito de não aumentar complexidade agora.

---

## Arquitetura consolidada

```
                         ZHIVAGO
                            │
              ┌─────────────┴─────────────┐
              │                           │
           MARKETPLACE                   B2B
              │                           │
           User                         Organization
              │                           │
              │                    ┌──────┴──────┐
              │                    │             │
              │                 Members       Invites
              │                    │
              │             ┌──────┼──────┐
              │             │      │      │
              │           OWNER  MANAGER BROKER
              │            (+ADMIN, omitido no desenho por espaço)
              ▼
           Listing
              │
       ┌──────┴───────┐
       │              │
   ownerId       organizationId
 pessoa física       │
                     ▼
                   Lead
                     │
                     ▼
              LeadAssignment
                     │
                     ▼
                  Broker
                     │
              ┌──────┼───────┐
              ▼      ▼       ▼
         Interaction Visit  Pipeline
```

**Cadastro da imobiliária**: `User` (accountType `AGENCY`) → cria `Organization` → nasce `OrganizationMember`
`role: OWNER`.

**Cadastro de funcionário**: `OWNER/ADMIN` adiciona membro (e-mail + função) → `OrganizationInvite` →
aceite → `OrganizationMember` (`ACTIVE`).

**Lead**: usuário encontra imóvel de uma `Organization` → abre conversa → `Lead` nasce (`status: NEW`) →
distribuição (manual ou round robin, conforme `Organization.leadDistributionMode`) → `BROKER` responsável.

**Atendimento**: `BROKER` registra contato (`LeadInteraction`) → `NEW → CONTACTED → QUALIFIED` → agenda
`Visit` → `VISIT_SCHEDULED` → `PROPOSAL` → `NEGOTIATION` → `WON`/`LOST`.

## Fases de implementação

**Fase 1** — rename `Company→Organization` / `CompanyMember→OrganizationMember` (migração de dados
preservando registros existentes), 4 roles, `status` com `INVITED`/`ACTIVE`/`INACTIVE`, `OrganizationInvite`,
middleware `requireOrgRole`, telas de equipe/convite atualizadas no web (mobile fica para depois, mesmo
critério já usado na Fase B).

**Fase 2** — `Lead`, `LeadAssignment`, distribuição manual + round robin, gatilho via chat existente.

**Fase 3** — `LeadInteraction`, pipeline Kanban (`/imobiliaria` → Pipeline), `Visit`.

**Fase 4** — SLA (alertas, não redistribuição automática ainda), métricas do dashboard B2B, distribuição
inteligente (região/especialidade/carga).

Nada disso altera `ownerId` (pessoa física), chat, reserva ou oferta do fluxo atual — a camada B2B só entra
em jogo onde `Listing.organizationId` está preenchido.

---

## Checklist de decisões (todas fechadas em 2026-08-30)

- ✅ `Company → Organization`, `CompanyMember → OrganizationMember` (evoluir, não duplicar)
- ✅ Manter `userId @unique` na V1, documentado como escolha de versão, não limite definitivo
- 🔧 Convite simplificado: `OrganizationInvite → aceito → OrganizationMember ACTIVE`, sempre, sem estado
  `INVITED` intermediário
- ✅ `Lead` só para imóveis de organização (`organizationId` obrigatório)
- ✅ Distribuição em dois modos explícitos: `MANUAL` (padrão) e `ROUND_ROBIN`
- ❌ Distribuição inteligente (`SMART`) não implementada agora — só reservada no enum
- ✅ `LeadAssignment` como histórico, sem `currentAssignmentId` desnormalizado
- ✅ CRM separado do marketplace (`ownerId` de pessoa física nunca entra no fluxo de Lead)
- ✅ Todas as permissões checadas no backend via `requireOrgRole`, nunca confiando em dado do frontend
- ✅ Rótulos de UI em português por papel (Proprietário/Administrador/Gerente/Corretor), nunca "vendedor"

## Fase 1 — IMPLEMENTADA em 2026-08-30

Autorizada pelo usuário ("pode fazer a etapa 1") e implementada de ponta a ponta na mesma sessão.

- **Schema**: `Company → Organization` (+ `type`, `email`, `phone`, `logo`, `description`,
  `leadDistributionMode`, `leadRoundRobinCursor`, `updatedAt`), `CompanyMember → OrganizationMember`
  (role `OWNER|AGENT` → `OWNER|ADMIN|MANAGER|BROKER`, dados existentes migrados `AGENT→BROKER`; `status`
  `ACTIVE|INACTIVE`, sem `INVITED`), `Listing.companyId → organizationId`. Migração escrita à mão
  (`apps/server/prisma/migrations/20260830120000_organization_b2b_phase1`, banco é PostgreSQL agora, não
  SQLite) — renomeia tabelas/colunas/constraints preservando dados, sem apagar nada. Novo model
  `OrganizationInvite` (caminho único de convite).
- **Backend**: `apps/server/src/controllers/organizations.controller.ts` (substituiu `companies.controller.ts`)
  com `createOrganization`, `getMyOrganization`, `inviteMember`, `listMyInvites`, `listOrganizationInvites`,
  `acceptInvite`, `declineInvite`, `cancelInvite`, `removeMember`, `getOrganizationListings`,
  `getMyAssignedListings`. Novo `lib/organizations.ts` com `requireOrgRole(...roles)` (mesmo estilo do
  `requireAdmin` já existente) — nunca confia em `organizationId` do frontend, sempre lê o
  `OrganizationMember` fresco do banco a partir do `userId` do JWT. `listings.controller.ts` atualizado:
  `OWNER`/`ADMIN` gerenciam qualquer imóvel da organização, `BROKER` só o atribuído a si, `MANAGER` não
  cria/edita/deleta (só visualiza via `getOrganizationListings`) — matriz de permissões do documento aplicada
  literalmente. `admin.controller.ts`: `getAllCompanies/verifyCompany` → `getAllOrganizations/verifyOrganization`,
  rotas `/admin/companies` → `/admin/organizations`.
- **Convite**: implementado exatamente como revisado — sempre `OrganizationInvite` (token + expiração de 7
  dias) → aceite → `OrganizationMember` `ACTIVE`, nunca um membro "meio existente". E-mail via
  `mail.ts` (`sendOrganizationInviteEmail`, mesmo padrão do reset de senha) + notificação in-app quando o
  convidado já tem conta. `GET /organizations/invites/me` lista convites pendentes pelo e-mail da própria
  sessão (nunca por parâmetro de URL) — usado tanto pela seção "Equipe" quanto pela landing page do link de
  e-mail (`/equipe/convite/[token]`). Listagem de gestão (`GET /organizations/invites`, OWNER/ADMIN) **não**
  expõe o `token` de ninguém — só quem foi convidado o vê, via `invites/me`.
- **Web**: `lib/organizations-api.ts` + `lib/actions/organizations.ts` (substituíram os arquivos `companies`),
  `TeamSection`/`InviteMemberForm` (com seletor de papel)/`CancelInviteButton`/`PendingInviteCard` novos,
  `CreateOrganizationForm`/`RemoveMemberButton`/`ReassignAgentSelect` atualizados. Rótulos em português
  aplicados (Proprietário/Administrador/Gerente/Corretor). `/admin` com aba "Organizações" (era "Empresas
  (Fase B)"). Mobile não foi tocado — Fase B nunca teve UI mobile, mesma decisão de escopo mantida.
- **Bug real encontrado e corrigido durante a verificação end-to-end** (não estava no documento original):
  `getMyOrganization` auto-inicializava uma organização para *qualquer* conta `accountType === "AGENCY"` sem
  membership — mas aceitar um convite agora promove `accountType` para `AGENCY` mesmo sem a pessoa ter
  preenchido CNPJ/nome de empresa próprios. Resultado: alguém removido de uma equipe virava dono de uma
  organização fantasma (`document: "00000000000000"`, nome = seu próprio nome de usuário) só por visitar
  `/equipe` de novo. Corrigido exigindo também `user.document` preenchido antes de auto-inicializar — só quem
  genuinamente se cadastrou como Fase A "de verdade" (documento obrigatório no registro `AGENCY`) aciona esse
  caminho.
- Validado ponta a ponta com o servidor real rodando (26 asserções via script Node, não só typecheck):
  registro AGENCY/INDIVIDUAL, criar organização (+ 409 na 2ª tentativa), convidar (+ 409 duplicado, 400 ao
  tentar convidar como OWNER, 201 para e-mail sem conta ainda, 404 para quem não pertence a organização),
  listar/aceitar convite (token exposto só pro convidado, nunca na listagem de gestão), `BROKER` bloqueado de
  convidar (403) e de ver `/organizations/listings` (403) mas vendo seus atribuídos, criação de imóvel de
  empresa (`organizationId` setado, `ownerId` null, `agentId` = criador), `OWNER` vendo o imóvel da
  organização, cancelar convite, remover membro (reatribuição de imóvel ao `OWNER`, ex-membro sem organização
  — sem virar dono de organização fantasma, bug acima confirmado corrigido). `npm run build` do Next.js e
  `tsc --noEmit` do server sem novos erros (erros pré-existentes de `exactOptionalPropertyTypes` em outros
  controllers, sem relação). Usuários/organização/imóvel de teste removidos do banco ao final; processo do
  servidor de teste encerrado e porta 3333 confirmada livre.
- **Fora desta rodada** (Fase 2 em diante, não iniciar sem pedido explícito): `Lead`, `LeadAssignment`,
  distribuição manual/round robin, `LeadInteraction`, `Visit`, pipeline Kanban, SLA, métricas.

## Fase 2 — IMPLEMENTADA em 2026-08-30

Autorizada pelo usuário ("Iniciar Fase 2 do CRM B2B") e implementada de ponta a ponta na mesma sessão,
seguindo o plano aprovado — nada mudou na codificação além do que este documento já detalhava.

- **Schema**: `model Lead` (`status`, `source`, `userId`, `listingId`, `organizationId`) e `model
  LeadAssignment` (`brokerId`→`OrganizationMember`, `assignedBy` solto sem FK — mesmo padrão de
  `OrganizationInvite.invitedBy` —, `assignedAt`, `firstContactAt` reservado pra Fase 3, `unassignedAt`,
  `reason`), ambos exatamente como especificado antes. Migração
  (`apps/server/prisma/migrations/20260830130000_add_leads`) só `CREATE TABLE`, nenhuma alteração em tabela
  existente.
- **Achado durante a exploração, corrigido como parte do gatilho**: `createOrGetConversation`
  (`chat.controller.ts`) dava `400 "Listing has no owner to contact"` para qualquer imóvel de organização
  (`ownerId` sempre `null` nesses imóveis desde a Fase B) — **chat em imóveis de organização estava quebrado
  antes desta rodada**. Corrigido: contato = `listing.ownerId ?? listing.agentId`. Decisão registrada: o
  segundo participante da conversa continua sendo `listing.agentId` mesmo depois de um `Lead` ser reatribuído
  a outro corretor via CRM — reatribuir o Lead não troca quem já está na conversa (gap conhecido, revisitar
  na Fase 3 se fizer sentido).
- **Backend**: `apps/server/src/lib/leads.ts` (`getCurrentAssignment`, `assignLead` — nunca sobrescreve,
  fecha a atribuição aberta e cria uma nova —, `distributeLead` — só age em `ROUND_ROBIN`, cicla
  `OrganizationMember` `BROKER`/`ACTIVE` a partir de `leadRoundRobinCursor`, no-op se não houver nenhum ativo).
  `apps/server/src/controllers/leads.controller.ts` + `routes/leads.routes.ts`: `GET /leads` (org-wide,
  OWNER/ADMIN/MANAGER), `GET /leads/mine` (qualquer membro), `PATCH /leads/:id/assign` (OWNER/ADMIN/MANAGER),
  `PATCH /leads/:id/status` (OWNER/ADMIN/MANAGER: qualquer lead; BROKER: só o seu, checado via
  `getCurrentAssignment`, mesmo espírito de `canManageOrgListing` já existente). Novo
  `PATCH /organizations/lead-distribution-mode` (OWNER/ADMIN) alterna `MANUAL ⇄ ROUND_ROBIN`.
- **Web**: seção mínima "Leads" em `/equipe` (`LeadsSection`/`AssignLeadSelect`/`LeadStatusSelect`/
  `LeadDistributionModeToggle`, `lib/leads-api.ts`, `lib/actions/leads.ts`) — tabela simples (cliente, imóvel,
  status, corretor), sem Kanban/interações/visitas (isso continua sendo Fase 3).
- Validado ponta a ponta com o servidor real rodando: 37 asserções via script Node contra a API real (modo
  MANUAL nasce sem atribuição, atribuição manual + reatribuição preserva histórico de 2 linhas,
  BROKER bloqueado de mexer num lead que não é mais seu, ROUND_ROBIN alternando entre 2 corretores ativos e
  ignorando um `INACTIVE`, MANAGER com visão org-wide mas sem acesso ao endpoint de modo de distribuição,
  regressão zero em imóvel de pessoa física) + submissão real de um Server Action a partir do HTML servido
  por `/equipe` (reatribuição de lead via `curl` simulando o `$ACTION_*`, mudança confirmada no banco).
  `npm run build` do Next.js e `tsc --noEmit` dos dois apps sem novos erros. Dados de teste (10 usuários, 1
  organização, 6 imóveis, conversas, leads, uploads) removidos do banco/disco ao final; servidores de teste
  encerrados, portas 3000/3333 confirmadas livres.
- **Fora desta rodada** (Fase 3 em diante, não iniciar sem pedido explícito): `LeadInteraction`, `Visit`,
  pipeline Kanban em `/imobiliaria`, SLA, métricas, distribuição `SMART`.

## Fase 3 — IMPLEMENTADA em 2026-08-30

Autorizada pelo usuário ("pode ir pra próxima") e implementada de ponta a ponta na mesma sessão, seguindo o
plano aprovado. Uma decisão de escopo foi confirmada com o usuário antes de codar: a tabela simples de leads
criada em `/equipe` na Fase 2 foi **removida** e substituída por um link "Ver pipeline de leads →" — o
Kanban em `/imobiliaria` passou a ser a única tela de gestão de leads.

- **Schema**: `model LeadInteraction` (`leadId`, `memberId`→`OrganizationMember`, `type`, `content`) e
  `model Visit` (`leadId`, `brokerId`→`OrganizationMember`, `scheduledAt`, `status`, `notes`), exatamente
  como especificado. Migração (`20260830140000_add_lead_interactions_visits`) só `CREATE TABLE`.
- **Decisão de design (sem drag-and-drop)**: o Kanban move um lead de coluna via `<select>` de status
  (reaproveitando o `LeadStatusSelect` da Fase 2), não arrastar-e-soltar — o projeto é Server-Actions-first
  e não tinha nenhuma dependência de DnD; introduzir uma só para isso não se pagava pro MVP.
- **Backend**: `lib/leads.ts` ganhou `resolveLeadAccess` (extrai a checagem de permissão OWNER/ADMIN/MANAGER
  vs BROKER-só-o-seu que já existia duplicada em `updateLeadStatusHandler`, agora reaproveitada por todo
  handler novo) e `recordInteraction` (cria a `LeadInteraction`; preenche `LeadAssignment.firstContactAt` —
  base de SLA da Fase 4 — só na 1ª interação de cada atribuição). Novos endpoints: `GET /leads/:id` (detalhe
  completo: histórico de atribuição, interações, visitas), `POST /leads/:id/interactions` (`STATUS_CHANGE`
  **não** é escolhível manualmente — reservado ao auto-log), `POST /leads/:id/visits` (exige atribuição
  aberta, `brokerId` = atribuição atual), `PATCH /visits/:id/status`. `updateLeadStatusHandler` agora
  auto-loga uma `LeadInteraction STATUS_CHANGE` (`"<antigo> → <novo>"`) sempre que o status muda de verdade
  — dá uso real ao valor do enum que só existia no schema desde a Fase 2.
- **Web**: `/imobiliaria` (Kanban, colunas por status, cards com seletor de status + link "Ver detalhes") e
  `/imobiliaria/leads/[id]` (detalhe: atribuição via `AssignLeadSelect` reaproveitado, linha do tempo de
  interações + `AddInteractionForm`, visitas + `ScheduleVisitForm`/`VisitStatusSelect`) — ambas coexistem sem
  conflito com `/imobiliaria/[id]` (vitrine pública), já que Next.js resolve o segmento estático "leads"
  antes do dinâmico `[id]`. `AssignLeadSelect`/`LeadStatusSelect`/`LeadDistributionModeToggle` (Fase 2) foram
  desacoplados do `LeadsSection.tsx` removido e agora vivem num CSS module próprio
  (`LeadControls.module.css`), reaproveitados pelas duas telas novas.
- Validado ponta a ponta com o servidor real: 23 asserções via script Node (agendar visita sem atribuição
  falha, `firstContactAt` preenchido só na 1ª interação e nunca sobrescrito, `STATUS_CHANGE` bloqueado como
  entrada manual, permissão BROKER-só-o-seu em interações/visitas/detalhe, MANAGER com visão org-wide,
  mudança de status auto-logando a interação certa e sem duplicar em no-op) + submissão real de um Server
  Action a partir do HTML servido por `/imobiliaria/leads/[id]` (registrar interação via curl simulando
  `$ACTION_*`, confirmado no banco). `npm run build` do Next.js e `tsc --noEmit` dos dois apps sem novos
  erros. Dados de teste (10 usuários, 2 organizações, 2 imóveis, uploads) removidos ao final; servidores de
  teste encerrados, portas 3000/3333 confirmadas livres.
- **Fora desta rodada** (Fase 4 em diante, não iniciar sem pedido explícito): SLA (alertas, redistribuição
  automática), métricas do dashboard B2B, distribuição inteligente (`SMART`).

## Fase 4 — IMPLEMENTADA em 2026-08-30 (parcial, por decisão do usuário)

Autorizada pelo usuário ("faça a fase 4"). Três decisões de escopo (o doc deixava todas em aberto)
confirmadas via AskUserQuestion antes de codar:

1. **SLA é só indicador visual sob demanda** — badge calculado na resposta da API a partir de
   `assignedAt`/`firstContactAt`, nunca persistido. **Sem notificação proativa** — o projeto não tinha (e
   continua sem ter) nenhum job/cron em background; criar essa infra só para isso não se pagava pro MVP.
2. **Limite de SLA fixo: 3h "em risco" / 4h "atrasado"** (`SLA_AT_RISK_HOURS`/`SLA_OVERDUE_HOURS` em
   `lib/leads.ts`) — constante no código, não virou configuração por organização.
3. **Distribuição `SMART` continua adiada** — terceira vez que essa decisão é tomada (Fase 2 e a redação
   original do doc já haviam adiado 2x). Nenhuma modelagem nova de especialidade/região foi feita;
   `leadDistributionMode` continua só `MANUAL`/`ROUND_ROBIN`.

- **Backend**: `lib/leads.ts` ganhou `computeSlaStatus(assignment)` (`UNASSIGNED` sem atribuição,
  `ON_TIME` sempre que já houve `firstContactAt` — não importa quanto demorou, o "aguardando resposta" já
  não se aplica —, senão `AT_RISK`/`OVERDUE` conforme horas decorridas desde `assignedAt`). `slaStatus`
  passou a vir embutido em toda resposta que retorna um `Lead` (`GET /leads`, `GET /leads/mine`,
  `GET /leads/:id`) — puro cálculo, zero migração. Novo `GET /organizations/metrics`
  (`requireOrgRole('OWNER','ADMIN','MANAGER')` — `Ver métricas` já era ❌ pra BROKER na matriz de permissões
  desde o desenho original): funil por status, taxa de conversão, tempo médio de resposta, % dentro do SLA,
  leads/mês (últimos 6 meses) e desempenho por corretor — tudo calculado em JS a partir de `LeadAssignment`
  (sem SQL bruto, volume por organização é pequeno).
- **Web**: `/imobiliaria` ganhou um toggle `?view=pipeline|metricas` (mesmo padrão do `/admin`) — cards do
  Kanban mostram um `SlaBadge` (some quando `UNASSIGNED`/`ON_TIME`, não polui a UI num caso saudável);
  `/imobiliaria/leads/[id]` ganhou o mesmo badge + "tempo de resposta" quando já houve contato. A aba
  Métricas reaproveita o `LineChart` já existente (mesmo componente do `/dashboard`/`/admin`) pro gráfico de
  leads/mês. `BROKER` tentando `?view=metricas` direto na URL nunca vê a aba (gate também no frontend, além
  do 403 do backend).
- Validado ponta a ponta com o servidor real: 14 asserções via script Node — **retrocedendo `assignedAt`
  manualmente no banco** pra simular os 3 estados de SLA sem esperar horas de verdade (`AT_RISK` às 3h30,
  `OVERDUE` às 5h, confirma que virar `ON_TIME` depois do 1º contato independe de quanto demorou), métricas
  com números batendo com os dados manipulados (`avgResponseHours` ~5h, `slaCompliancePct` 0%, contagem por
  corretor certa), 403 pra BROKER no endpoint de métricas — mais submissão real de um Server Action a partir
  do HTML servido por `/imobiliaria` (mudar status de um lead via curl simulando `$ACTION_*`, confirmado no
  banco). `npm run build` do Next.js e `tsc --noEmit` dos dois apps sem novos erros. Dados de teste (6
  usuários, 1 organização, 4 imóveis, uploads) removidos ao final; servidores de teste encerrados, portas
  3000/3333 confirmadas livres.
- **Fora desta rodada, por decisão explícita do usuário** (não é falta, é a Fase 4 entregue com o escopo que
  ele escolheu): notificação proativa de SLA (exigiria o primeiro job/cron do projeto), limite de SLA
  configurável por organização, e distribuição `SMART` (região/especialidade/carga de trabalho) — todas
  seguem reservadas, sem data prevista, só entram se/quando o usuário pedir.

## 2026-08-30 (continuação): itens soltos pós-Fase 4 — bugs de organização/listing, papel `ASSISTANT`, billing mock FREE/PRO

Usuário perguntou se todas as fases tinham sido feitas ("fez todas as fases? ou tem a 5?"). Resposta: não
existe "Fase 5"/"Parte 5" escrita em nenhum doc — só menções soltas de itens deixados de fora ao longo do
projeto. Usuário pediu pra fazer tudo, incluindo billing ("faça ela toda e finaliza na 5, pode ser?").
Três decisões de escopo confirmadas via `AskUserQuestion` antes de codar: **billing é mock/manual** (sem
Stripe, sem cobrança real — `Organization.plan` alternado por um botão "simular assinatura"), **planos**
`FREE` (padrão, até 2 `BROKER` ativos, sem CRM — chat funciona normal) vs `PRO` (corretores ilimitados + CRM
completo), e **`ASSISTANT`** (5º papel, somente leitura — mesma visão org-wide de OWNER/ADMIN/MANAGER, nunca
muta nada).

**Achado durante a exploração, corrigindo a própria memória do projeto**: o gap "`/dashboard`/`/meus-anuncios`
ignoram `organizationId`" já tinha sido corrigido como efeito colateral da Fase 1 (`getMyListings` já resolve
por `organizationId`/`agentId` conforme o papel). O que continuava genuinamente quebrado, e mais visível: a
seção inteira "Anunciado por" em `/imovel/[id]` desaparecia pra imóvel de organização (`{listing.owner &&
...}`, e `owner` é sempre `null` nesse caso) e a vitrine pública `/imobiliaria/[id]` mostrava zero imóveis pra
quem criou uma organização (`getUserProfile` buscava só por `ownerId`).

- **Track A (bugs)**: `getListingById` e `getUserProfile` ganharam `include`/query por `organizationId`
  quando aplicável (`organization: {id,name,logo,verified}`, `agent`). `AgencyBadge` simplificado pra
  `{verified: boolean}` (antes acoplado a `owner.accountType`, não fazia sentido pra `Organization`).
  `/imovel/[id]` e `/imobiliaria/[id]` calculam um "anunciante" (organização OU pessoa física) em vez de só
  `listing.owner`. Também corrigido de brinde: `isOwner`/o bloqueio de auto-navegação em ambas as páginas só
  reconheciam `ownerId`, então um agente/dono de organização era redirecionado ao tentar ver o próprio
  anúncio/vitrine — ajustado pra também reconhecer `agentId`/organização.
- **Track B (`ASSISTANT`)**: sem migração (`role` já é `String` livre). Novo `canViewLeadAccess` em
  `lib/leads.ts` (igual a `resolveLeadAccess`, mas inclui `ASSISTANT` no "vê qualquer lead da organização") —
  usado só por `getLeadDetail`; toda mutação continua em `resolveLeadAccess`, sem `ASSISTANT`. Adicionado aos
  3 endpoints de leitura org-wide (`GET /organizations/listings`, `GET /leads`, `GET /organizations/metrics`)
  e ao `INVITABLE_ROLES`. Web: `hasOrgWideView` ganhou `ASSISTANT` em `/equipe` e `/imobiliaria`; um novo
  `canManage`/`canMutate` (exclui `ASSISTANT`) decide se os controles de mutação (`LeadStatusSelect`,
  `AssignLeadSelect`, formulários de interação/visita) aparecem ou viram texto — inclusive no detalhe do
  lead, comparando a própria membership do viewer com a atribuição atual pra também liberar mutação pro
  `BROKER` dono do lead.
- **Track C (billing mock)**: `Organization.plan` (`FREE` padrão | `PRO`), migração aditiva simples. Novo
  `requirePlan(...)` em `lib/organizations.ts` (mesmo estilo de `requireOrgRole`) protegendo toda rota de
  `/leads`, `/visits` e `GET /organizations/metrics`/`PATCH /organizations/lead-distribution-mode` — CRM é
  recurso PRO. `createOrGetConversation` só cria+distribui um `Lead` se `organization.plan === 'PRO'` — em
  `FREE` o chat funciona exatamente como antes da Fase 2 (nunca um Lead "invisível" sem UI pra gerenciá-lo).
  `inviteMember` bloqueia o 3º convite de `BROKER` (membros ativos + convites pendentes) numa organização
  `FREE` com 400 — `ASSISTANT` não conta nesse limite. Novo `PATCH /organizations/plan` (mock, só troca a
  coluna, sem cobrança real). Web: `PlanToggle` (mesmo padrão de `LeadDistributionModeToggle`) em `/equipe`;
  `/imobiliaria` mostra um aviso "recurso do plano PRO" com link pra assinar em vez do Kanban/Métricas quando
  a organização está em `FREE`.
- Validado ponta a ponta com o servidor real: 21 asserções via script Node (organização nasce FREE; imóvel de
  organização retorna `organization`/`agent`; vitrine retorna `organization`; limite de 2 `BROKER` no FREE,
  3º convite dá 400, `ASSISTANT` não conta no limite; chat em organização FREE não cria Lead, em PRO cria
  normalmente; endpoints de CRM dão 403 em FREE; `PATCH /organizations/plan` funciona; `ASSISTANT` lê tudo
  (leads, imóveis, métricas, detalhe do lead) mas recebe 403 em toda mutação) + verificação visual das 4
  telas (imóvel/vitrine mostrando a marca da organização, aviso de upgrade em FREE, Kanban do `ASSISTANT` sem
  nenhum formulário de mutação) + 1 submissão real de Server Action (simular assinatura, mudança confirmada
  no banco). `npm run build` e `tsc --noEmit` dos dois apps sem novos erros. Dados de teste (14 usuários, 2
  organizações, 4 imóveis, uploads) removidos ao final; servidores de teste encerrados, portas 3000/3333
  confirmadas livres.
