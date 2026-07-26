import { z } from "zod";

/**
 * The profile is the ONLY source of facts the AI is permitted to assert about
 * you. If a job application asks something this file cannot answer, the
 * resolver flags it for human review rather than inventing a value.
 *
 * Keep it accurate. Everything downstream — matching, form answers, cover
 * letters — inherits its truthfulness from here.
 */

export const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export const WORK_MODES = ["onsite", "hybrid", "remote", "any"] as const;
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
export const AUTH_STATUSES = [
  "citizen",
  "permanent_resident",
  "work_visa",
  "needs_sponsorship",
] as const;

const nonEmpty = (label: string) => z.string().trim().min(1, `${label} is required`);

const IdentitySchema = z.object({
  fullName: nonEmpty("fullName"),
  firstName: nonEmpty("firstName"),
  lastName: nonEmpty("lastName"),
  /** One-line professional summary. Used as context when scoring, not submitted verbatim. */
  headline: z.string().trim().max(200).optional(),
});

const ContactSchema = z.object({
  email: z.email("must be a valid email address"),
  /** Digits only, no country code — kept separate because forms split them. */
  phone: z.string().trim().regex(/^\d{6,15}$/, "digits only, no country code or spaces"),
  phoneCountryCode: z
    .string()
    .trim()
    .regex(/^\+\d{1,4}$/, "must look like +91 or +1"),
  city: nonEmpty("city"),
  state: z.string().trim().optional(),
  country: nonEmpty("country"),
  linkedinUrl: z.url("must be a full URL including https://"),
  githubUrl: z.url().optional(),
  portfolioUrl: z.url().optional(),
});

const WorkAuthorizationSchema = z.object({
  /** Country the authorization applies to, e.g. "India", "United States". */
  country: nonEmpty("workAuthorization.country"),
  status: z.enum(AUTH_STATUSES),
  requiresSponsorship: z.boolean(),
  willingToRelocate: z.boolean(),
});

const ExperienceSchema = z.object({
  totalYears: z.number().min(0).max(60),
  currentTitle: nonEmpty("experience.currentTitle"),
  currentCompany: z.string().trim().optional(),
  currentlyEmployed: z.boolean(),
  /** 0 if immediately available. Naukri asks this on nearly every application. */
  noticePeriodDays: z.number().int().min(0).max(365),
});

const CompensationSchema = z
  .object({
    /** ISO 4217, e.g. INR, USD. */
    currency: z
      .string()
      .trim()
      .length(3, "use a 3-letter ISO currency code like INR or USD")
      .toUpperCase(),
    /** Annual figures, in whole units of `currency` (not lakhs, not thousands). */
    current: z.number().min(0).optional(),
    expectedMin: z.number().min(0),
    expectedMax: z.number().min(0),
    /**
     * Single figure for forms that accept only one (Naukri's "expected CTC").
     * Omit and it defaults to expectedMin.
     */
    preferredSingle: z.number().min(0).optional(),
    negotiable: z.boolean().default(true),
  })
  .refine((c) => c.expectedMax >= c.expectedMin, {
    message: "expectedMax must be greater than or equal to expectedMin",
    path: ["expectedMax"],
  })
  .refine(
    (c) =>
      c.preferredSingle === undefined ||
      (c.preferredSingle >= c.expectedMin && c.preferredSingle <= c.expectedMax),
    {
      message: "preferredSingle must fall between expectedMin and expectedMax",
      path: ["preferredSingle"],
    },
  );

const PreferencesSchema = z.object({
  /** Titles you want. Drives search queries AND the matcher's seniority judgment. */
  titles: z.array(nonEmpty("title")).min(1, "list at least one preferred job title"),
  locations: z.array(nonEmpty("location")).min(1, "list at least one preferred location"),
  workMode: z.enum(WORK_MODES),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).min(1),
});

const SkillSchema = z.object({
  name: nonEmpty("skill.name"),
  years: z.number().min(0).max(60),
  level: z.enum(SKILL_LEVELS),
  /** Primary skills are weighted more heavily by the matcher. */
  primary: z.boolean().default(false),
});

const EducationSchema = z.object({
  degree: nonEmpty("education.degree"),
  field: nonEmpty("education.field"),
  institution: nonEmpty("education.institution"),
  yearCompleted: z.number().int().min(1950).max(2100),
  grade: z.string().trim().optional(),
});

const LanguageSchema = z.object({
  name: nonEmpty("language.name"),
  proficiency: z.enum(["basic", "conversational", "fluent", "native"]),
});

const ResumeSchema = z.object({
  label: nonEmpty("resume.label"),
  /** Filename inside storage/resumes/ — not a full path. */
  file: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^/\\]+\.pdf$/i, "must be a bare .pdf filename inside storage/resumes/"),
  /** Role families this variant targets. Matched against the job's inferred family. */
  targetRoles: z.array(nonEmpty("targetRole")).default([]),
  isDefault: z.boolean().default(false),
});

/**
 * Optional demographic answers. Leaving this out is fine and is the default —
 * those questions then route to human review instead of being auto-answered.
 */
const EeoSchema = z.object({
  gender: z.string().trim().optional(),
  ethnicity: z.string().trim().optional(),
  veteranStatus: z.string().trim().optional(),
  disabilityStatus: z.string().trim().optional(),
});

export const ProfileSchema = z
  .object({
    identity: IdentitySchema,
    contact: ContactSchema,
    workAuthorization: WorkAuthorizationSchema,
    experience: ExperienceSchema,
    compensation: CompensationSchema,
    preferences: PreferencesSchema,
    skills: z.array(SkillSchema).min(1, "list at least one skill"),
    education: z.array(EducationSchema).default([]),
    languages: z.array(LanguageSchema).default([]),
    resumes: z.array(ResumeSchema).min(1, "at least one resume is required"),
    eeo: EeoSchema.optional(),
    /**
     * Free-form answers to recurring application questions, keyed by a short
     * slug. The answer resolver checks these before asking the AI to generate
     * anything, so adding an entry here permanently removes a review prompt.
     */
    extras: z.record(z.string(), z.string()).default({}),
  })
  .refine((p) => p.resumes.filter((r) => r.isDefault).length === 1, {
    message: "exactly one resume must have isDefault: true",
    path: ["resumes"],
  })
  .refine((p) => p.skills.some((s) => s.primary), {
    message: "mark at least one skill as primary: true",
    path: ["skills"],
  })
  .refine((p) => p.skills.every((s) => s.years <= p.experience.totalYears), {
    message: "a skill cannot have more years than experience.totalYears",
    path: ["skills"],
  });

export type Profile = z.infer<typeof ProfileSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type ResumeVariant = z.infer<typeof ResumeSchema>;
