/**
 * autoApply — entry point.
 *
 * Step 1 (project init) only. The real CLI — `start`, `run`, `login`,
 * `review`, `report` — is built in Step 4 on top of commander, once config
 * loading (Step 2), the schema (Step 3), and logging are in place.
 */

const VERSION = "0.1.0";
const MODE = process.env["MODE"] ?? "dry-run";

function main(): void {
  console.log(`autoApply v${VERSION}`);
  console.log(`  node    ${process.version}`);
  console.log(`  mode    ${MODE}`);
  console.log(`  cwd     ${process.cwd()}`);
  console.log("");
  console.log("Scaffold is up. Next: Step 2 — config loading and validation.");
}

main();
