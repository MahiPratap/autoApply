import { z } from "zod";

/**
 * Search, filtering, and safety-rail configuration.
 *
 * Everything here is enforced by the scheduler and matcher, never by the site
 * adapters — so no adapter bug can exceed a cap or bypass a threshold.
 */

export const SITES = ["naukri", "linkedin", "indeed"] as const;
export type SiteName = (typeof SITES)[number];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const nonEmpty = (label: string) => z.string().trim().min(1, `${label} is required`);

const QuerySchema = z.object({
  /** Free-text search string, exactly as you would type it into the site. */
  keywords: nonEmpty("query.keywords"),
  location: z.string().trim().default(""),
  remoteOnly: z.boolean().default(false),
  /** Site-native "date posted" filter. Keep at 24 to stay cheap. */
  postedWithinHours: z.number().int().min(1).max(168).default(24),
  experienceYears: z
    .object({ min: z.number().min(0).max(60), max: z.number().min(0).max(60) })
    .refine((e) => e.max >= e.min, { message: "max must be >= min", path: ["max"] })
    .optional(),
  /** Annual, in the profile's currency. Only applied when the posting states a salary. */
  salaryFloor: z.number().min(0).optional(),
});

const SiteConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * Floor of 15 minutes is deliberate. Tighter than that is indistinguishable
   * from hammering and is the fastest route to a restricted account.
   */
  cadenceMinutes: z.number().int().min(15).max(1440).default(30),
  /** Detail-page loads per run. The main lever on both cost and footprint. */
  maxDetailFetchesPerRun: z.number().int().min(1).max(200).default(25),
  /** Per-site submission cap per calendar day, independent of the global cap. */
  dailyCapPerSite: z.number().int().min(0).max(100).default(8),
  /** Consecutive run failures before the site is paused. */
  circuitBreakerThreshold: z.number().int().min(1).max(20).default(3),
  circuitBreakerCooldownMinutes: z.number().int().min(5).max(1440).default(120),
  queries: z.array(QuerySchema).default([]),
});

const FiltersSchema = z.object({
  /** Case-insensitive substring match on the job title. Cheapest, highest-yield filter. */
  titleExcludes: z.array(nonEmpty("titleExclude")).default([]),
  /** If non-empty, the title must contain at least one of these. */
  titleIncludesAny: z.array(nonEmpty("titleInclude")).default([]),
  /** Matched case-insensitively against the company name. */
  companyBlocklist: z.array(nonEmpty("company")).default([]),
  descriptionExcludes: z.array(nonEmpty("descriptionExclude")).default([]),
  maxJobAgeHours: z.number().int().min(1).max(720).default(48),
  /**
   * External ATS (Workday, Greenhouse, Lever, Taleo) postings are captured for
   * manual action. Auto-filling arbitrary ATS forms produces bad applications;
   * leave this false.
   */
  allowExternalAts: z.boolean().default(false),
});

const GlobalSchema = z
  .object({
    /** Total submissions per calendar day across every site. */
    dailyApplicationCap: z.number().int().min(0).max(200).default(15),
    /** Below this score a job is dropped outright. */
    reviewThreshold: z.number().int().min(0).max(100).default(65),
    /** At or above this score, MODE=auto submits without asking. */
    autoApplyThreshold: z.number().int().min(0).max(100).default(80),
    /** Never a second application to the same company inside this window. */
    companyCooldownDays: z.number().int().min(0).max(365).default(90),
    /** No submissions inside this window. Local time, per TZ in .env. */
    quietHours: z
      .object({
        start: z.string().regex(HHMM, "must be HH:MM, 24-hour"),
        end: z.string().regex(HHMM, "must be HH:MM, 24-hour"),
      })
      .default({ start: "22:00", end: "07:00" }),
    /** Randomized delay bounds between page actions, in milliseconds. */
    actionDelayMs: z
      .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
      .refine((d) => d.max >= d.min, { message: "max must be >= min", path: ["max"] })
      .default({ min: 800, max: 2500 }),
  })
  .refine((g) => g.autoApplyThreshold >= g.reviewThreshold, {
    message: "autoApplyThreshold must be greater than or equal to reviewThreshold",
    path: ["autoApplyThreshold"],
  });

export const SearchConfigSchema = z
  .object({
    global: GlobalSchema,
    sites: z.object({
      naukri: SiteConfigSchema.optional(),
      linkedin: SiteConfigSchema.optional(),
      indeed: SiteConfigSchema.optional(),
    }),
    filters: FiltersSchema,
  })
  .superRefine((cfg, ctx) => {
    const entries = Object.entries(cfg.sites) as [SiteName, z.infer<typeof SiteConfigSchema>][];
    const enabled = entries.filter(([, s]) => s?.enabled);

    if (enabled.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "no sites are enabled — set enabled: true on at least one site",
        path: ["sites"],
      });
    }

    for (const [name, site] of enabled) {
      if (site.queries.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `${name} is enabled but has no queries`,
          path: ["sites", name, "queries"],
        });
      }
    }
  });

export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type JobQuery = z.infer<typeof QuerySchema>;
export type Filters = z.infer<typeof FiltersSchema>;
