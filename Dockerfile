# SurakshaMCP server (NitroStack / TypeScript)
FROM node:20.18.1-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20.18.1-slim
WORKDIR /app
ENV NODE_ENV=production
# non-root user
RUN useradd -m appuser
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
USER appuser
EXPOSE 3000
CMD ["node", "dist/index.js"]
