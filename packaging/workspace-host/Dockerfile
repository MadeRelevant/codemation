# syntax=docker/dockerfile:1.7
#
# codemation-workspace-host — framework host runtime for managed workspace pods.
# Build context: framework monorepo root. Build with:
#   docker build -f packaging/workspace-host/Dockerfile \
#     -t ghcr.io/maderelevant/codemation-workspace-host:1.0.0 .
#
# Stages:
#   builder — install dependencies + build framework packages
#   runtime — lean alpine image, workspace tree intact, tsx at runtime via --conditions=development
#
# Runtime: worker code is mounted at /workspace by the init-container (hydrated from S3).
# The host reads CODEMATION_CONFIG_PATH (defaults to /workspace/codemation.config.ts).
# auth.kind "managed" boot guard enforces required env vars — container will fail-loud
# when WORKSPACE_ID / WORKSPACE_PAIRING_SECRET / CONTROL_PLANE_URL etc. are absent.

ARG NODE_VERSION=22
ARG PNPM_VERSION=10.13.1

FROM node:${NODE_VERSION}-alpine AS builder
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /build
COPY . .
# Disable husky (prepare script) and skip tooling-only postinstall scripts.
# @ast-grep/cli has a native binary postinstall that fails on alpine; it's tooling-only.
# --ignore-scripts skips ALL postinstall scripts; we re-run only prisma generate explicitly.
ENV HUSKY=0
# Install only the packages needed at runtime (host + its transitive deps).
RUN --mount=type=cache,id=pnpm-fw,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
      --filter @codemation/host... \
      --filter @codemation/core... \
      --filter @codemation/core-nodes... \
      --filter @codemation/core-nodes-gmail... \
      --filter @codemation/managed-auth...
# Prisma client generation (must run after install, skipped by --ignore-scripts above).
RUN pnpm --filter @codemation/host prisma:generate
# Build is kept as a typecheck / dist gate; the runtime uses --conditions=development (src).
RUN pnpm exec turbo run build \
      --filter @codemation/host... \
      --filter @codemation/core... \
      --filter @codemation/core-nodes... \
      --filter @codemation/core-nodes-gmail... \
      --filter @codemation/managed-auth...

FROM node:${NODE_VERSION}-alpine AS runtime
# tini for proper signal forwarding; aws-cli for S3 operations (init-container pattern).
RUN apk add --no-cache tini aws-cli \
 && addgroup -g 10001 -S codemation \
 && adduser -u 10001 -S -G codemation codemation
ENV NODE_ENV=production \
    TSX_TSCONFIG_PATH=/codemation/tsconfig.base.json \
    CODEMATION_CONFIG_PATH=/workspace/codemation.config.ts
# Copy the whole workspace tree so pnpm symlinks resolve correctly.
COPY --from=builder --chown=codemation:codemation /build /codemation
# Workspace user code is mounted here by the init-container at pod start.
RUN mkdir -p /workspace && chown -R codemation:codemation /workspace
USER codemation
# Run from the host package dir so tsx resolves local node_modules.
WORKDIR /codemation/packages/host
EXPOSE 4001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx/esm", "--conditions=development", "src/bin/server.ts"]
