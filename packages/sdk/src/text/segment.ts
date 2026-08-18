import { resolveLocale } from "../locales/index.js";

/**
 * Thai, Lao, Khmer, Burmese, and Chinese write without spaces between words.
 *
 * That breaks three things at once: CSS cannot find a line-break opportunity,
 * so a paragraph overflows its container; String.slice cuts through a
 * grapheme cluster and produces a floating tone mark; and word counts are
 * meaningless. Everything here routes through Intl.Segmenter, which ships with
 * dictionary data for these scripts in every current runtime.
 */

/** True when the locale's script has no spaces between words. */
export function needsSegmentation(locale: string): boolean {
  return resolveLocale(locale)?.wordSpaced === false;
}

const segmenters = new Map<string, Intl.Segmenter>();

function segmenter(locale: string, granularity: "word" | "grapheme" | "sentence") {
  const key = `${locale}:${granularity}`;
  let s = segmenters.get(key);
  if (!s) {
    s = new Intl.Segmenter(locale, { granularity });
    segmenters.set(key, s);
  }
  return s;
}

/**
 * Split text into words.
 *
 * words("ฉันรักภาษาไทย", "th")
 *   // ["ฉัน", "รัก", "ภาษา", "ไทย"]
 */
export function words(text: string, locale: string): string[] {
  const def = resolveLocale(locale);
  const seg = segmenter(def?.intlLocale ?? locale, "word");
  const out: string[] = [];
  for (const part of seg.segment(text)) {
    if (part.isWordLike) out.push(part.segment);
  }
  return out;
}

/** Word count that is correct for Thai, Khmer, Lao, Burmese, and Chinese. */
export function wordCount(text: string, locale: string): number {
  return words(text, locale).length;
}

/** User-perceived characters, so emoji and stacked Khmer clusters stay intact. */
export function graphemes(text: string, locale = "en"): string[] {
  const def = resolveLocale(locale);
  return [...segmenter(def?.intlLocale ?? locale, "grapheme").segment(text)].map(
    (p) => p.segment,
  );
}

export function graphemeLength(text: string, locale = "en"): number {
  return graphemes(text, locale).length;
}

/**
 * Truncate without splitting a grapheme cluster or a word.
 *
 * truncate("ฉันรักภาษาไทยมาก", "th", 8) // "ฉันรัก…"
 */
export function truncate(
  text: string,
  locale: string,
  maxGraphemes: number,
  ellipsis = "…",
): string {
  const gs = graphemes(text, locale);
  if (gs.length <= maxGraphemes) return text;

  const budget = Math.max(1, maxGraphemes - 1);
  const rough = gs.slice(0, budget).join("");

  // Back off to the last whole word so we do not cut mid-syllable.
  const ws = words(rough, locale);
  if (ws.length > 1) {
    const last = rough.lastIndexOf(ws[ws.length - 1]);
    const cut = rough.slice(0, last).replace(/\s+$/, "");
    if (cut.length > 0) return cut + ellipsis;
  }
  return rough + ellipsis;
}

/** Zero-width space, the character browsers treat as a line-break opportunity. */
export const ZWSP = "\u200B";

/**
 * Insert zero-width spaces at word boundaries so the browser can wrap Thai,
 * Lao, Khmer, and Burmese paragraphs. Invisible, copy-paste safe, and the
 * standard fix for text overflowing a fixed-width container.
 *
 * Prefer CSS `word-break: auto-phrase` where you can. This exists for the many
 * places you cannot, such as SVG text, canvas, and PDF generation.
 */
export function insertLineBreakOpportunities(text: string, locale: string): string {
  if (!needsSegmentation(locale)) return text;
  const def = resolveLocale(locale);
  const seg = segmenter(def?.intlLocale ?? locale, "word");
  const parts = [...seg.segment(text)].map((p) => p.segment);
  return parts.join(ZWSP).replace(new RegExp(`${ZWSP}(\\s)`, "g"), "$1");
}

/** Remove any zero-width spaces, e.g. before saving user input. */
export function stripLineBreakOpportunities(text: string): string {
  return text.replace(/\u200B/g, "");
}

export function sentences(text: string, locale: string): string[] {
  const def = resolveLocale(locale);
  return [...segmenter(def?.intlLocale ?? locale, "sentence").segment(text)].map(
    (p) => p.segment,
  );
}
