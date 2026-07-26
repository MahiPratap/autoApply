import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

import { resolveDatabaseUrl } from "./src/db/database-url";

// Node 24 loads .env natively — no dotenv dependency needed.
const envFile = resolve(import.meta.dirname, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Absolute, so the CLI and the runtime client can never disagree about
    // which file the database lives in.
    url: resolveDatabaseUrl(process.env["DATABASE_URL"], import.meta.dirname),
  },
});
