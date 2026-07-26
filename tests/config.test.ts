import { describe, it, expect } from "vitest";

import { ProfileSchema } from "../src/utils/config/profile.schema";
import { SearchConfigSchema } from "../src/utils/config/search.schema";
import { EnvSchema } from "../src/utils/config/env";
import { ConfigError, loadProfile, loadSearchConfig } from "../src/utils/config/load";

/** Minimal profile that passes every rule. Tests mutate copies of this. */
function validProfile(): Record<string, unknown> {
  return {
    identity: { fullName: "Test User", firstName: "Test", lastName: "User" },
    contact: {
      email: "test@example.com",
      phone: "9999999999",
      phoneCountryCode: "+91",
      city: "Bengaluru",
      country: "India",
      linkedinUrl: "https://www.linkedin.com/in/test",
    },
    workAuthorization: {
      country: "India",
      status: "citizen",
      requiresSponsorship: false,
      willingToRelocate: true,
    },
    experience: {
      totalYears: 5,
      currentTitle: "Backend Engineer",
      currentlyEmployed: true,
      noticePeriodDays: 60,
    },
    compensation: { currency: "INR", expectedMin: 1_600_000, expectedMax: 2_000_000 },
    preferences: {
      titles: ["Senior Backend Engineer"],
      locations: ["Bengaluru"],
      workMode: "any",
      employmentTypes: ["full_time"],
    },
    skills: [{ name: "TypeScript", years: 5, level: "advanced", primary: true }],
    resumes: [{ label: "primary", file: "resume.pdf", isDefault: true }],
  };
}

function validSearch(): Record<string, unknown> {
  return {
    global: {},
    sites: { naukri: { enabled: true, queries: [{ keywords: "Node.js Developer" }] } },
    filters: {},
  };
}

/** All issue paths from a failed parse, as dotted strings. */
function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((i) => i.path.map(String).join("."));
}

describe("ProfileSchema", () => {
  it("accepts a valid profile and applies defaults", () => {
    const result = ProfileSchema.safeParse(validProfile());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.compensation.negotiable).toBe(true);
    expect(result.data.education).toEqual([]);
    expect(result.data.extras).toEqual({});
  });

  it("names the exact missing field", () => {
    const p = validProfile();
    delete (p.contact as Record<string, unknown>).phone;
    const result = ProfileSchema.safeParse(p);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("contact.phone");
  });

  it("rejects a phone number with a country code baked in", () => {
    const p = validProfile();
    (p.contact as Record<string, unknown>).phone = "+91 99999 99999";
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });

  it("rejects expectedMax below expectedMin, pointing at expectedMax", () => {
    const p = validProfile();
    p.compensation = { currency: "INR", expectedMin: 2_000_000, expectedMax: 1_000_000 };
    const result = ProfileSchema.safeParse(p);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("compensation.expectedMax");
  });

  it("rejects preferredSingle outside the expected range", () => {
    const p = validProfile();
    p.compensation = {
      currency: "INR",
      expectedMin: 1_600_000,
      expectedMax: 2_000_000,
      preferredSingle: 3_000_000,
    };
    const result = ProfileSchema.safeParse(p);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("compensation.preferredSingle");
  });

  it("requires exactly one default resume", () => {
    const p = validProfile();
    p.resumes = [
      { label: "a", file: "a.pdf", isDefault: true },
      { label: "b", file: "b.pdf", isDefault: true },
    ];
    expect(ProfileSchema.safeParse(p).success).toBe(false);

    p.resumes = [{ label: "a", file: "a.pdf", isDefault: false }];
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });

  it("rejects a resume path instead of a bare filename", () => {
    const p = validProfile();
    p.resumes = [{ label: "a", file: "storage/resumes/a.pdf", isDefault: true }];
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });

  it("rejects a skill with more years than total experience", () => {
    const p = validProfile();
    p.skills = [{ name: "Go", years: 12, level: "expert", primary: true }];
    const result = ProfileSchema.safeParse(p);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("skills");
  });

  it("requires at least one primary skill", () => {
    const p = validProfile();
    p.skills = [{ name: "Go", years: 2, level: "intermediate", primary: false }];
    expect(ProfileSchema.safeParse(p).success).toBe(false);
  });
});

describe("SearchConfigSchema", () => {
  it("accepts a valid config and applies safety-rail defaults", () => {
    const result = SearchConfigSchema.safeParse(validSearch());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.global.dailyApplicationCap).toBe(15);
    expect(result.data.global.reviewThreshold).toBe(65);
    expect(result.data.global.autoApplyThreshold).toBe(80);
    expect(result.data.global.quietHours).toEqual({ start: "22:00", end: "07:00" });
    expect(result.data.filters.allowExternalAts).toBe(false);
    expect(result.data.sites.naukri?.cadenceMinutes).toBe(30);
  });

  it("rejects a config with no sites enabled", () => {
    const c = validSearch();
    c.sites = { naukri: { enabled: false, queries: [] } };
    const result = SearchConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("sites");
  });

  it("rejects an enabled site with no queries, naming the site", () => {
    const c = validSearch();
    c.sites = { naukri: { enabled: true, queries: [] } };
    const result = SearchConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("sites.naukri.queries");
  });

  it("rejects a cadence below the 15-minute floor", () => {
    const c = validSearch();
    c.sites = {
      naukri: { enabled: true, cadenceMinutes: 5, queries: [{ keywords: "dev" }] },
    };
    const result = SearchConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("sites.naukri.cadenceMinutes");
  });

  it("rejects autoApplyThreshold below reviewThreshold", () => {
    const c = validSearch();
    c.global = { reviewThreshold: 90, autoApplyThreshold: 50 };
    const result = SearchConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("global.autoApplyThreshold");
  });

  it("rejects malformed quiet hours", () => {
    const c = validSearch();
    c.global = { quietHours: { start: "10pm", end: "07:00" } };
    expect(SearchConfigSchema.safeParse(c).success).toBe(false);
  });
});

describe("EnvSchema", () => {
  it("defaults to the safest mode when nothing is set", () => {
    const result = EnvSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.MODE).toBe("dry-run");
    expect(result.data.LOG_LEVEL).toBe("info");
    expect(result.data.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("treats an empty or placeholder API key as absent, not invalid", () => {
    for (const value of ["", "   ", "sk-ant-...", "CHANGE_ME"]) {
      const result = EnvSchema.safeParse({ ANTHROPIC_API_KEY: value });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.ANTHROPIC_API_KEY).toBeUndefined();
    }
  });

  it("rejects an unknown MODE", () => {
    expect(EnvSchema.safeParse({ MODE: "yolo" }).success).toBe(false);
  });
});

describe("the shipped templates", () => {
  it("profile.example.yaml is structurally valid but blocked by the placeholder gate", () => {
    // Structural validity means editing it can only surface real mistakes.
    // The placeholder gate is what stops a template reaching a real form.
    let thrown: unknown;
    try {
      loadProfile("config/profile.example.yaml");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    const err = thrown as ConfigError;
    expect(err.message).toContain("template values");
    expect(err.problems.some((p) => p.includes("identity.fullName"))).toBe(true);
  });

  it("search.example.yaml is structurally valid", () => {
    // Its only CHANGE_ME values are in optional lists, so it trips the
    // placeholder gate rather than a schema error.
    let thrown: unknown;
    try {
      loadSearchConfig("config/search.example.yaml");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    expect((thrown as ConfigError).message).toContain("template values");
  });

  it("gives copy-paste guidance when a config file is missing", () => {
    let thrown: unknown;
    try {
      loadProfile("config/does-not-exist.yaml");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    expect((thrown as ConfigError).message).toContain("cp config/profile.example.yaml");
  });
});
