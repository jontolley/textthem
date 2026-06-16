# ─── Build stage ──────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci

# Copy sources and build shared + api.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @text-them/shared \
  && npm run build --workspace @text-them/api

# Prune dev dependencies for the runtime image.
RUN npm prune --omit=dev

# ─── Runtime stage ────────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist

EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
