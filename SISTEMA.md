# 🏠 Zhivago — Documentação do Sistema

> Aplicativo full-stack de listagem e cadastro de imóveis (casas e apartamentos) para aluguel e venda.

---

## 📋 Visão Geral

O **Zhivago** é uma aplicação mobile/web construída com **React Native + Expo Router** no frontend e um servidor **Node.js + Fastify** no backend. Ela permite listar, filtrar, buscar e cadastrar imóveis com imagens, endereço completo e características como quartos, banheiros e vagas de garagem.

A interface é inspirada no estilo visual do Airbnb (cor primária `#ff385c`), com suporte a tema claro e escuro.

---

## 🏗️ Arquitetura do Projeto

```
zhivago/
├── app/                        # Frontend — Expo Router (React Native)
│   ├── +html.tsx               # Template HTML raiz para renderização web
│   ├── +not-found.tsx          # Tela de rota não encontrada (404)
│   ├── _layout.tsx             # Layout raiz da aplicação
│   ├── modal.tsx               # Tela modal genérica
│   ├── create-listing.tsx      # Tela de cadastro de imóvel
│   └── (tabs)/
│       ├── _layout.tsx         # Layout das abas de navegação
│       ├── index.tsx           # Tela Home — listagem e filtros
│       └── two.tsx             # Segunda aba
│
├── src/                        # Código compartilhado do frontend
│   ├── components/
│   │   ├── HotelCard.tsx       # Card de exibição de imóvel
│   │   ├── EditScreenInfo.tsx  # Componente de informação de tela
│   │   ├── ExternalLink.tsx    # Link externo
│   │   ├── StyledText.tsx      # Texto estilizado
│   │   ├── Themed.tsx          # View/Text com suporte a tema
│   │   ├── useClientOnlyValue.ts / .web.ts
│   │   └── useColorScheme.ts / .web.ts
│   └── constants/
│       └── ListingsData.ts     # Dados estáticos locais de imóveis (fallback)
│
├── server/                     # Backend — Node.js + Fastify
│   ├── src/
│   │   ├── server.ts           # Entry point do servidor
│   │   ├── routes.ts           # Rotas da API (GET/POST /listings)
│   │   ├── controllers/        # (estrutura para controllers)
│   │   ├── database/           # (estrutura para banco de dados)
│   │   ├── dtos/               # (estrutura para DTOs)
│   │   └── routes/             # (estrutura para módulos de rota)
│   ├── prisma/
│   │   ├── schema.prisma       # Modelo de dados do banco SQLite
│   │   └── migrations/         # Histórico de migrações
│   ├── uploads/                # Imagens enviadas via upload
│   └── .env                    # Variáveis de ambiente do servidor
│
├── assets/                     # Ícones e splash screen
├── app.json                    # Configuração Expo
├── package.json                # Dependências do frontend
├── tsconfig.json               # Configuração TypeScript
└── .env                        # Variáveis de ambiente do frontend
```

---

## 🖥️ Frontend

### Tecnologias

| Tecnologia | Versão | Uso |
|---|---|---|
| React Native | 0.81.5 | Framework mobile |
| Expo | ~54.0.0 | Toolchain e plataforma |
| Expo Router | ~6.0.23 | Navegação baseada em arquivos |
| React | 19.1.0 | Biblioteca de UI |
| TypeScript | ~5.9.2 | Tipagem estática |
| react-native-reanimated | ~4.1.1 | Animações nativas |
| AsyncStorage | 2.2.0 | Persistência local |
| expo-image-picker | ~17.0.10 | Seleção de imagens da galeria |

### Telas

#### 🏠 Home (`app/(tabs)/index.tsx`)
- Lista imóveis vindos da **API REST** (banco SQLite), com fallback para dados locais
- **Barra de busca** por nome e localização
- **Modal de filtros** com:
  - Tipo de imóvel: Casa / Apartamento
  - Objetivo: Alugar / Comprar
  - Ordenação por preço (menor → maior / maior → menor)
- Layout responsivo: **1 coluna** (mobile) / **2 colunas** (tablet) / **3 colunas** (desktop)
- **Botão FAB** (flutuante) para navegar ao cadastro
- Pull-to-refresh para recarregar dados da API

#### ➕ Cadastro de Imóvel (`app/create-listing.tsx`)
- Formulário completo para cadastro de imóvel com:
  - Título, preço, tipo de imóvel, objetivo (aluguel/venda)
  - Ciclo de cobrança (por noite ou por mês — apenas para aluguel)
  - Quartos, banheiros, vagas de garagem
  - **Busca automática de endereço via CEP** (API ViaCEP)
  - Upload de imagem (galeria do dispositivo)
- Envia os dados para o backend via **multipart/form-data**
- Exibe feedback visual de carregamento (`ActivityIndicator`)

### Componentes

| Componente | Descrição |
|---|---|
| `HotelCard` | Card com imagem, nome, localização, amenidades (quartos/banheiros/garagem) e preço |
| `Themed` | View e Text com suporte automático a tema claro/escuro |
| `ExternalLink` | Link que abre no navegador externo |
| `useColorScheme` | Hook para detectar tema do sistema |

### Variáveis de Ambiente (Frontend)

```env
EXPO_PUBLIC_API_URL=http://<IP_DO_SERVIDOR>:3333
```

---

## ⚙️ Backend

### Tecnologias

| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | — | Runtime |
| Fastify | ^5.8.4 | Framework HTTP |
| @fastify/multipart | ^10.0.0 | Upload de arquivos |
| @fastify/static | ^9.1.0 | Servidor de arquivos estáticos |
| @fastify/cors | ^11.2.0 | Política de CORS |
| Prisma | ^6.19.2 | ORM para banco de dados |
| SQLite | — | Banco de dados (via Prisma) |
| Zod | ^3.23.0 | Validação de dados |
| tsx | ^4.21.0 | Execução TypeScript em dev |

### Servidor (`server/src/server.ts`)

- Porta: **`3333`**, host: `0.0.0.0`
- Registra plugins: CORS, multipart (limite de 50MB), static files
- Serve a pasta `/uploads` na rota `/uploads/`

### Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/hello` | Teste de saúde da API |
| `GET` | `/listings` | Lista todos os imóveis (ordem por data de criação decrescente) |
| `POST` | `/listings` | Cadastra novo imóvel com upload de imagem |

#### POST `/listings` — Corpo (multipart/form-data)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | ✅ | Título do anúncio |
| `description` | string | ❌ | Descrição do imóvel |
| `price` | number | ✅ | Preço |
| `type` | string | ✅ | `"casa"` ou `"apartamento"` |
| `category` | string | ✅ | `"aluguel"` ou `"venda"` |
| `billingCycle` | string | ❌ | `"noite"` ou `"mês"` |
| `location` | string | ✅ | Cidade e UF |
| `bedrooms` | number | ✅ | Número de quartos |
| `bathrooms` | number | ✅ | Número de banheiros |
| `parking` | number | ✅ | Vagas de garagem |
| `image` | file | ✅ | Imagem do imóvel |

### Banco de Dados — Modelo `Listing`

```prisma
model Listing {
  id           String   @id @default(uuid())
  name         String
  description  String?
  price        Float
  type         String        // "casa" | "apartamento"
  category     String        // "aluguel" | "venda"
  billingCycle String?       // "noite" | "mês"
  image        String        // URL da imagem no servidor
  location     String        // "Cidade, UF"
  bedrooms     Int      @default(0)
  bathrooms    Int      @default(0)
  parking      Int      @default(0)
  createdAt    DateTime @default(now())
}
```

### Variáveis de Ambiente (Backend — `server/.env`)

```env
DATABASE_URL="file:./prisma/dev.db"
```

---

## 🔄 Fluxo de Dados

```
[App Mobile/Web]
       │
       ├─── GET /listings ──────────────────────► [Fastify API]
       │                                               │
       │◄── JSON[] ──────────────────────────────── Prisma → SQLite
       │
       ├─── POST /listings (FormData + imagem) ──► [Fastify API]
       │                                               ├── Salva imagem em /uploads/
       │◄── 201 Created (Listing JSON) ────────── Prisma → SQLite
       │
       └─── [Fallback] dados estáticos locais (LISTINGS) se API falhar
```

---

## 🚀 Como Rodar

### Backend

```bash
cd server
npm install
npx prisma migrate dev   # cria o banco SQLite
npm run dev              # inicia em modo watch na porta 3333
```

### Frontend

```bash
# na raiz do projeto
npm install
npx expo start           # abre o Metro Bundler
```

> ⚠️ Certifique-se que o celular/emulador e o servidor estão na **mesma rede Wi-Fi**.  
> Configure o IP correto no `.env` do frontend: `EXPO_PUBLIC_API_URL=http://<SEU_IP>:3333`

---

## 📱 Plataformas Suportadas

| Plataforma | Suporte |
|---|---|
| Android | ✅ |
| iOS | ✅ (suporta tablet) |
| Web | ✅ (Metro + output estático) |

---

## 🎨 Design

- **Cor primária:** `#ff385c` (vermelho Airbnb)
- **Background claro:** `#f9f9f9` / `#fff`
- **Background escuro:** `#000` (automático via `prefers-color-scheme`)
- **Modo escuro:** Suportado via `userInterfaceStyle: "automatic"`
- **Orientação:** Portrait (travado)

---

*Documentação gerada em 22/04/2026*
