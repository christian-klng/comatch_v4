# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app

# Abhängigkeiten aller Workspaces (inkl. dev) für den Web-Build
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# --include=dev: Der Web-Build braucht Vite und Tailwind, auch wenn die Plattform (z. B. Coolify)
# beim Bauen NODE_ENV=production setzt.
RUN npm ci --include=dev

FROM deps AS build
COPY . .
RUN npm run build -w @comatch/web

# Laufzeit: nur Produktionsabhängigkeiten von Server und Shared.
# Der Server läuft direkt als TypeScript (Node-Type-Stripping), es gibt keinen Server-Build.
FROM base AS runtime
ENV NODE_ENV=production \
    API_PORT=3000 \
    WEB_DIST_DIR=/app/apps/web/dist
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w @comatch/server -w @comatch/shared && npm cache clean --force
COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY apps/server/drizzle apps/server/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
CMD ["node", "apps/server/src/index.ts"]
