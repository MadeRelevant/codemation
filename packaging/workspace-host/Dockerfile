# syntax=docker/dockerfile:1.7
#
# codemation-workspace-host — tiny base image for managed workspace pods.
# Build context: framework monorepo root. Build with:
#   docker build -f packaging/workspace-host/Dockerfile \
#     -t ghcr.io/maderelevant/codemation-workspace-host:0.8.0 .
#
# No framework code is baked in. At pod boot the init-containers:
#   1. Hydrate user code from S3 into /workspace (init-hydrate).
#   2. Run pnpm install --frozen-lockfile (init-install, reads /workspace/package.json
#      against the in-cluster Verdaccio at verdaccio.control-plane.svc.cluster.local:4873).
#   3. Run prisma migrate deploy (init-migrate).
# This container then runs the CLI serve command directly.

ARG NODE_VERSION=22
ARG PNPM_VERSION=10.13.1

FROM node:${NODE_VERSION}-alpine
ARG PNPM_VERSION

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate \
 && apk add --no-cache tini aws-cli \
 && addgroup -g 10001 -S codemation \
 && adduser -u 10001 -S -G codemation codemation \
 && mkdir -p /workspace && chown -R codemation:codemation /workspace

USER codemation
WORKDIR /workspace
EXPOSE 4001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/workspace/node_modules/@codemation/cli/bin/codemation.js", "serve", "web", "--headless", "--consumer-root", "/workspace"]
