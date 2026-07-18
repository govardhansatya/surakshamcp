# SurakshaMCP server (NitroStack / TypeScript)
FROM node:20.18.1-slim AS build
WORKDIR /app
# better-sqlite3 is a native addon — needs a toolchain to compile during npm ci.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20.18.1-slim
WORKDIR /app
ENV NODE_ENV=production
# non-root user; /app/data holds the SQLite incident DB (mounted as a volume in compose)
RUN useradd -m appuser && mkdir -p /app/data && chown appuser /app/data
ENV SURAKSHA_DB_PATH=/app/data/suraksha.db
# @nitrostack/core defaults HOST to 'localhost' if unset, which is unreachable from outside
# a container's network namespace — must bind 0.0.0.0 for the published port to actually work.
ENV HOST=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
USER appuser
EXPOSE 3000
CMD ["node", "dist/index.js"]
