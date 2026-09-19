# Build de contexto: a raiz do monorepo (`docker build -f apps/server/Dockerfile .`), porque o
# apps/server depende do workspace @zhivago/shared e do package-lock.json compartilhado.

FROM node:24-slim AS build
WORKDIR /repo

# Só os manifests dos workspaces que o apps/server realmente usa (não apps/web nem apps/mobile) —
# o glob "apps/*" dos workspaces em package.json resolve só o que existe no contexto copiado aqui,
# então `npm ci` instala somente as dependências do server + shared.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY apps/server apps/server
COPY packages/shared packages/shared

RUN npm run build --workspace=apps/server

# ─── Imagem final ─────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/server/package.json apps/server/package.json
COPY --from=build /repo/apps/server/dist apps/server/dist
COPY --from=build /repo/apps/server/prisma apps/server/prisma

WORKDIR /repo/apps/server

# Cloud Run injeta a variável PORT — o server.ts lê `process.env.PORT` (com fallback 3333 local).
EXPOSE 8080

CMD ["node", "dist/server.js"]
