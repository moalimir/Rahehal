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
RUN npm run build:web

FROM source AS service-build
RUN npm run build:workspaces

FROM nginx:1.29.1-alpine AS web
ARG RAHHAL_REVISION=local
LABEL org.opencontainers.image.title="Rahhal local web demo" \
      org.opencontainers.image.description="Static, non-authoritative Rahhal web demo" \
      org.opencontainers.image.revision="${RAHHAL_REVISION}"

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build --chown=nginx:nginx /workspace/out /usr/share/nginx/html

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
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
    RAHHAL_API_MODE=demo \
    RAHHAL_API_HOST=0.0.0.0 \
    RAHHAL_API_PORT=3001
LABEL org.opencontainers.image.title="Rahhal local API demo" \
      org.opencontainers.image.description="Compiled, in-memory Rahhal API boundary proof" \
      org.opencontainers.image.revision="${RAHHAL_REVISION}"
WORKDIR /workspace

COPY --from=service-runtime-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=service-build --chown=node:node /workspace/apps/api/package.json apps/api/package.json
COPY --from=service-build --chown=node:node /workspace/apps/api/dist apps/api/dist
COPY --from=service-build --chown=node:node /workspace/packages/contracts/package.json packages/contracts/package.json
COPY --from=service-build --chown=node:node /workspace/packages/contracts/dist packages/contracts/dist
COPY --from=service-build --chown=node:node /workspace/packages/domain/package.json packages/domain/package.json
COPY --from=service-build --chown=node:node /workspace/packages/domain/dist packages/domain/dist

USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/openapi.json').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"
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
