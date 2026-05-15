# 🗺️ Zhivago — Roadmap de Futuras Implementações

> Documento de planejamento técnico para evolução do sistema. As fases são ordenadas por dependência: cada fase pressupõe a anterior concluída.

---

## 📌 Visão do Produto (Target)

```
Usuário comum:
  ├── Cadastra-se e faz login
  ├── Publica imóveis para aluguel ou venda
  ├── Busca, filtra e reserva/compra imóveis de outros
  └── Avalia imóveis e proprietários

Administrador:
  ├── Gerencia todos os usuários (ativar/suspender/excluir)
  ├── Modera todas as publicações (aprovar/rejeitar/remover)
  ├── Visualiza métricas e relatórios do sistema
  └── Gerencia categorias, tipos e configurações globais
```

---

## 🔴 Fase 1 — Autenticação e Usuários

> **Objetivo:** Toda ação no sistema passa a exigir identidade.

### Backend

#### Novo modelo `User` (Prisma)
```prisma
model User {
  id           String    @id @default(uuid())
  name         String
  email        String    @unique
  passwordHash String
  phone        String?
  avatar       String?
  role         Role      @default(USER)   // USER | ADMIN
  status       UserStatus @default(ACTIVE) // ACTIVE | SUSPENDED | BANNED
  createdAt    DateTime  @default(now())

  listings     Listing[]
  bookings     Booking[]
  reviews      Review[]
  sentMessages     Message[] @relation("Sender")
  receivedMessages Message[] @relation("Receiver")
}

enum Role {
  USER
  ADMIN
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  BANNED
}
```

#### Novas rotas de autenticação

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/auth/register` | Cadastro de novo usuário |
| `POST` | `/auth/login` | Login → retorna JWT |
| `POST` | `/auth/refresh` | Renovação de token JWT |
| `POST` | `/auth/logout` | Invalidação de sessão |
| `GET` | `/auth/me` | Retorna dados do usuário logado |
| `PATCH` | `/auth/me` | Atualiza perfil do usuário |
| `PATCH` | `/auth/me/avatar` | Upload de foto de perfil |
| `PATCH` | `/auth/me/password` | Troca de senha |

#### Dependências a instalar (server)
```bash
npm install @fastify/jwt bcryptjs
npm install -D @types/bcryptjs
```

#### Estratégia JWT
- **Access Token:** expira em 15 minutos
- **Refresh Token:** expira em 7 dias, armazenado em cookie `httpOnly`
- Middleware `authenticate` aplicado em todas as rotas protegidas

---

### Frontend

#### Novas telas
| Arquivo | Tela |
|---|---|
| `app/(auth)/login.tsx` | Login com e-mail e senha |
| `app/(auth)/register.tsx` | Cadastro de novo usuário |
| `app/(auth)/forgot-password.tsx` | Recuperação de senha |
| `app/(tabs)/profile.tsx` | Perfil do usuário logado |

#### Contexto de autenticação
```
src/contexts/AuthContext.tsx
  └── user, token, login(), logout(), register()
```

#### Armazenamento
- Token JWT salvo via **AsyncStorage** ou **expo-secure-store**

---

## 🟡 Fase 2 — Listagem Vinculada ao Usuário (Proprietário)

> **Objetivo:** Imóveis pertencem a um usuário. O proprietário gerencia suas próprias publicações.

### Backend

#### Alteração no modelo `Listing`
```prisma
model Listing {
  // ... campos existentes ...
  ownerId   String
  owner     User    @relation(fields: [ownerId], references: [id])
  status    ListingStatus @default(PENDING) // PENDING | APPROVED | REJECTED | REMOVED
}

enum ListingStatus {
  PENDING    // aguardando aprovação do admin
  APPROVED   // visível publicamente
  REJECTED   // recusado pelo admin
  REMOVED    // removido após publicação
}
```

#### Novas rotas de gestão do proprietário

| Método | Rota | Middleware | Descrição |
|---|---|---|---|
| `GET` | `/me/listings` | auth | Lista imóveis do usuário logado |
| `PUT` | `/listings/:id` | auth + owner | Edita imóvel próprio |
| `DELETE` | `/listings/:id` | auth + owner | Remove imóvel próprio |
| `PATCH` | `/listings/:id/images` | auth + owner | Adiciona/remove imagens |

#### Múltiplas imagens
```prisma
model ListingImage {
  id        String  @id @default(uuid())
  url       String
  listingId String
  listing   Listing @relation(...)
  isPrimary Boolean @default(false)
  order     Int     @default(0)
}
```

### Frontend

#### Novas telas
| Arquivo | Tela |
|---|---|
| `app/(tabs)/my-listings.tsx` | Meus imóveis (lista dos próprios) |
| `app/edit-listing/[id].tsx` | Edição de imóvel existente |
| `app/listing/[id].tsx` | Detalhe público do imóvel |

---

## 🟢 Fase 3 — Sistema de Reservas e Transações

> **Objetivo:** Usuários podem reservar (alugar) ou solicitar compra de imóveis de outros.

### Backend

#### Novo modelo `Booking`
```prisma
model Booking {
  id          String        @id @default(uuid())
  listingId   String
  listing     Listing       @relation(...)
  tenantId    String        // quem está alugando/comprando
  tenant      User          @relation(...)
  type        BookingType   // RENTAL | PURCHASE
  status      BookingStatus @default(PENDING)
  checkIn     DateTime?     // apenas para aluguel
  checkOut    DateTime?     // apenas para aluguel
  totalPrice  Float
  notes       String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

enum BookingType {
  RENTAL
  PURCHASE
}

enum BookingStatus {
  PENDING     // aguardando confirmação do proprietário
  CONFIRMED   // proprietário confirmou
  CANCELLED   // cancelado por qualquer parte
  COMPLETED   // período encerrado / venda concluída
  REJECTED    // proprietário recusou
}
```

#### Rotas de reservas

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/listings/:id/bookings` | Criar reserva/solicitação de compra |
| `GET` | `/me/bookings` | Minhas reservas (como inquilino/comprador) |
| `GET` | `/me/listings/:id/bookings` | Reservas do meu imóvel (como proprietário) |
| `PATCH` | `/bookings/:id/confirm` | Proprietário confirma reserva |
| `PATCH` | `/bookings/:id/reject` | Proprietário rejeita reserva |
| `PATCH` | `/bookings/:id/cancel` | Cancelar reserva (qualquer parte) |
| `GET` | `/listings/:id/availability` | Consultar disponibilidade (datas bloqueadas) |

### Frontend

#### Novas telas
| Arquivo | Tela |
|---|---|
| `app/listing/[id].tsx` | Detalhes + botão de reservar/comprar |
| `app/(tabs)/bookings.tsx` | Minhas reservas |
| `app/booking/[id].tsx` | Detalhe de uma reserva |
| `app/calendar/[listingId].tsx` | Calendário de disponibilidade |

---

## 🔵 Fase 4 — Sistema de Avaliações

> **Objetivo:** Após uma estadia/compra, ambas as partes podem avaliar.

### Backend

#### Novo modelo `Review`
```prisma
model Review {
  id          String      @id @default(uuid())
  bookingId   String      @unique
  booking     Booking     @relation(...)
  authorId    String
  author      User        @relation(...)
  targetType  ReviewTarget // LISTING | USER
  targetId    String       // ID do imóvel ou do usuário avaliado
  rating      Int          // 1 a 5 estrelas
  comment     String?
  createdAt   DateTime    @default(now())
}

enum ReviewTarget {
  LISTING
  USER
}
```

#### Regras de negócio
- Só é possível avaliar após o `Booking` ter status `COMPLETED`
- Cada booking gera no máximo 2 reviews (inquilino → imóvel e proprietário → inquilino)
- Proprietário pode responder à avaliação do imóvel

#### Rotas de avaliação

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/bookings/:id/reviews` | Criar avaliação pós-estadia |
| `GET` | `/listings/:id/reviews` | Listar avaliações de um imóvel |
| `GET` | `/users/:id/reviews` | Listar avaliações de um usuário |
| `PATCH` | `/reviews/:id/reply` | Proprietário responde à avaliação |
| `DELETE` | `/reviews/:id` | Admin remove avaliação imprópria |

#### Campo calculado no `Listing`
```prisma
// Campo virtual calculado via Prisma
avgRating   Float?   // média das avaliações
reviewCount Int      @default(0)
```

### Frontend

#### Novas telas/componentes
| Arquivo | Descrição |
|---|---|
| `app/review/new/[bookingId].tsx` | Formulário de avaliação |
| `src/components/StarRating.tsx` | Componente de estrelas interativo |
| `src/components/ReviewCard.tsx` | Card de exibição de avaliação |
| `app/listing/[id].tsx` | Seção de reviews no detalhe do imóvel |

---

## ⚫ Fase 5 — Painel Administrativo

> **Objetivo:** Interface web exclusiva para gestão completa do sistema.

### Estrutura

O painel admin será uma **aplicação web separada** (ou rota protegida dentro do app), acessível apenas por usuários com `role: ADMIN`.

```
app/(admin)/
  ├── _layout.tsx              # Layout do painel admin (sidebar + header)
  ├── dashboard.tsx            # Visão geral com métricas
  ├── users/
  │   ├── index.tsx            # Listagem de todos os usuários
  │   └── [id].tsx             # Detalhes e ações sobre um usuário
  ├── listings/
  │   ├── index.tsx            # Todas as publicações (com filtro de status)
  │   └── [id].tsx             # Detalhes e moderação de um imóvel
  ├── bookings/
  │   └── index.tsx            # Todas as reservas do sistema
  └── reviews/
      └── index.tsx            # Moderação de avaliações
```

### Rotas de Admin (Backend)

Todas protegidas pelo middleware `requireRole('ADMIN')`.

#### Usuários
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/users` | Lista todos os usuários (paginado + filtros) |
| `GET` | `/admin/users/:id` | Detalhe de um usuário |
| `PATCH` | `/admin/users/:id/status` | Suspender / Banir / Reativar usuário |
| `DELETE` | `/admin/users/:id` | Excluir conta permanentemente |
| `PATCH` | `/admin/users/:id/role` | Promover a admin / rebaixar para user |

#### Publicações
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/listings` | Lista todos os imóveis (com filtro por status) |
| `PATCH` | `/admin/listings/:id/approve` | Aprovar publicação |
| `PATCH` | `/admin/listings/:id/reject` | Rejeitar com motivo |
| `DELETE` | `/admin/listings/:id` | Remover publicação |

#### Dashboard
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/stats` | Métricas gerais do sistema |

```typescript
// Exemplo de resposta de /admin/stats
{
  totalUsers: 1240,
  activeListings: 340,
  pendingListings: 18,
  bookingsThisMonth: 87,
  revenueThisMonth: 45200.00,
  avgRating: 4.3
}
```

#### Funcionalidades do Painel

- ✅ Dashboard com cards de métricas e gráficos (usuários, publicações, reservas)
- ✅ Tabela de usuários com busca, filtro por status/role e ações rápidas
- ✅ Fila de publicações **pendentes** com botões de aprovar/rejeitar
- ✅ Histórico de moderação (log de ações do admin)
- ✅ Moderação de avaliações impróprias
- ✅ Exportação de relatórios (CSV)

---

## 💬 Fase 6 — Chat entre Usuários

> **Objetivo:** Proprietário e interessado podem se comunicar dentro do app.

### Backend

#### Novo modelo `Message`
```prisma
model Message {
  id          String   @id @default(uuid())
  content     String
  senderId    String
  sender      User     @relation("Sender", ...)
  receiverId  String
  receiver    User     @relation("Receiver", ...)
  listingId   String?  // contexto da conversa (opcional)
  read        Boolean  @default(false)
  createdAt   DateTime @default(now())
}
```

#### Comunicação em tempo real
- **WebSocket via Fastify + `@fastify/websocket`**
- Ou integração com **Socket.io**
- Notificações push via **Expo Push Notifications**

#### Rotas de mensagens

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/me/conversations` | Lista todas as conversas do usuário |
| `GET` | `/conversations/:userId` | Mensagens com um usuário específico |
| `POST` | `/conversations/:userId` | Enviar mensagem |
| `PATCH` | `/messages/:id/read` | Marcar como lida |

---

## 🔔 Fase 7 — Notificações

| Evento | Destinatário | Canal |
|---|---|---|
| Nova reserva recebida | Proprietário | Push + In-app |
| Reserva confirmada | Inquilino | Push + In-app |
| Reserva cancelada | Ambos | Push + In-app |
| Nova mensagem | Destinatário | Push + In-app |
| Publicação aprovada | Proprietário | Push + In-app |
| Publicação rejeitada | Proprietário | Push + In-app |
| Nova avaliação recebida | Proprietário | In-app |

#### Dependências
```bash
npm install expo-notifications   # frontend
npm install @expo/server          # backend (Expo Push API)
```

---

## 📊 Resumo do Plano de Dados

```
User ──── 1:N ──── Listing      (proprietário tem vários imóveis)
User ──── 1:N ──── Booking      (usuário faz várias reservas)
Listing ─ 1:N ──── Booking      (imóvel tem várias reservas)
Booking ─ 1:1 ──── Review       (cada reserva gera uma avaliação)
User ──── 1:N ──── Message      (como remetente e destinatário)
Listing ─ 1:N ──── ListingImage (múltiplas fotos por imóvel)
```

---

## 🧱 Arquitetura Alvo

```
┌─────────────────────────────────────────────┐
│              CLIENTES                        │
│  [App Mobile iOS/Android]  [App Web]         │
│         Expo Router + React Native           │
└──────────────────┬──────────────────────────┘
                   │ HTTPS + JWT
┌──────────────────▼──────────────────────────┐
│              API REST                        │
│         Fastify + TypeScript                 │
│  Auth │ Listings │ Bookings │ Reviews │ Admin│
└──────┬──────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────┐
│          BANCO DE DADOS                      │
│         Prisma ORM + SQLite                  │
│  (migrar para PostgreSQL em produção)        │
└─────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────┐
│         SERVIÇOS EXTERNOS                    │
│  ViaCEP (endereço) │ Expo Push (notificações)│
└─────────────────────────────────────────────┘
```

> ⚠️ **Atenção:** Para produção, migrar o banco de **SQLite** para **PostgreSQL** (Neon, Supabase ou Railway). O Prisma suporta essa troca apenas alterando o `provider` no `schema.prisma`.

---

## 📅 Ordem de Implementação Sugerida

| # | Fase | Estimativa | Prioridade |
|---|---|---|---|
| 1 | Autenticação JWT (login/cadastro) | 1–2 dias | 🔴 Crítico |
| 2 | Listagens vinculadas ao usuário | 1 dia | 🔴 Crítico |
| 3 | Sistema de reservas | 2–3 dias | 🟡 Alto |
| 4 | Avaliações e estrelas | 1–2 dias | 🟡 Alto |
| 5 | Painel Admin | 2–3 dias | 🟢 Médio |
| 6 | Chat entre usuários | 2–3 dias | 🔵 Baixo |
| 7 | Notificações push | 1–2 dias | 🔵 Baixo |

---

*Roadmap gerado em 22/04/2026 — versão 1.0*
