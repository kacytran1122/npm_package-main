# Build from the repo root so the workspace SDK is available.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/server/package.json packages/server/
RUN npm ci --workspace packages/sdk --workspace packages/server --include-workspace-root

COPY packages/sdk packages/sdk
COPY packages/server packages/server
RUN npm run build --workspace packages/sdk \
 && npm run build --workspace packages/server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/server/package.json packages/server/
RUN npm ci --omit=dev --workspace packages/sdk --workspace packages/server --include-workspace-root

COPY --from=build /app/packages/sdk/dist packages/sdk/dist
COPY --from=build /app/packages/server/dist packages/server/dist

# Do not run as root.
USER node
EXPOSE 5000
CMD ["node", "packages/server/dist/index.js"]
