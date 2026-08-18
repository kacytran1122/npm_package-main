import type { LocaleDef } from "../types.js";
import { LOCALES, LOCALE_CODES } from "./data.js";

export { LOCALES, LOCALE_CODES };
export * from "./countries.js";

/** Lower-cased lookup so "VI-vn" and "vi-VN" both resolve. */
const INDEX = new Map<string, string>();
for (const code of LOCALE_CODES) INDEX.set(code.toLowerCase(), code);

/**
 * Resolve a user-supplied tag to a registered locale.
 * Falls back by stripping subtags: "vi-VN-u-ca-gregory" -> "vi-VN" -> "vi".
 */
export function resolveLocale(tag: string): LocaleDef | undefined {
  if (!tag) return undefined;
  if (typeof tag !== "string") {
    // Most functions here take (value, locale, options). Passing the options
    // object in the locale slot is the easiest mistake to make, so say so
    // rather than dying inside a string method.
    throw new TypeError(
      `selakata: expected a locale string, received ${typeof tag}. ` +
        `Check the argument order, most helpers are (value, locale, options).`,
    );
  }
  const wanted = tag.trim().toLowerCase().replace(/_/g, "-");
  const exact = INDEX.get(wanted);
  if (exact) return LOCALES[exact];

  const parts = wanted.split("-");
  for (let i = parts.length - 1; i > 0; i--) {
    const hit = INDEX.get(parts.slice(0, i).join("-"));
    if (hit) return LOCALES[hit];
  }
  return undefined;
}

export function getLocale(tag: string): LocaleDef {
  const found = resolveLocale(tag);
  if (!found) throw new Error(`selakata: unknown locale "${tag}"`);
  return found;
}

export function isSupported(tag: string): boolean {
  return resolveLocale(tag) !== undefined;
}

/**
 * Pick the best available locale for a user, honouring fallback chains.
 * Pass navigator.languages or the Accept-Language header, already split.
 */
export function negotiateLocale(
  requested: readonly string[],
  available: readonly string[] = LOCALE_CODES,
  fallback = "en",
): string {
  const pool = new Set(available);
  for (const tag of requested) {
    const def = resolveLocale(tag);
    if (!def) continue;
    if (pool.has(def.code)) return def.code;
    for (const next of def.fallback) {
      if (pool.has(next)) return next;
    }
  }
  return fallback;
}

/** Parse an Accept-Language header into tags ordered by quality. */
export function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim(), q: q ? Number.parseFloat(q.split("=")[1]) : 1 };
    })
    .filter((e) => e.tag && !Number.isNaN(e.q))
    .sort((a, b) => b.q - a.q)
    .map((e) => e.tag);
}

/** Full fallback chain for a locale, always ending at "en". */
export function fallbackChain(tag: string): string[] {
  const def = resolveLocale(tag);
  if (!def) return ["en"];
  return def.fallback.includes("en") ? def.fallback : [...def.fallback, "en"];
}

export function localesForScript(script: string): LocaleDef[] {
  return LOCALE_CODES.map((c) => LOCALES[c]).filter((l) => l.script === script);
}

/** Locales whose script does not put spaces between words. */
export function unspacedLocales(): LocaleDef[] {
  return LOCALE_CODES.map((c) => LOCALES[c]).filter((l) => !l.wordSpaced);
}
