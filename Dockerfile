# Recourse — production image.
#
# Native addons (isolated-vm, better-sqlite3, sharp) build during `npm ci`, so
# the full bookworm image (build-essential + python) is used. The client is built
# with Vite and the server is bundled to dist/server.cjs by esbuild; the runtime
# then has no dev tooling dependency.
FROM node:20-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3050
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Runtime state (SQLite memory, ledgers, self-hosted tools) lives on a volume.
VOLUME ["/app/data", "/app/.selfhosted"]
EXPOSE 3050
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3050)+'/api/recourse/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.cjs"]
