/**
 * Text normalization shared by config validation, the derived match index, and
 * the prefilter. Everything that compares scraped text against profile values
 * must go through here, or "Node.js" and "NodeJS" become different skills.
 */

/** Tokens too common to carry signal in a job title. */
const TITLE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "or",
  "the",
  "to",
  "with",
  "job",
  "jobs",
  "opening",
  "openings",
  "hiring",
  "urgent",
  "immediate",
]);

/**
 * Collapse a technology or company name to a comparison key.
 *
 * Strips separators so `Node.js`, `node js`, `Node-JS` and `NODEJS` all
 * collapse to `nodejs`, while deliberately preserving `+` and `#` so `C++` and
 * `C#` stay distinct from `C`.
 */
export function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // strip combining accents
    .replace(/[^a-z0-9+#]/g, "");
}

/** Normalize free text for substring matching: lowercased, whitespace collapsed. */
export function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Split a title or description into comparable tokens. Keeps `+` and `#`
 * attached to their word so `c++` survives as one token.
 */
export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 0);
}

/** Tokenize a job title, dropping noise words that never affect a match. */
export function tokenizeTitle(input: string): string[] {
  return tokenize(input).filter((t) => !TITLE_STOPWORDS.has(t));
}

/**
 * Strip legal suffixes so `Acme Pvt Ltd`, `Acme Private Limited` and `Acme Inc.`
 * all collapse to `acme`. Company names are the dedupe hash's least stable
 * input, and postings are wildly inconsistent about these.
 */
const COMPANY_SUFFIXES = [
  "private limited",
  "pvt ltd",
  "pvt. ltd.",
  "pvt",
  "limited",
  "ltd",
  "llp",
  "llc",
  "inc",
  "incorporated",
  "corporation",
  "corp",
  "company",
  "co",
  "gmbh",
  "technologies",
  "technology",
  "solutions",
  "services",
  "software",
  "systems",
  "labs",
  "india",
];

export function normalizeCompany(input: string): string {
  let out = normalizeText(input).replace(/[.,]/g, "");
  // Repeat: "Acme Software Solutions Pvt Ltd" sheds one suffix per pass.
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of COMPANY_SUFFIXES) {
      if (out.endsWith(` ${suffix}`)) {
        out = out.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }
  return out.replace(/\s+/g, "");
}
