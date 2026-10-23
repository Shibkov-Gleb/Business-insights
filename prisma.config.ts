import "dotenv/config";
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: { path: "packages/db/prisma/migrations" },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://context:context_local_only@localhost:5433/context",
  },
});
