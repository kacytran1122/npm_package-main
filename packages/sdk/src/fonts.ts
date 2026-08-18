import { getLocale, resolveLocale } from "./locales/index.js";

/**
 * The default system font on most devices has no glyphs for Khmer, Burmese,
 * Lao, or Javanese, and clips Thai and Vietnamese diacritics at normal line
 * heights. Shipping a script-appropriate font is not a polish item here, it is
 * the difference between readable text and rows of empty boxes.
 */

/** CSS font-family stack for a locale. */
export function fontStackFor(locale: string): string {
  return getLocale(locale).font.family;
}

/**
 * Google Fonts URL for one or more locales, deduplicated.
 *
 * fontLinkHref(["th", "km"])
 *   // "https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;700&..."
 */
export function fontLinkHref(locales: string[], display: "swap" | "block" = "swap"): string {
  const families = new Map<string, Set<number>>();

  for (const tag of locales) {
    const def = resolveLocale(tag);
    if (!def?.font.googleFont) continue;
    const weights = families.get(def.font.googleFont) ?? new Set<number>();
    for (const w of def.font.weights) weights.add(w);
    families.set(def.font.googleFont, weights);
  }

  const params = [...families.entries()].map(([family, weights]) => {
    const list = [...weights].sort((a, b) => a - b).join(";");
    return `family=${family.replace(/ /g, "+")}:wght@${list}`;
  });

  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=${display}`;
}

/**
 * CSS that sets the font stack and a script-appropriate line height, keyed by
 * the lang attribute. Khmer and Burmese need roughly 1.95 to avoid clipping
 * stacked marks; the browser default of about 1.2 cuts them off.
 */
export function fontFaceCss(locales: string[]): string {
  return locales
    .map((tag) => {
      const def = resolveLocale(tag);
      if (!def) return "";
      return [
        `:lang(${def.code}), [lang="${def.code}"] {`,
        `  font-family: ${def.font.family};`,
        `  line-height: ${def.font.lineHeight};`,
        def.dir === "rtl" ? `  direction: rtl;` : "",
        def.wordSpaced === false ? `  word-break: auto-phrase;\n  line-break: normal;` : "",
        `}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}
