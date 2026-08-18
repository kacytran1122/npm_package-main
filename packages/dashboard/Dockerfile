FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm ci --workspace packages/sdk --workspace packages/dashboard --include-workspace-root

COPY packages/sdk packages/sdk
COPY packages/dashboard packages/dashboard
RUN npm run build --workspace packages/sdk \
 && npm run build --workspace packages/dashboard

FROM nginx:alpine AS runtime
COPY --from=build /app/packages/dashboard/dist /usr/share/nginx/html
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
