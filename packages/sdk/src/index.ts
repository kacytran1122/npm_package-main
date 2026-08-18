/**
 * selakata: internationalization built for Southeast Asia.
 *
 * Covers 12 countries and 29 locales, including the things generic i18n
 * libraries leave to the application: numeral classifiers, politeness that
 * varies with the speaker's gender, Buddhist Era dates, Zawgyi detection,
 * line breaking for unspaced scripts, and names without surnames.
 */

export * from "./types.js";
export * from "./locales/index.js";
export * from "./core.js";
export * from "./plural.js";
export * from "./classifier.js";
export * from "./register.js";
export * from "./names.js";

export * from "./format/digits.js";
export * from "./format/number.js";
export * from "./format/date.js";

export * from "./script/zawgyi.js";
export * from "./script/vietnamese.js";
export * from "./script/jawi.js";

export * from "./text/segment.js";
export * from "./text/search.js";

export { lintBundle, lintBundles, type LintIssue } from "./lint.js";
export * from "./readiness.js";
export { fontLinkHref, fontFaceCss, fontStackFor } from "./fonts.js";

export const VERSION = "0.1.0";

/** ISO codes for the countries this package covers. */
export const REGION = [
  "BN",
  "KH",
  "ID",
  "LA",
  "MY",
  "MM",
  "PH",
  "SG",
  "TH",
  "TL",
  "VN",
  "PG",
] as const;
