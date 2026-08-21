FROM node:22-bookworm-slim AS build

WORKDIR /workspace
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/api/package.json backend/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

COPY backend/api backend/api
COPY packages/contracts packages/contracts
RUN pnpm --filter api exec prisma generate \
  && pnpm --filter api run build \
  && pnpm deploy --filter api --prod --legacy /runtime

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /runtime/package.json ./package.json
COPY --from=build /workspace/backend/api/dist ./dist
COPY --from=build /workspace/backend/api/prisma ./prisma

USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
