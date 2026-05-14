FROM node:26.1.0-alpine3.23 AS builder
WORKDIR /app
ARG VITE_SERVER_API
ARG VITE_SERVER_WS
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.30.0-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
