# syntax=docker/dockerfile:1
# EasyArr dashboard image: one image, two commands — `serve` (default) and `init` (SPEC §7.1).
# Build from the repo root:  docker build -f dashboard/Dockerfile .
#
# The JS build runs once on the build machine's own platform ($BUILDPLATFORM); only the tiny
# runtime stage is per-architecture, so multi-arch builds don't need to run pnpm under QEMU.

ARG NODE_IMAGE=node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /src
RUN npm install --global --no-fund --no-audit pnpm@12.16.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY dashboard/shared/package.json dashboard/shared/
COPY dashboard/server/package.json dashboard/server/
COPY dashboard/web/package.json dashboard/web/
RUN pnpm install --frozen-lockfile
COPY dashboard/shared dashboard/shared
COPY dashboard/server dashboard/server
COPY dashboard/web dashboard/web
RUN pnpm --filter @easyarr/shared --filter @easyarr/server --filter @easyarr/web build \
 && pnpm --filter @easyarr/server deploy --prod /out/server

FROM ${NODE_IMAGE}
ARG VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="EasyArr" \
      org.opencontainers.image.description="EasyArr dashboard, setup wizard and init for umbrelOS" \
      org.opencontainers.image.source="https://github.com/w1kyu/easyarr" \
      org.opencontainers.image.licenses="MIT AND PolyForm-Noncommercial-1.0.0" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production \
    EASYARR_VERSION=${VERSION} \
    EASYARR_WEB_DIR=/app/web \
    EASYARR_LICENSES_DIR=/licenses \
    EASYARR_STATE_DIR=/easyarr \
    PORT=3000
WORKDIR /app
COPY --from=build /out/server /app/server
COPY --from=build /src/dashboard/web/dist /app/web
# License notices travel with the image (SPEC §14.1).
COPY LICENSE NOTICE.md /licenses/
COPY dashboard/web/src/vendor/umbrel/LICENSE.md /licenses/umbrelOS-LICENSE.md
COPY dashboard/web/src/vendor/umbrel/PROVENANCE.md /licenses/umbrelOS-PROVENANCE.md
# `serve` runs as the unprivileged `node` user (uid 1000 = Umbrel's user).
# The compose file runs `init` as root so it can create folders and fix ownership.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["node", "/app/server/dist/index.js"]
CMD ["serve"]
