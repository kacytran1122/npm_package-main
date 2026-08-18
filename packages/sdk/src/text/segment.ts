import { resolveLocale } from "../locales/index.js";
import type { ClusterScript } from "./clusters.js";
import { graphemeBoundaries, orthographicBoundaries } from "./clusters.js";
import { clusterScriptFor, segmentationEngine } from "./engines.js";

/**
 * Thai, Lao, Khmer, Burmese, and Chinese write without spaces between words.
 *
 * That breaks three things at once: CSS cannot find a line-break opportunity,
 * so a paragraph overflows its container; String.slice cuts through a
 * grapheme cluster and produces a floating tone mark; and word counts are
 * meaningless.
 *
 * Everything here runs on the package's own segmentation stack rather than
 * `Intl.Segmenter`. The stack is a rule-based orthographic cluster layer with
 * a unigram Viterbi word search on top of it — see `clusters.ts` and
 * `engines.ts`. The reasons are in `docs/segmentation.md`; the short version is
 * that `Intl.Segmenter` does not exist on several runtimes this SDK targets,
 * its output moves with the host's ICU version so a server render and a client
 * render can disagree, and its grapheme boundaries orphan Thai leading vowels
 * and split Burmese syllable codas.
 */

/** True when the locale's script has no spaces between words. */
export function needsSegmentation(locale: string): boolean {
  return resolveLocale(locale)?.wordSpaced === false;
}

/**
 * Split text into words.
 *
 * words("ฉันรักภาษาไทย", "th")
 *   // ["ฉัน", "รัก", "ภาษา", "ไทย"]
 */
export function words(text: string, locale: string): string[] {
  const out: string[] = [];
  for (const span of segmentationEngine().segments(text, locale)) {
    if (span.wordLike) out.push(span.text);
  }
  return out;
}

/** Word count that is correct for Thai, Khmer, Lao, Burmese, and Chinese. */
export function wordCount(text: string, locale: string): number {
  return words(text, locale).length;
}

function boundariesFor(text: string, script: ClusterScript): number[] {
  return script === "Latn" ? graphemeBoundaries(text) : orthographicBoundaries(text, script);
}

/**
 * User-perceived characters, so emoji and stacked Khmer clusters stay intact.
 *
 * For Thai, Lao, Khmer, and Burmese these are orthographic clusters rather
 * than bare UAX #29 grapheme clusters, because the two disagree exactly where
 * it is visible: a Thai leading vowel is a letter, not a mark, so UAX #29 will
 * happily hand you `เ` on its own.
 */
export function graphemes(text: string, locale = "en"): string[] {
  const script = clusterScriptFor(locale);
  const bounds = boundariesFor(text, script);
  const out: string[] = [];
  for (let i = 0; i < bounds.length - 1; i++) out.push(text.slice(bounds[i], bounds[i + 1]));
  return out;
}

export function graphemeLength(text: string, locale = "en"): number {
  const script = clusterScriptFor(locale);
  return boundariesFor(text, script).length - 1;
}

/**
 * Truncate without splitting a cluster or a word.
 *
 * truncate("ฉันรักภาษาไทยมาก", "th", 8) // "ฉันรักภา…"
 */
export function truncate(
  text: string,
  locale: string,
  maxGraphemes: number,
  ellipsis = "…",
): string {
  const script = clusterScriptFor(locale);
  const bounds = boundariesFor(text, script);
  const clusters = bounds.length - 1;
  if (clusters <= maxGraphemes) return text;

  // The ellipsis occupies cells of its own, and callers do pass "..." — three
  // of them — so it has to be measured rather than assumed to be one.
  const ellipsisWidth = boundariesFor(ellipsis, script).length - 1;
  const budget = Math.max(1, maxGraphemes - ellipsisWidth);
  const hardLimit = bounds[Math.min(budget, clusters)];

  // Back off to the last word boundary at or before the limit, so we do not
  // cut mid-syllable. If the first word alone overruns the budget there is no
  // boundary to retreat to and the cluster cut stands, which is still safe.
  let cut = 0;
  for (const span of segmentationEngine().segments(text, locale)) {
    if (span.end > hardLimit) break;
    cut = span.end;
  }
  if (cut === 0) cut = hardLimit;

  const kept = text.slice(0, cut).replace(/\s+$/, "");
  return (kept.length > 0 ? kept : text.slice(0, hardLimit)) + ellipsis;
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
  if (text.length === 0) return text;

  const offsets = segmentationEngine().breaks(text, locale);
  if (offsets.length === 0) return text;

  let out = "";
  let cursor = 0;
  for (const at of offsets) {
    if (at <= cursor || at >= text.length) continue;
    // A break next to whitespace already exists; a zero-width space there is
    // dead weight and shows up in copy-paste diffs.
    if (isSpace(text.charCodeAt(at - 1)) || isSpace(text.charCodeAt(at))) continue;
    out += text.slice(cursor, at) + ZWSP;
    cursor = at;
  }
  return out + text.slice(cursor);
}

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0x200b;
}

/** Remove any zero-width spaces, e.g. before saving user input. */
export function stripLineBreakOpportunities(text: string): string {
  return text.replace(/\u200B/g, "");
}

/**
 * Sentence terminators.
 *
 * Thai and Lao punctuate a sentence end with a space rather than a mark, which
 * is tempting to split on and wrong to split on: the same space separates a
 * number from its unit and a clause from its continuation, so "ราคา 1,500 บาท"
 * would come back as three sentences. Without a terminator those two languages
 * need a parser rather than a rule, so a run with no terminator stays one
 * sentence. ICU reaches the same conclusion.
 */
const TERMINATORS = new Set([
  0x002e, // .
  0x0021, // !
  0x003f, // ?
  0x2026, // …
  0x17d4, // ។ khmer khan
  0x17d5, // ៕ khmer bariyoosan
  0x104a, // ၊ myanmar little section
  0x104b, // ။ myanmar section
  0x3002, // 。
  0xff01, // ！
  0xff1f, // ？
]);

const CLOSERS = new Set([0x0022, 0x0027, 0x2019, 0x201d, 0x0029, 0x005d, 0x007d, 0x00bb]);

/**
 * Split text into sentences.
 *
 * Rule-based rather than dictionary-based: a terminator ends a sentence unless
 * it sits between digits, so "1.500" and "v1.2" survive.
 *
 * `locale` is accepted and currently unused. The terminator set is script-wide
 * rather than language-specific, and the two languages that would need
 * language-specific handling — Thai and Lao, which end sentences with a bare
 * space — cannot be served by a rule at all. Keeping the parameter means
 * adding that handling later is not a breaking change.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function sentences(text: string, locale = "en"): string[] {
  void locale;
  if (text.length === 0) return [];

  const out: string[] = [];
  let start = 0;
  let i = 0;

  while (i < text.length) {
    const code = text.charCodeAt(i);

    if (TERMINATORS.has(code)) {
      // A dot between digits is a decimal separator, not a full stop.
      if (
        code === 0x002e &&
        isDigit(text.charCodeAt(i - 1)) &&
        isDigit(text.charCodeAt(i + 1))
      ) {
        i++;
        continue;
      }
      let end = i + 1;
      while (end < text.length && TERMINATORS.has(text.charCodeAt(end))) end++;
      while (end < text.length && CLOSERS.has(text.charCodeAt(end))) end++;
      while (end < text.length && isSpace(text.charCodeAt(end))) end++;
      out.push(text.slice(start, end));
      start = end;
      i = end;
      continue;
    }

    i++;
  }

  if (start < text.length) out.push(text.slice(start));
  return out;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

export { clusterScriptFor, setSegmentationEngine, segmentationEngine } from "./engines.js";
export type { SegmentationEngine, Span } from "./engines.js";
export { orthographicEngine, lexicalEngine } from "./engines.js";
export { graphemeClusters, orthographicClusters, orthographicBoundaries } from "./clusters.js";
export type { ClusterScript } from "./clusters.js";
export { registerWords, lexiconSize } from "./lexicon.js";
