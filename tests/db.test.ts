import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDb, type PrismaClient } from "../src/db/client";
import { isValidTransition, allowedTransitions, JOB_STATUSES } from "../src/db/status";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const DB_PATH = join(tmpdir(), `autoapply-test-${randomUUID()}.db`);

let db: PrismaClient;

/**
 * Build the schema in a throwaway database by replaying the committed
 * migrations. Using the real migration SQL means these tests fail if a
 * migration is broken — which is the point.
 */
async function applyMigrations(client: PrismaClient): Promise<void> {
  const dir = join(PROJECT_ROOT, "prisma", "migrations");
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const folder of folders) {
    const sql = readFileSync(join(dir, folder, "migration.sql"), "utf8");
    for (const statement of sql.split(";")) {
      if (statement.trim().length > 0) await client.$executeRawUnsafe(statement);
    }
  }
}

function job(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    site: "naukri",
    externalId: id,
    canonicalHash: id,
    url: `https://naukri.com/${id}`,
    title: "Senior Backend Engineer",
    company: "Acme Corp",
    companyKey: "acme corp",
    ...overrides,
  };
}

beforeAll(async () => {
  db = createDb({ databaseUrl: `file:${DB_PATH}` });
  await applyMigrations(db);
});

afterAll(async () => {
  await db.$disconnect();
  rmSync(DB_PATH, { force: true });
});

beforeEach(async () => {
  // Event before Job: Event.runId is SetNull, but Event.jobId cascades.
  await db.event.deleteMany();
  await db.matchScore.deleteMany();
  await db.application.deleteMany();
  await db.job.deleteMany();
  await db.run.deleteMany();
  await db.siteState.deleteMany();
  await db.answerCache.deleteMany();
  await db.companyPolicy.deleteMany();
});

describe("schema", () => {
  it("accepts a job and applies defaults", async () => {
    const created = await db.job.create({ data: job() });
    expect(created.status).toBe("DISCOVERED");
    expect(created.applyType).toBe("unknown");
    expect(created.discoveredAt).toBeInstanceOf(Date);
  });

  it("stores every declared job status", async () => {
    for (const status of JOB_STATUSES) {
      const row = await db.job.create({ data: job({ status }) });
      expect(row.status).toBe(status);
    }
  });
});

describe("duplicate prevention", () => {
  it("rejects a second job with the same canonicalHash", async () => {
    // The load-bearing constraint: same role cross-posted to several sites, or
    // reposted next week by the same company, must not become two applications.
    const hash = "shared-hash";
    await db.job.create({ data: job({ canonicalHash: hash }) });

    await expect(
      db.job.create({ data: job({ canonicalHash: hash, site: "linkedin" }) }),
    ).rejects.toThrow();

    expect(await db.job.count()).toBe(1);
  });

  it("rejects a second job with the same site + externalId", async () => {
    await db.job.create({ data: job({ site: "naukri", externalId: "abc123" }) });
    await expect(
      db.job.create({ data: job({ site: "naukri", externalId: "abc123" }) }),
    ).rejects.toThrow();
  });

  it("allows the same externalId on a different site", async () => {
    await db.job.create({ data: job({ site: "naukri", externalId: "abc123" }) });
    await db.job.create({ data: job({ site: "linkedin", externalId: "abc123" }) });
    expect(await db.job.count()).toBe(2);
  });

  it("allows at most one application per job", async () => {
    const created = await db.job.create({ data: job() });
    const application = {
      jobId: created.id,
      mode: "review",
      resumeLabel: "primary",
      resumeFile: "resume.pdf",
    };

    await db.application.create({ data: application });
    await expect(db.application.create({ data: application })).rejects.toThrow();
    expect(await db.application.count()).toBe(1);
  });

  it("rejects a duplicate answer-cache question hash", async () => {
    const row = { questionHash: "h1", questionText: "Notice period?", fieldType: "text" };
    await db.answerCache.create({ data: { ...row, answerText: "60 days", source: "profile" } });
    await expect(
      db.answerCache.create({ data: { ...row, answerText: "30 days", source: "manual" } }),
    ).rejects.toThrow();
  });
});

describe("relations", () => {
  it("cascades deletes from job to scores, applications, and events", async () => {
    const created = await db.job.create({ data: job() });
    await db.matchScore.create({
      data: {
        jobId: created.id,
        score: 82,
        verdict: "strong",
        dimensions: "{}",
        reasons: "[]",
        model: "claude-opus-5",
        rubricVersion: "v1",
      },
    });
    await db.application.create({
      data: { jobId: created.id, mode: "review", resumeLabel: "primary", resumeFile: "r.pdf" },
    });
    await db.event.create({
      data: { kind: "job.discovered", jobId: created.id, toStatus: "DISCOVERED" },
    });

    await db.job.delete({ where: { id: created.id } });

    expect(await db.matchScore.count()).toBe(0);
    expect(await db.application.count()).toBe(0);
    expect(await db.event.count()).toBe(0);
  });

  it("keeps events when their run is deleted", async () => {
    // Events are the audit trail; losing them because a run row was tidied up
    // would defeat the purpose.
    const run = await db.run.create({ data: { site: "naukri" } });
    await db.event.create({ data: { kind: "run.started", runId: run.id } });

    await db.run.delete({ where: { id: run.id } });

    const events = await db.event.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]?.runId).toBeNull();
  });

  it("records status transitions on the audit trail", async () => {
    const created = await db.job.create({ data: job() });
    await db.event.create({
      data: {
        kind: "job.status_changed",
        jobId: created.id,
        fromStatus: "DISCOVERED",
        toStatus: "FILTERED_OUT",
        message: "title excluded: intern",
      },
    });

    const event = await db.event.findFirstOrThrow({ where: { jobId: created.id } });
    expect(event.fromStatus).toBe("DISCOVERED");
    expect(event.toStatus).toBe("FILTERED_OUT");
    expect(event.message).toContain("intern");
  });
});

describe("scheduler state", () => {
  it("upserts site state keyed by site", async () => {
    await db.siteState.upsert({
      where: { site: "naukri" },
      create: { site: "naukri", consecutiveFailures: 1 },
      update: { consecutiveFailures: 1 },
    });
    await db.siteState.upsert({
      where: { site: "naukri" },
      create: { site: "naukri" },
      update: { consecutiveFailures: 2 },
    });

    const state = await db.siteState.findUniqueOrThrow({ where: { site: "naukri" } });
    expect(state.consecutiveFailures).toBe(2);
    expect(await db.siteState.count()).toBe(1);
  });

  it("can reclaim a run left RUNNING by a killed process", async () => {
    const orphan = await db.run.create({ data: { site: "naukri", status: "RUNNING" } });
    const stale = await db.run.findMany({ where: { status: "RUNNING" } });
    expect(stale.map((r) => r.id)).toContain(orphan.id);
  });
});

describe("job status machine", () => {
  it("allows the normal happy path", () => {
    expect(isValidTransition("DISCOVERED", "SCORED")).toBe(true);
    expect(isValidTransition("SCORED", "QUEUED")).toBe(true);
    expect(isValidTransition("QUEUED", "APPLYING")).toBe(true);
    expect(isValidTransition("APPLYING", "APPLIED")).toBe(true);
  });

  it("never allows re-submitting an unverified submission", () => {
    // A duplicate application is worse than a missed one, so this state is a
    // dead end by design.
    expect(allowedTransitions("SUBMITTED_UNVERIFIED")).toHaveLength(0);
    expect(isValidTransition("SUBMITTED_UNVERIFIED", "APPLYING")).toBe(false);
    expect(isValidTransition("SUBMITTED_UNVERIFIED", "QUEUED")).toBe(false);
  });

  it("never allows re-applying to a job already applied to", () => {
    expect(allowedTransitions("APPLIED")).toHaveLength(0);
  });

  it("never allows a scoring failure to reach submission", () => {
    expect(isValidTransition("SCORE_FAILED", "QUEUED")).toBe(false);
    expect(isValidTransition("SCORE_FAILED", "APPLYING")).toBe(false);
    expect(allowedTransitions("SCORE_FAILED")).toEqual(["NEEDS_REVIEW"]);
  });

  it("never allows skipping scoring entirely", () => {
    expect(isValidTransition("DISCOVERED", "QUEUED")).toBe(false);
    expect(isValidTransition("DISCOVERED", "APPLYING")).toBe(false);
  });

  it("allows a failed attempt to be retried but a filtered job never to be", () => {
    expect(isValidTransition("FAILED", "QUEUED")).toBe(true);
    expect(allowedTransitions("FILTERED_OUT")).toHaveLength(0);
  });
});
