ARG NODE_IMAGE=node:22.18.0-bookworm-slim
ARG NPM_VERSION=11.13.0

FROM ${NODE_IMAGE} AS toolchain
ARG NPM_VERSION
RUN npm install --global "npm@${NPM_VERSION}"

FROM toolchain AS dependencies
WORKDIR /workspace

COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/testkit/package.json packages/testkit/package.json

RUN npm ci --include=optional

FROM dependencies AS source
COPY . .

FROM source AS web-build
ENV RAHHAL_WEB_RUNTIME=network \
    RAHHAL_API_INTERNAL_URL=http://api:3001
RUN npm run build:web:network

FROM source AS service-build
RUN npm run build:workspaces

FROM ${NODE_IMAGE} AS web
ARG RAHHAL_REVISION=local
ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
LABEL org.opencontainers.image.title="Rahhal local connected web" \
      org.opencontainers.image.description="Next.js browser client connected to the PostgreSQL-authoritative API" \
      org.opencontainers.image.revision="${RAHHAL_REVISION}"
WORKDIR /workspace

COPY --from=web-build --chown=node:node /workspace/.next/standalone ./
COPY --from=web-build --chown=node:node /workspace/.next/static ./.next/static
COPY --from=web-build --chown=node:node /workspace/public ./public

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "server.js"]

FROM source AS web-demo-build
RUN npm run build:web

FROM nginx:1.29.1-alpine AS web-demo
ARG RAHHAL_REVISION=local
LABEL org.opencontainers.image.title="Rahhal static web demo" \
      org.opencontainers.image.description="Static, non-authoritative Rahhal browser demo" \
      org.opencontainers.image.revision="${RAHHAL_REVISION}"
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-demo-build --chown=nginx:nginx /workspace/out /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

FROM toolchain AS service-runtime-dependencies
ENV NODE_ENV=development
WORKDIR /workspace

COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/testkit/package.json packages/testkit/package.json

RUN npm ci --omit=dev --ignore-scripts \
      --workspace @rahhal/api \
      --workspace @rahhal/worker \
      --workspace @rahhal/contracts \
      --workspace @rahhal/domain \
      --include-workspace-root=false

FROM ${NODE_IMAGE} AS api
ARG RAHHAL_REVISION=local
ENV NODE_ENV=development \
    RAHHAL_API_MODE=postgres \
    RAHHAL_API_HOST=0.0.0.0 \
    RAHHAL_API_PORT=3001
LABEL org.opencontainers.image.title="Rahhal local API" \
      org.opencontainers.image.description="Compiled Rahhal API with explicit PostgreSQL authority" \
      org.opencontainers.image.revision="${RAHHAL_REVISION}"
WORKDIR /workspace

COPY --from=service-runtime-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=service-build --chown=node:node /workspace/apps/api/package.json apps/api/package.json
COPY --from=service-build --chown=node:node /workspace/apps/api/dist apps/api/dist
COPY --from=service-build --chown=node:node /workspace/apps/api/migrations apps/api/migrations
COPY --from=service-build --chown=node:node /workspace/apps/api/seeds apps/api/seeds
COPY --from=service-build --chown=node:node /workspace/packages/contracts/package.json packages/contracts/package.json
COPY --from=service-build --chown=node:node /workspace/packages/contracts/dist packages/contracts/dist
COPY --from=service-build --chown=node:node /workspace/packages/domain/package.json packages/domain/package.json
COPY --from=service-build --chown=node:node /workspace/packages/domain/dist packages/domain/dist

USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/openapi.json').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "apps/api/dist/server.js"]

FROM ${NODE_IMAGE} AS worker
ARG RAHHAL_REVISION=local
ENV NODE_ENV=development \
    RAHHAL_WORKER_MODE=demo
LABEL org.opencontainers.image.title="Rahhal local worker demo" \
      org.opencontainers.image.description="Compiled, in-memory Rahhal worker boundary proof" \
      org.opencontainers.image.revision="${RAHHAL_REVISION}"
WORKDIR /workspace

COPY --from=service-runtime-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=service-build --chown=node:node /workspace/apps/worker/package.json apps/worker/package.json
COPY --from=service-build --chown=node:node /workspace/apps/worker/dist apps/worker/dist
COPY --from=service-build --chown=node:node /workspace/packages/contracts/package.json packages/contracts/package.json
COPY --from=service-build --chown=node:node /workspace/packages/contracts/dist packages/contracts/dist
COPY --from=service-build --chown=node:node /workspace/packages/domain/package.json packages/domain/package.json
COPY --from=service-build --chown=node:node /workspace/packages/domain/dist packages/domain/dist

USER node
STOPSIGNAL SIGTERM
CMD ["node", "apps/worker/dist/server.js"]
