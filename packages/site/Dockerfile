# Static marketing and documentation site.
#
# The site imports the SDK to render its demos and its locale tables, so the
# SDK is built first and the site build fails loudly if the package it
# documents no longer works.

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/site/package.json packages/site/
RUN npm ci --workspace packages/sdk --workspace packages/site --include-workspace-root

COPY packages/sdk packages/sdk
COPY packages/site packages/site
RUN npm run build --workspace packages/sdk \
 && npm run build --workspace packages/site

FROM nginx:alpine AS runtime
COPY --from=build /app/packages/site/dist /usr/share/nginx/html
COPY packages/site/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost/ || exit 1
