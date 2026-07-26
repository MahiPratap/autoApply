/**
 * autoApply — entry point.
 *
 * Step 2: loads and validates configuration, then prints a summary. The real
 * CLI (`start`, `run`, `login`, `review`, `report`) arrives in Step 4 once the
 * schema and logging are in place.
 */

import { loadConfig, ConfigError, requireApiKey } from "./utils/config/index";
import { db, disconnectDb } from "./db/client";

/**
 * Read-only database probe. A missing table means migrations have not been
 * run — report that as guidance rather than a stack trace.
 */
async function describeDatabase(): Promise<string[]> {
  try {
    const [jobs, applied, pendingReview, runs] = await Promise.all([
      db().job.count(),
      db().job.count({ where: { status: "APPLIED" } }),
      db().job.count({ where: { status: "NEEDS_REVIEW" } }),
      db().run.count(),
    ]);
    return [
      `  jobs seen         ${jobs}`,
      `  applied           ${applied}`,
      `  awaiting review   ${pendingReview}`,
      `  runs recorded     ${runs}`,
    ];
  } catch {
    return ["  database          not migrated yet — run: npm run db:migrate"];
  }
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`\n✗ ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const { env, profile, search } = config;

  const enabledSites = Object.entries(search.sites)
    .filter(([, site]) => site?.enabled)
    .map(([name, site]) => `${name} (every ${site?.cadenceMinutes}m)`);

  let apiKeyState: string;
  try {
    requireApiKey(env);
    apiKeyState = "set";
  } catch {
    apiKeyState = "not set — AI scoring unavailable, discovery still works";
  }

  console.log("\n✓ configuration valid\n");
  console.log(`  mode              ${env.MODE}`);
  console.log(`  timezone          ${env.TZ}`);
  console.log(`  anthropic key     ${apiKeyState}`);
  console.log(`  candidate         ${profile.identity.fullName}`);
  console.log(`  experience        ${profile.experience.totalYears} years`);
  console.log(
    `  primary skills    ${profile.skills
      .filter((s) => s.primary)
      .map((s) => s.name)
      .join(", ")}`,
  );
  console.log(`  resumes           ${profile.resumes.length}`);
  console.log(`  enabled sites     ${enabledSites.join(", ") || "none"}`);
  console.log(
    `  thresholds        review ≥${search.global.reviewThreshold}, ` +
      `auto-apply ≥${search.global.autoApplyThreshold}`,
  );
  console.log(`  daily cap         ${search.global.dailyApplicationCap} applications`);
  console.log(
    `  quiet hours       ${search.global.quietHours.start}–${search.global.quietHours.end}`,
  );

  console.log("");
  for (const line of await describeDatabase()) console.log(line);

  console.log("\nNext: Step 4 — logging, repositories, CLI skeleton.\n");
  await disconnectDb();
}

await main();
