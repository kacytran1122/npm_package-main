import type { PluralCategory } from "./types.js";
import { resolveLocale } from "./locales/index.js";

const cache = new Map<string, Intl.PluralRules>();

function rules(locale: string, type: Intl.PluralRuleType): Intl.PluralRules {
  const key = `${locale}:${type}`;
  let r = cache.get(key);
  if (!r) {
    r = new Intl.PluralRules(locale, { type });
    cache.set(key, r);
  }
  return r;
}

/**
 * CLDR plural category for a count.
 *
 * Vietnamese, Thai, Khmer, Lao, Burmese, Indonesian, Malay, and Chinese have no
 * grammatical number at all: every count returns "other". Filipino and Tamil do
 * distinguish one from other. Writing `count === 1 ? a : b` in your app is the
 * bug this replaces.
 */
export function pluralCategory(
  count: number,
  locale: string,
  type: Intl.PluralRuleType = "cardinal",
): PluralCategory {
  const def = resolveLocale(locale);
  return rules(def?.intlLocale ?? locale, type).select(count) as PluralCategory;
}

/** Every category a locale can produce. */
export function pluralCategories(
  locale: string,
  type: Intl.PluralRuleType = "cardinal",
): PluralCategory[] {
  const def = resolveLocale(locale);
  return rules(def?.intlLocale ?? locale, type).resolvedOptions()
    .pluralCategories as PluralCategory[];
}

/** True when the language marks number grammatically. False for most of the region. */
export function hasGrammaticalNumber(locale: string): boolean {
  return pluralCategories(locale).length > 1;
}

export type PluralForms = Partial<Record<PluralCategory, string>>;

/**
 * Pick a form for a count, falling back to "other".
 *
 * selectPlural(5, "vi", { other: "{n} sản phẩm" })  // "5 sản phẩm"
 * selectPlural(1, "fil", { one: "{n} aklat", other: "{n} na aklat" })
 */
export function selectPlural(count: number, locale: string, forms: PluralForms): string {
  const category = pluralCategory(count, locale);
  const template = forms[category] ?? forms.other ?? "";
  return template.replace(/\{n\}/g, String(count));
}
