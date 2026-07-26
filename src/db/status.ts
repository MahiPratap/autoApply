/**
 * Status vocabularies.
 *
 * Prisma does not support enums on SQLite, so every status column is a String.
 * These const unions are the enforcement layer — nothing should write a status
 * literal that is not declared here, and `isValidTransition` is what keeps the
 * job lifecycle from skipping states.
 */

// --- Job ---------------------------------------------------------------------

export const JOB_STATUSES = [
  /** Row created from a search result. Nothing has been spent on it yet. */
  "DISCOVERED",
  /** Killed by the free deterministic prefilter. Never reaches the AI. */
  "FILTERED_OUT",
  /** AI score recorded. */
  "SCORED",
  /** Scoring failed after retries. Deliberately terminal — never auto-applied. */
  "SCORE_FAILED",
  /** Scored below threshold, on cooldown, or external ATS. */
  "SKIPPED",
  /** Waiting for a human decision. */
  "NEEDS_REVIEW",
  /** Approved for submission. */
  "QUEUED",
  /** Submission in flight. */
  "APPLYING",
  /** Submitted and confirmation observed. */
  "APPLIED",
  /** Submitted but no confirmation seen. NEVER retried — a duplicate is worse than a miss. */
  "SUBMITTED_UNVERIFIED",
  /** Submission attempt failed before completing. */
  "FAILED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** States from which nothing further happens automatically. */
export const TERMINAL_JOB_STATUSES = [
  "FILTERED_OUT",
  "SCORE_FAILED",
  "SKIPPED",
  "APPLIED",
  "SUBMITTED_UNVERIFIED",
] as const satisfies readonly JobStatus[];

const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  DISCOVERED: ["FILTERED_OUT", "SCORED", "SCORE_FAILED", "SKIPPED"],
  FILTERED_OUT: [],
  SCORED: ["QUEUED", "NEEDS_REVIEW", "SKIPPED"],
  SCORE_FAILED: ["NEEDS_REVIEW"],
  SKIPPED: ["NEEDS_REVIEW"],
  NEEDS_REVIEW: ["QUEUED", "SKIPPED"],
  QUEUED: ["APPLYING", "NEEDS_REVIEW", "SKIPPED"],
  APPLYING: ["APPLIED", "SUBMITTED_UNVERIFIED", "FAILED", "NEEDS_REVIEW"],
  APPLIED: [],
  // Terminal on purpose: re-submitting risks a duplicate application.
  SUBMITTED_UNVERIFIED: [],
  FAILED: ["QUEUED", "NEEDS_REVIEW"],
};

export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: JobStatus): readonly JobStatus[] {
  return JOB_TRANSITIONS[from];
}

// --- Application -------------------------------------------------------------

export const APPLICATION_STATUSES = [
  "PREPARING",
  /** Reached the pre-submit gate but MODE was dry-run. */
  "DRY_RUN",
  "SUBMITTED",
  "SUBMITTED_UNVERIFIED",
  "FAILED",
  /** Gave up: unresolvable question, external ATS, cap reached. */
  "ABANDONED",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// --- Run ---------------------------------------------------------------------

export const RUN_STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ["cron", "manual"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

// --- Supporting vocabularies -------------------------------------------------

export const APPLY_TYPES = ["native", "external", "unknown"] as const;
export type ApplyType = (typeof APPLY_TYPES)[number];

export const VERDICTS = ["strong", "possible", "weak"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const ANSWER_SOURCES = ["profile", "generated", "manual"] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

export const FIELD_TYPES = [
  "text",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "number",
  "date",
  "file",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const COMPANY_ACTIONS = ["block", "cooldown", "prioritize"] as const;
export type CompanyAction = (typeof COMPANY_ACTIONS)[number];

// --- Events ------------------------------------------------------------------

export const EVENT_KINDS = [
  "job.discovered",
  "job.status_changed",
  "job.scored",
  "application.prepared",
  "application.submitted",
  "application.failed",
  "run.started",
  "run.finished",
  "run.failed",
  "site.breaker_opened",
  "site.session_invalid",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];
