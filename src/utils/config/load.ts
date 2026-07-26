import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { EnvSchema, type Env } from "./env";
import { ProfileSchema, type Profile } from "./profile.schema";
import { SearchConfigSchema, type SearchConfig } from "./search.schema";

export const PLACEHOLDER_TOKEN = "CHANGE_ME";

export const DEFAULT_PROFILE_PATH = "config/profile.yaml";
export const DEFAULT_SEARCH_PATH = "config/search.yaml";

export interface AppConfig {
  env: Env;
  profile: Profile;
  search: SearchConfig;
}

/**
 * A configuration problem the user has to fix. Carries every problem found,
 * not just the first, so one run of the loader is enough to finish editing.
 */
export class ConfigError extends Error {
  readonly hint: string | undefined;

  constructor(
    /** Terse origin label — a file path, or "environment". */
    readonly source: string,
    /** What is wrong with it, e.g. "still contains template values". */
    readonly summary: string,
    readonly problems: string[],
    hint?: string,
  ) {
    const body = problems.map((p) => `  - ${p}`).join("\n");
    super(`${source} — ${summary}\n${body}${hint ? `\n\n${hint}` : ""}`);
    this.name = "ConfigError";
    this.hint = hint;
  }
}

/** "compensation.expectedMax" / "skills[2].years" */
function pathToString(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out === "" ? String(seg) : `.${String(seg)}`;
  }
  return out === "" ? "(root)" : out;
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${pathToString(i.path)} — ${i.message}`);
}

/**
 * Walk the parsed config for values still set to CHANGE_ME. This is what lets
 * us ship a committed template that loads structurally but refuses to run
 * until it holds real data — a placeholder must never reach a job application.
 */
function findPlaceholders(value: unknown, path: PropertyKey[] = [], found: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.includes(PLACEHOLDER_TOKEN)) found.push(pathToString(path));
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findPlaceholders(v, [...path, i], found));
    return found;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) findPlaceholders(v, [...path, k], found);
  }
  return found;
}

function readYaml(relPath: string, exampleName: string): unknown {
  const abs = resolve(process.cwd(), relPath);

  if (!existsSync(abs)) {
    throw new ConfigError(
      relPath,
      "not found",
      [`expected a file at ${abs}`],
      `Create it from the template:\n  cp config/${exampleName} ${relPath}`,
    );
  }

  let raw: string;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (cause) {
    throw new ConfigError(relPath, "could not be read", [String(cause)]);
  }

  try {
    return parseYaml(raw);
  } catch (cause) {
    // YAML syntax errors carry line/column detail worth surfacing verbatim.
    throw new ConfigError(relPath, "is not valid YAML", [
      cause instanceof Error ? cause.message : String(cause),
    ]);
  }
}

const PLACEHOLDER_HINT = "Replace every CHANGE_ME with your real details before running.";

const describePlaceholder = (path: string) => `${path} — still set to ${PLACEHOLDER_TOKEN}`;

function validate<T>(schema: z.ZodType<T>, data: unknown, source: string): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    // Scan the RAW input too. Otherwise a schema error hides every remaining
    // placeholder behind it, and the user fixes one thing per restart.
    //
    // A CHANGE_ME in a numeric field produces both a schema error and a
    // placeholder hit for the same path; report it once, as the schema error,
    // since that names the expected type.
    const reportedPaths = new Set(result.error.issues.map((i) => pathToString(i.path)));
    const allPlaceholders = findPlaceholders(data);
    const unreported = allPlaceholders.filter((p) => !reportedPaths.has(p));

    throw new ConfigError(
      source,
      "is not ready",
      [...formatIssues(result.error), ...unreported.map(describePlaceholder)],
      allPlaceholders.length > 0 ? PLACEHOLDER_HINT : undefined,
    );
  }

  // Scan the parsed result so defaults are covered as well as raw values.
  const placeholders = findPlaceholders(result.data);
  if (placeholders.length > 0) {
    throw new ConfigError(
      source,
      "still contains template values",
      placeholders.map(describePlaceholder),
      PLACEHOLDER_HINT,
    );
  }
  return result.data;
}

/**
 * Load .env into process.env if present. Uses Node's built-in loader — no
 * dotenv dependency. A missing .env is fine; every field has a default or is
 * optional.
 */
export function loadDotEnv(relPath = ".env"): void {
  const abs = resolve(process.cwd(), relPath);
  if (!existsSync(abs)) return;
  process.loadEnvFile(abs);
}

export function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new ConfigError(
      "environment",
      "is invalid",
      formatIssues(result.error),
      "See .env.example for the expected values.",
    );
  }
  return result.data;
}

export function loadProfile(relPath = DEFAULT_PROFILE_PATH): Profile {
  return validate(ProfileSchema, readYaml(relPath, "profile.example.yaml"), relPath);
}

export function loadSearchConfig(relPath = DEFAULT_SEARCH_PATH): SearchConfig {
  return validate(SearchConfigSchema, readYaml(relPath, "search.example.yaml"), relPath);
}

export interface LoadOptions {
  profilePath?: string;
  searchPath?: string;
  /** Skip loading .env (used by tests, which set process.env directly). */
  skipDotEnv?: boolean;
}

/**
 * Load and validate everything.
 *
 * Deliberately does NOT stop at the first bad source: it collects problems
 * from the environment, the profile, and the search config together, so one
 * run tells you every edit to make instead of one per restart.
 */
export function loadConfig(options: LoadOptions = {}): AppConfig {
  if (!options.skipDotEnv) loadDotEnv();

  const problems: string[] = [];
  const hints = new Set<string>();

  function attempt<T>(load: () => T): T | undefined {
    try {
      return load();
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      problems.push(...error.problems.map((p) => `[${error.source}] ${p}`));
      if (error.hint) hints.add(error.hint);
      return undefined;
    }
  }

  const env = attempt(() => loadEnv());
  const profile = attempt(() => loadProfile(options.profilePath ?? DEFAULT_PROFILE_PATH));
  const search = attempt(() => loadSearchConfig(options.searchPath ?? DEFAULT_SEARCH_PATH));

  if (problems.length > 0 || !env || !profile || !search) {
    throw new ConfigError(
      "configuration",
      "is not usable yet",
      problems,
      [...hints].join("\n\n") || undefined,
    );
  }

  return { env, profile, search };
}
