import { isAbsolute, resolve } from "node:path";

export const DEFAULT_DATABASE_URL = "file:./storage/autoapply.db";

/**
 * Normalise a SQLite `file:` URL to an absolute path.
 *
 * Prisma resolves relative SQLite paths differently depending on whether the
 * CLI or the client is doing the resolving, which is a reliable way to end up
 * with two database files and a confusing afternoon. Both callers route
 * through here so they can only ever agree.
 *
 * Non-file URLs (a future Postgres move) pass through untouched.
 */
export function resolveDatabaseUrl(raw: string | undefined, projectRoot: string): string {
  const url = raw?.trim() || DEFAULT_DATABASE_URL;
  if (!url.startsWith("file:")) return url;

  const path = url.slice("file:".length);
  // ":memory:" and other special forms are not filesystem paths.
  if (path.startsWith(":") || isAbsolute(path)) return url;

  return `file:${resolve(projectRoot, path)}`;
}
