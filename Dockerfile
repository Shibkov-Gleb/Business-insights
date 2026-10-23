FROM node:22.19.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.25.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL=postgresql://build:build@localhost/build
RUN pnpm db:generate
RUN pnpm --filter @context/web build
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
CMD ["pnpm","api"]
