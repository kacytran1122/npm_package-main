/**
 * Release readiness scoring.
 *
 * Percent-translated is the metric every i18n tool reports, and it is the one
 * that lies. A locale sitting at 100% can still be unshippable: every string
 * machine-drafted and unreviewed, every Thai key stuck in the neutral register
 * so the formal screens read as blunt, half the Burmese in Zawgyi. The number
 * says done. The build says otherwise.
 *
 * So readiness here is a weighted composite of four facets that fail
 * independently:
 *
 *   translated      the keys exist at all                        (35%)
 *   registerDepth   they exist at every politeness level the      (25%)
 *                   language actually distinguishes
 *   lintClean       they survive the regional linter              (25%)
 *   reviewed        a human signed off, not just the model        (15%)
 *
 * Weights are deliberate. Coverage still leads, because a missing string is
 * the worst failure and the most visible. Register depth and lint cleanliness
 * are weighted equally behind it and together outweigh coverage, because in
 * this region they are where the real defects hide. Review is smallest, not
 * because it matters least, but because it is the facet that recovers fastest
 * once someone sits down with the queue.
 *
 * Everything here is pure arithmetic over counts. Nothing reads the network,
 * a database, or the clock, so the same project always scores the same.
 */

import { flatten, type Bundle } from "./core.js";
import { lintBundle, type LintIssue } from "./lint.js";
import { resolveLocale } from "./locales/index.js";
import type { Register } from "./types.js";

export type FacetId = "translated" | "registerDepth" | "lintClean" | "reviewed";

export type ReadinessGrade = "A" | "B" | "C" | "D" | "F";

/**
 * Weights sum to 1. Exported so a dashboard can render the breakdown without
 * hardcoding a second copy that drifts.
 */
export const FACET_WEIGHTS: Readonly<Record<FacetId, number>> = Object.freeze({
  translated: 0.35,
  registerDepth: 0.25,
  lintClean: 0.25,
  reviewed: 0.15,
});

export const FACET_LABELS: Readonly<Record<FacetId, string>> = Object.freeze({
  translated: "Translated",
  registerDepth: "Register depth",
  lintClean: "Lint clean",
  reviewed: "Human reviewed",
});

/**
 * A warning is worth 0.4 of an error. Warnings in this linter are real
 * regional defects, not style nits, so they cannot be free; but a hardcoded
 * Thai particle should not sink a locale the way Zawgyi text does.
 */
const WARNING_WEIGHT = 0.4;

/**
 * Lint rules the lint facet ignores, because another facet already counts
 * them and charging twice for one defect distorts the score.
 *
 * `missing-key` and `untranslated` are coverage findings wearing a linter's
 * hat: the `translated` facet has already docked those points. Left in, a
 * half-translated locale is charged once for the gap and again for every
 * missing key the linter reports -- and when the caller lints each register
 * separately, three times over, flooring the facet at zero on a project whose
 * real quality problem is simply that nobody has finished it yet.
 */
export const COVERAGE_RULES: ReadonlySet<string> = new Set(["missing-key", "untranslated"]);

/** Score >= threshold earns the grade. Checked top down. */
const GRADE_BANDS: ReadonlyArray<readonly [ReadinessGrade, number]> = [
  ["A", 90],
  ["B", 75],
  ["C", 60],
  ["D", 40],
  ["F", 0],
];

export interface FacetScore {
  id: FacetId;
  label: string;
  /** 0..1. */
  score: number;
  /** 0..1, from FACET_WEIGHTS. */
  weight: number;
  /** Points this facet puts on the board, 0..100. */
  contribution: number;
  /** Points this facet costs, 0..100. `weight * 100 - contribution`. */
  deficit: number;
  /** Human-readable reason, e.g. "12 of 40 keys missing". */
  detail: string;
}

/** Raw counts a caller supplies. Everything else is derived. */
export interface ReadinessCounts {
  locale: string;
  /** Keys in the project, from the source locale. */
  totalKeys: number;
  /** Keys with at least one value in this locale. */
  translatedKeys: number;
  /**
   * Filled (key x register) slots. A key carrying formal and casual Thai
   * counts twice. Defaults to `translatedKeys` when a caller has no register
   * data, which scores as one register per key.
   */
  filledRegisterSlots?: number;
  /**
   * Registers this locale is expected to carry. Defaults to the locale
   * definition's own list, so Javanese is held to all three of
   * ngoko/madya/krama while bahasa gaul, which has no formal register at
   * all, is held only to neutral and casual and is not penalised for it.
   */
  expectedRegisters?: Register[];
  /**
   * Lint issues for this locale. Only `severity` and `rule` are read, and
   * rules in `COVERAGE_RULES` are dropped rather than charged twice.
   */
  issues?: (Pick<LintIssue, "severity"> & Partial<Pick<LintIssue, "rule">>)[];
  /** Translated keys still carrying an unapproved machine draft. */
  draftKeys?: number;
}

export interface LocaleReadiness {
  locale: string;
  /** 0..100, rounded. */
  score: number;
  grade: ReadinessGrade;
  facets: FacetScore[];
  /**
   * The facet costing the most points, or null at a perfect score. This is
   * the one thing to fix next, which is the only thing most people want from
   * a metric.
   */
  topDrag: FacetScore | null;
  counts: {
    totalKeys: number;
    translatedKeys: number;
    draftKeys: number;
    registerSlots: { expected: number; filled: number };
    issues: { errors: number; warnings: number };
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** x/y, with an empty project scoring 0 rather than NaN or a hollow 100. */
function ratio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : clamp01(numerator / denominator);
}

export function gradeFor(score: number): ReadinessGrade {
  for (const [grade, min] of GRADE_BANDS) {
    if (score >= min) return grade;
  }
  return "F";
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Score one locale from raw counts.
 *
 * Deliberately takes numbers rather than the project's own record types, so
 * the server, the CLI, and a CI script can all reach the same figure without
 * agreeing on a schema first.
 */
export function scoreReadiness(counts: ReadinessCounts): LocaleReadiness {
  const def = resolveLocale(counts.locale);

  const totalKeys = Math.max(0, counts.totalKeys);
  const translatedKeys = Math.min(Math.max(0, counts.translatedKeys), totalKeys);
  const draftKeys = Math.min(Math.max(0, counts.draftKeys ?? 0), translatedKeys);

  const registers = counts.expectedRegisters ?? def?.registers ?? ["neutral"];
  const expectedSlots = totalKeys * Math.max(1, registers.length);
  const filledSlots = Math.min(
    Math.max(0, counts.filledRegisterSlots ?? translatedKeys),
    expectedSlots,
  );

  const issues = (counts.issues ?? []).filter(
    (i) => i.rule === undefined || !COVERAGE_RULES.has(i.rule),
  );
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;

  // Issue density per *translated* key, so a 20-key project and a 2000-key
  // project are held to the same standard, and a locale is judged on the
  // strings it actually has. Dividing by totalKeys instead would flatter a
  // barely-started locale: two broken strings out of four written would read
  // as 98% clean against a 100-key project rather than the 50% it is.
  const weightedIssues = errors + warnings * WARNING_WEIGHT;
  const density = translatedKeys <= 0 ? 0 : weightedIssues / translatedKeys;

  const raw: Record<FacetId, { score: number; detail: string }> = {
    translated: {
      score: ratio(translatedKeys, totalKeys),
      detail:
        totalKeys === 0
          ? "No keys in this project yet."
          : translatedKeys >= totalKeys
            ? `All ${plural(totalKeys, "key")} translated.`
            : `${plural(totalKeys - translatedKeys, "key")} still untranslated.`,
    },
    registerDepth: {
      score: ratio(filledSlots, expectedSlots),
      detail:
        registers.length <= 1
          ? `${def?.name ?? counts.locale} distinguishes one register, so depth tracks coverage.`
          : filledSlots >= expectedSlots
            ? `Every key carries all ${registers.length} registers (${registers.join(", ")}).`
            : `${plural(expectedSlots - filledSlots, "register slot")} empty across ${registers.join(", ")}.`,
    },
    lintClean: {
      // A locale with nothing in it is not lint-clean, it is unexamined.
      // Scoring it 1 would hand an untouched locale a free 25 points while
      // every other facet correctly reported 0.
      score: translatedKeys === 0 ? 0 : clamp01(1 - density),
      detail:
        translatedKeys === 0
          ? "Nothing translated to lint yet."
          : issues.length === 0
            ? "No regional lint issues."
            : `${plural(errors, "error")} and ${plural(warnings, "warning")}` +
              ` across ${plural(translatedKeys, "translated key")}.`,
    },
    reviewed: {
      score: ratio(translatedKeys - draftKeys, translatedKeys),
      detail:
        translatedKeys === 0
          ? "Nothing translated to review."
          : draftKeys === 0
            ? "Every translation is human-approved."
            : `${plural(draftKeys, "key")} still on an unreviewed machine draft.`,
    },
  };

  const facets: FacetScore[] = (Object.keys(FACET_WEIGHTS) as FacetId[]).map((id) => {
    const weight = FACET_WEIGHTS[id];
    const score = clamp01(raw[id].score);
    const contribution = score * weight * 100;
    return {
      id,
      label: FACET_LABELS[id],
      score,
      weight,
      contribution: round2(contribution),
      deficit: round2(weight * 100 - contribution),
      detail: raw[id].detail,
    };
  });

  const score = Math.round(facets.reduce((sum, f) => sum + f.contribution, 0));

  // Ties break toward the earlier facet, which is the heavier one, so the
  // advice stays stable rather than flipping between equal deficits.
  let topDrag: FacetScore | null = null;
  for (const facet of facets) {
    if (facet.deficit > 0 && (!topDrag || facet.deficit > topDrag.deficit)) topDrag = facet;
  }

  return {
    locale: counts.locale,
    score,
    grade: gradeFor(score),
    facets,
    topDrag,
    counts: {
      totalKeys,
      translatedKeys,
      draftKeys,
      registerSlots: { expected: expectedSlots, filled: filledSlots },
      issues: { errors, warnings },
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ProjectReadiness {
  /** Mean of the per-locale scores, rounded. */
  score: number;
  grade: ReadinessGrade;
  /** Worst first, so the top of the list is the work queue. */
  locales: LocaleReadiness[];
  /** Locales below `releaseThreshold`. */
  blocking: string[];
  releaseThreshold: number;
}

/**
 * Roll per-locale scores into one project figure.
 *
 * A plain mean, not a key-weighted one: every locale is measured against the
 * same key set, and weighting by speaker population would quietly tell you the
 * Burmese build is fine because the Indonesian one is.
 */
export function projectReadiness(
  locales: LocaleReadiness[],
  releaseThreshold = 75,
): ProjectReadiness {
  const sorted = [...locales].sort((a, b) => a.score - b.score || a.locale.localeCompare(b.locale));
  const score =
    sorted.length === 0
      ? 0
      : Math.round(sorted.reduce((sum, l) => sum + l.score, 0) / sorted.length);

  return {
    score,
    grade: gradeFor(score),
    locales: sorted,
    blocking: sorted.filter((l) => l.score < releaseThreshold).map((l) => l.locale),
    releaseThreshold,
  };
}

/**
 * Score a set of JSON bundles, for the CLI and for CI.
 *
 * Register depth is read off the bundles themselves: a message stored as
 * `{ formal, casual }` counts its variants, a bare string counts as one.
 * Bundles carry no review state, so `reviewed` scores as fully approved --
 * a file on disk has no machine drafts pending sign-off.
 */
export function readinessFromBundles(
  bundles: Record<string, Bundle>,
  reference = "en",
  releaseThreshold = 75,
): ProjectReadiness {
  const ref = bundles[reference] ?? {};
  const keys = flatten(ref);

  const scored = Object.keys(bundles)
    .filter((locale) => locale !== reference)
    .map((locale) => {
      const bundle = bundles[locale];
      const def = resolveLocale(locale);
      const registers = def?.registers ?? ["neutral"];

      let translatedKeys = 0;
      let filledRegisterSlots = 0;
      for (const key of keys) {
        const variants = registerVariantsAt(bundle, key, registers);
        if (variants > 0) translatedKeys++;
        filledRegisterSlots += variants;
      }

      return scoreReadiness({
        locale,
        totalKeys: keys.length,
        translatedKeys,
        filledRegisterSlots,
        expectedRegisters: registers,
        issues: lintBundle(locale, bundle, ref),
        draftKeys: 0,
      });
    });

  return projectReadiness(scored, releaseThreshold);
}

/**
 * How many of `registers` the message at `key` actually supplies.
 *
 * A plain string satisfies one register, not all of them: a single Javanese
 * string is doing ngoko's job and leaving krama unwritten, and the score
 * should say so.
 */
function registerVariantsAt(
  bundle: Bundle | undefined,
  key: string,
  registers: Register[],
): number {
  const node = descend(bundle, key);
  if (node === undefined) return 0;
  if (typeof node === "string") return node.trim() === "" ? 0 : 1;
  if (typeof node !== "object" || node === null) return 0;

  const present = registers.filter((r) => {
    const value = (node as Record<string, unknown>)[r];
    return typeof value === "string" ? value.trim() !== "" : value !== undefined;
  }).length;

  // Plural-keyed messages ({ one, other }) carry no register split, so they
  // count as the one register they are written in.
  return present === 0 ? 1 : present;
}

/** Walk a dotted key through a bundle, tolerating flat and nested storage. */
function descend(bundle: Bundle | undefined, key: string): unknown {
  if (!bundle) return undefined;
  if (Object.prototype.hasOwnProperty.call(bundle, key)) return bundle[key];

  let node: unknown = bundle;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
    if (node === undefined) return undefined;
  }
  return node;
}
