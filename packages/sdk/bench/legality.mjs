/**
 * An independent judge of whether a break offset is orthographically legal.
 *
 * Deliberately written from the Unicode character properties rather than from
 * `src/text/clusters.ts`. If the checker shared code with the thing it checks,
 * a bug in the cluster rules would score as a perfect result, which is the
 * classic way a self-evaluation lies. The two implementations agree only if
 * they are both right.
 */

const MARK = /\p{M}/u;

const THAI_LEAD = /[เ-ไ]/u;
const THAI_TRAIL = /[ะาำๅๆ]/u;
const LAO_LEAD = /[ເ-ໄ]/u;
const LAO_TRAIL = /[ະາຳໆ]/u;

const KHMER_COENG = "្";
const MYANMAR_VIRAMA = "္";
const MYANMAR_ASAT = "်";
const MYANMAR_MEDIAL = /[ျ-ှ]/u;
const MYANMAR_CONSONANT = /[က-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎ]/u;

/**
 * Punctuation that attaches to the text on its left. UAX #14 classes these
 * break-after, so a line may never begin with one.
 */
const ATTACHES_LEFT = new Set([
  "\u17D4", // ។ khmer khan
  "\u17D5", // ៕ khmer bariyoosan
  "\u17D6", // ៖ khmer camnuc pii kuuh
  "\u104A", // ၊ myanmar little section
  "\u104B", // ။ myanmar section
  "\u104F", // ၏ myanmar genitive
  "\u0E2F", // ฯ thai paiyannoi
  "\u0E46", // ๆ thai maiyamok
  "\u0E5A", // ๚ thai angkhankhu
  "\u0E5B", // ๛ thai khomut
  "\u0EC6", // ໆ lao ko la
  "\u3001", // 、
  "\u3002", // 。
  "\uFF0C", // ，
  "\uFF01", // ！
  "\uFF1F", // ？
  "\uFF1A", // ：
  "\uFF1B", // ；
]);

/**
 * Reasons cutting `text` at `at` would render wrong. Empty means legal.
 * `at` is a UTF-16 offset and must satisfy 0 < at < text.length.
 *
 * `kind` distinguishes the two cuts this package makes, because they are not
 * subject to the same rules:
 *
 *   "break"  a line break — the text after `at` moves to the next line, so
 *            what may *start* a line matters.
 *   "cut"    a truncation — the text after `at` is discarded, so only the
 *            integrity of what remains matters.
 *
 * Every cluster rule applies to both. The punctuation rule applies only to
 * breaks: ending a truncated label just before a full stop is fine, starting
 * a wrapped line with one is not.
 */
export function illegalBreakReasons(text, at, kind = "break") {
  const reasons = [];
  if (at <= 0 || at >= text.length) return reasons;

  const before = text[at - 1];
  const here = text[at];

  // Universal: a combining mark never starts a line.
  if (MARK.test(here)) reasons.push("break-before-combining-mark");

  // Break-after punctuation may not begin a line.
  if (kind === "break" && ATTACHES_LEFT.has(here)) {
    reasons.push("line-starts-with-punctuation");
  }

  // Universal: never split a surrogate pair.
  const lead = text.charCodeAt(at - 1);
  if (lead >= 0xd800 && lead <= 0xdbff) reasons.push("break-inside-surrogate-pair");

  // Thai and Lao: a leading vowel is written before the consonant it follows.
  if (THAI_LEAD.test(before) || LAO_LEAD.test(before)) {
    reasons.push("orphaned-leading-vowel");
  }
  // Thai and Lao: these letters are pronounced after the preceding consonant.
  if (THAI_TRAIL.test(here) || LAO_TRAIL.test(here)) {
    reasons.push("orphaned-trailing-vowel");
  }

  // Khmer: coeng subjoins the next consonant under the base.
  if (before === KHMER_COENG || here === KHMER_COENG) {
    reasons.push("split-khmer-coeng-stack");
  }

  // Burmese: virama stacks, asat kills the consonant it follows.
  if (before === MYANMAR_VIRAMA || here === MYANMAR_VIRAMA) {
    reasons.push("split-myanmar-stack");
  }
  if (here === MYANMAR_ASAT) reasons.push("orphaned-myanmar-asat");
  if (MYANMAR_MEDIAL.test(here)) reasons.push("orphaned-myanmar-medial");
  if (MYANMAR_CONSONANT.test(here) && killedConsonantAt(text, at)) {
    reasons.push("coda-split-from-syllable");
  }

  return reasons;
}

/** True when the consonant at `at` is killed by asat, making it a coda. */
function killedConsonantAt(text, at) {
  let i = at + 1;
  while (i < text.length) {
    if (text[i] === MYANMAR_ASAT) return true;
    if (MYANMAR_MEDIAL.test(text[i])) {
      i++;
      continue;
    }
    return false;
  }
  return false;
}

/** Every offset in `text` where a cut of the given kind would be illegal. */
export function illegalOffsets(text, kind = "break") {
  const out = new Set();
  for (let i = 1; i < text.length; i++) {
    if (illegalBreakReasons(text, i, kind).length > 0) out.add(i);
  }
  return out;
}
