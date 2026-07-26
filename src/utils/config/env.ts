import { z } from "zod";

export const MODES = ["dry-run", "review", "auto"] as const;
export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error"] as const;

export type Mode = (typeof MODES)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Values that mean "not filled in yet" rather than a real setting. */
const PLACEHOLDERS = new Set(["", "sk-ant-...", "CHANGE_ME"]);

/** Treat empty strings and .env.example placeholders as absent, not invalid. */
const optionalSecret = z.preprocess(
  (v) => (typeof v === "string" && PLACEHOLDERS.has(v.trim()) ? undefined : v),
  z
    .string()
    .trim()
    .min(20, "looks too short to be a real Anthropic API key")
    .optional(),
);

/**
 * ANTHROPIC_API_KEY is deliberately optional.
 *
 * Config must load without it so discovery, filtering, the CLI, and the test
 * suite all work before any AI call exists — and so swapping Claude accounts
 * is never a startup failure. Call requireApiKey() at the point of use.
 */
export const EnvSchema = z.object({
  ANTHROPIC_API_KEY: optionalSecret,
  DATABASE_URL: z.string().trim().min(1).default("file:./storage/autoapply.db"),
  MODE: z.enum(MODES).default("dry-run"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  TZ: z.string().trim().min(1).default("UTC"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Read the API key at the point of use. Throws a message that says what to do
 * rather than a bare undefined-property error three frames deeper.
 */
export function requireApiKey(env: Env): string {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example). " +
        "Only AI scoring and answer generation need it — discovery and " +
        "filtering run without it.",
    );
  }
  return env.ANTHROPIC_API_KEY;
}
