import { resolve } from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "./generated/client";
import { resolveDatabaseUrl } from "./database-url";

/** src/db → project root */
const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");

export interface DbOptions {
  /** Overrides DATABASE_URL. Tests pass a temp file so they never touch the real db. */
  databaseUrl?: string;
  /** Log every query. Useful when a filter silently matches nothing. */
  logQueries?: boolean;
}

/**
 * Prisma 7 connects through a driver adapter rather than a bundled engine, so
 * the connection string is handed to the adapter, not the client.
 */
export function createDb(options: DbOptions = {}): PrismaClient {
  const url = resolveDatabaseUrl(options.databaseUrl ?? process.env["DATABASE_URL"], PROJECT_ROOT);

  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
    log: options.logQueries ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

let singleton: PrismaClient | undefined;

/**
 * Shared client for the running app. One connection for the whole process —
 * SQLite is a single writer, and a second client would only create lock
 * contention with itself.
 */
export function db(): PrismaClient {
  singleton ??= createDb({ logQueries: process.env["LOG_LEVEL"] === "trace" });
  return singleton;
}

export async function disconnectDb(): Promise<void> {
  if (!singleton) return;
  await singleton.$disconnect();
  singleton = undefined;
}

export type { PrismaClient };
