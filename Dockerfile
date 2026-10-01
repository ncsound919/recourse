# Recourse — production image.
#
# Native addons (isolated-vm, better-sqlite3, sharp, @lancedb/lancedb) compile
# during `npm ci`, so the full bookworm image (build-essential + python) is used
# for the BUILD stage. The client is built with Vite and the server is bundled to
# dist/server.cjs by esbuild. The runtime stage deliberately REUSES the already-
# compiled production node_modules from the build stage rather than running
# `npm ci` again on a `-slim` base (which lacks the toolchain and is the usual
# source of flaky native-build failures).
FROM node:26-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3050
# The server binds 127.0.0.1 by default; inside a container it must listen on
# all interfaces. Remote mutating calls still need RECOURSE_API_SECRET (or the
# bridge gateway listed in RECOURSE_TRUSTED_PEERS) — see src/lib/apiGuard.ts.
ENV RECOURSE_HOST=0.0.0.0
# Plan catalogue ships with the image (data/ is a runtime volume).
ENV RECOURSE_PLANS_DIR=/app/config/plans
# Prod-only, already-compiled dependencies (no second native build).
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/data/plans ./config/plans
# Runtime state (SQLite memory, ledgers, self-hosted tools) lives on a volume.
VOLUME ["/app/data", "/app/.selfhosted"]
EXPOSE 3050
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3050)+'/api/recourse/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# isolated-vm requires --no-node-snapshot on Node >= 20.
CMD ["node", "--no-node-snapshot", "dist/server.cjs"]
