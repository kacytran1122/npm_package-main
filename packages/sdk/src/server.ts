/**
 * Server-safe entry point. No React, no DOM, no browser globals, so it is safe
 * inside React Server Components, middleware, and edge runtimes.
 */

export {
  negotiateLocale,
  parseAcceptLanguage,
  resolveLocale,
  getLocale,
  fallbackChain,
  LOCALES,
  LOCALE_CODES,
  COUNTRIES,
  getCountry,
  localesForCountry,
} from "./locales/index.js";

export { createI18n, coverage, flatten } from "./core.js";
export { formatNumber, formatCurrency, formatCompact, formatPercent, parseNumber } from "./format/number.js";
export { formatDate, formatDateForCountry, formatRelativeTime, toBuddhistYear, fromBuddhistYear } from "./format/date.js";
export { toNativeDigits, toLatinDigits } from "./format/digits.js";
export { formatCount, classifierFor, usesClassifiers } from "./classifier.js";
export { pronoun, politeParticle, withPoliteness } from "./register.js";
export { detectMyanmarEncoding, zawgyiToUnicode, normalizeMyanmar } from "./script/zawgyi.js";
export { foldVietnamese, normalizeVietnamese, slugifyVietnamese } from "./script/vietnamese.js";
export { toSearchKey } from "./text/search.js";
export { insertLineBreakOpportunities, words, wordCount, truncate } from "./text/segment.js";
export { fontLinkHref, fontFaceCss, fontStackFor } from "./fonts.js";
export { lintBundle, lintBundles } from "./lint.js";
export * from "./names.js";
export * from "./types.js";

import { negotiateLocale, parseAcceptLanguage, getLocale, localesForCountry } from "./locales/index.js";

/**
 * Resolve a locale from a request, in the order most apps want it: an explicit
 * cookie, then the country the request came from, then Accept-Language.
 *
 * Country beats Accept-Language on purpose. A phone bought in Cambodia often
 * reports en-US while its owner reads Khmer.
 */
export function localeFromRequest(input: {
  cookie?: string | null;
  /** Two-letter country from your CDN, e.g. Cloudflare's cf-ipcountry. */
  country?: string | null;
  acceptLanguage?: string | null;
  available?: string[];
  fallback?: string;
}): string {
  const { cookie, country, acceptLanguage, available, fallback = "en" } = input;

  if (cookie) {
    try {
      return getLocale(cookie).code;
    } catch {
      // Fall through to the next signal.
    }
  }

  const requested: string[] = [];
  if (country) requested.push(...localesForCountry(country));
  if (acceptLanguage) requested.push(...parseAcceptLanguage(acceptLanguage));

  return negotiateLocale(requested, available, fallback);
}

/** Attributes for the <html> element. */
export function htmlAttributes(locale: string): { lang: string; dir: "ltr" | "rtl" } {
  const def = getLocale(locale);
  return { lang: def.code, dir: def.dir };
}
