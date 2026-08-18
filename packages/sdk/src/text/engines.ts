/**
 * Word segmentation for the scripts of Southeast Asia.
 *
 * Two engines live here, both built on the orthographic cluster layer and
 * neither delegating to the platform:
 *
 * - `orthographicEngine` treats every legal break point as a word boundary.
 *   It needs no data, it is the fastest thing that can possibly work, and its
 *   breaks are always safe. Its word boundaries are too many.
 * - `lexicalEngine` runs a unigram Viterbi search over the cluster lattice
 *   against a curated lexicon, so a run of clusters that spells a known word
 *   is kept together. Unknown runs fall back to bounded chunks, which keeps
 *   the segmentation from producing a single unbreakable block of text.
 *
 * Both share the mixed-script handling: real interface strings are not pure
 * Thai or pure Khmer, they are `"ราคา 1,500 บาท"` and `"คลิก OK"`. Text is cut
 * into runs of the target script and everything else, and only the former goes
 * through the lattice.
 */

import { resolveLocale } from "../locales/index.js";
import type { ClusterScript } from "./clusters.js";
import { orthographicBoundaries } from "./clusters.js";
import { lexiconFor } from "./lexicon.js";

export interface Span {
  start: number;
  end: number;
  text: string;
  /** False for whitespace and punctuation, matching `Intl.Segmenter`'s notion. */
  wordLike: boolean;
}

export interface SegmentationEngine {
  readonly id: string;
  /** Every segment of the text, word-like and not, in order. */
  segments(text: string, locale: string): Span[];
  /**
   * Offsets where a line break is allowed, ascending, excluding 0 and
   * `text.length`.
   */
  breaks(text: string, locale: string): number[];
}

// ------------------------------------------------------------- cost constants
//
// The unknown-run penalty is quadratic in length on purpose. A flat or linear
// penalty always prefers the longest chunk the window allows, so an
// out-of-vocabulary sentence comes back as one unbreakable block — the exact
// failure this package exists to prevent. The quadratic term gives the cost
// per cluster an interior minimum at sqrt(UNK_BASE / quadratic), which is
// where an unknown run gets cut.
//
// `UNK_BASE` has to sit above the cost of the rarest lexicon entry, or a known
// word would lose to guessing. With a few hundred entries the tail costs about
// log(600) ≈ 6.4 nats, so 9.0 leaves clear air.

const UNK_BASE = 9.0;
const UNK_PER_CLUSTER = 0.8;

/**
 * Where an unknown run should be cut, in clusters, per script. These are the
 * mean word lengths measured on the dev split of bench/data/corpus.json, and
 * they differ enough between scripts that one shared constant is not usable:
 * a Burmese or Chinese word averages under a cluster and a half, a Thai word
 * nearly three. Tuning this to Thai alone is what costs Chinese its recall.
 */
const UNKNOWN_OPTIMUM: Record<ClusterScript, number> = {
  Thai: 2.9,
  Laoo: 2.4,
  Khmr: 2.2,
  Mymr: 1.5,
  Hans: 1.5,
  Latn: 2.5,
};

/** Longest run of clusters the Viterbi window will consider as one unit. */
const MAX_CLUSTER_WINDOW = 10;

function unknownCost(clusters: number, optimum: number): number {
  const quadratic = UNK_BASE / (optimum * optimum);
  return UNK_BASE + UNK_PER_CLUSTER * clusters + quadratic * clusters * clusters;
}

// ---------------------------------------------------------------- script runs

const SCRIPT_OF: Record<string, ClusterScript> = {
  Thai: "Thai",
  Laoo: "Laoo",
  Khmr: "Khmr",
  Mymr: "Mymr",
  Hans: "Hans",
};

/** The cluster script a locale is written in, or `Latn` for spaced scripts. */
export function clusterScriptFor(locale: string): ClusterScript {
  const def = resolveLocale(locale);
  if (!def) return "Latn";
  return SCRIPT_OF[def.script] ?? "Latn";
}

function inScript(cp: number, script: ClusterScript): boolean {
  switch (script) {
    case "Thai":
      return cp >= 0x0e01 && cp <= 0x0e5b;
    case "Laoo":
      return cp >= 0x0e81 && cp <= 0x0edf;
    case "Khmr":
      return (cp >= 0x1780 && cp <= 0x17f9) || (cp >= 0x19e0 && cp <= 0x19ff);
    case "Mymr":
      return (
        (cp >= 0x1000 && cp <= 0x109f) ||
        (cp >= 0xa9e0 && cp <= 0xa9fe) ||
        (cp >= 0xaa60 && cp <= 0xaa7f)
      );
    case "Hans":
      return (
        (cp >= 0x3400 && cp <= 0x4dbf) ||
        (cp >= 0x4e00 && cp <= 0x9fff) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0x20000 && cp <= 0x3ffff)
      );
    default:
      return false;
  }
}

interface Run {
  start: number;
  end: number;
  native: boolean;
}

/** Maximal runs of the target script, interleaved with everything else. */
function scriptRuns(text: string, script: ClusterScript): Run[] {
  const out: Run[] = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i) as number;
    const native = inScript(cp, script);
    const start = i;
    while (i < text.length) {
      const c = text.codePointAt(i) as number;
      if (inScript(c, script) !== native) break;
      i += c > 0xffff ? 2 : 1;
    }
    out.push({ start, end: i, native });
  }
  return out;
}

// ------------------------------------------------------------- spaced scripts

/**
 * Words in a script that writes spaces. Letters, digits, and combining marks
 * form a word; an internal apostrophe or hyphen keeps it together, so
 * "can't" and "e-mail" stay whole and Vietnamese "Việt" survives NFD input.
 */
const WORD_RE =
  /\p{N}+(?:[.,]\p{N}+)*|[\p{L}\p{M}][\p{L}\p{N}\p{M}]*(?:['’ʼ‐‑-][\p{L}\p{N}\p{M}]+)*/gu;

function spacedSegments(text: string, offset: number): Span[] {
  const out: Span[] = [];
  let cursor = 0;
  WORD_RE.lastIndex = 0;

  for (let m = WORD_RE.exec(text); m; m = WORD_RE.exec(text)) {
    if (m.index > cursor) {
      out.push({
        start: offset + cursor,
        end: offset + m.index,
        text: text.slice(cursor, m.index),
        wordLike: false,
      });
    }
    out.push({
      start: offset + m.index,
      end: offset + m.index + m[0].length,
      text: m[0],
      wordLike: true,
    });
    cursor = m.index + m[0].length;
  }

  if (cursor < text.length) {
    out.push({
      start: offset + cursor,
      end: offset + text.length,
      text: text.slice(cursor),
      wordLike: false,
    });
  }
  return out;
}

// ------------------------------------------------------------------- lattices

/**
 * Viterbi over the cluster lattice.
 *
 * `bounds` are cluster boundaries within one native run. The search returns the
 * indices into `bounds` that the best path visits, which is the cheapest way to
 * cover the run with lexicon entries and bounded unknown chunks.
 */
function viterbi(
  text: string,
  bounds: number[],
  cost: ReadonlyMap<string, number>,
  maxWordLength: number,
  optimum: number,
): number[] {
  const n = bounds.length - 1;
  if (n <= 0) return [0];

  const best = new Float64Array(n + 1);
  const from = new Int32Array(n + 1);
  best.fill(Number.POSITIVE_INFINITY);
  best[0] = 0;
  from[0] = -1;

  for (let j = 1; j <= n; j++) {
    const lowest = Math.max(0, j - MAX_CLUSTER_WINDOW);
    for (let i = j - 1; i >= lowest; i--) {
      if (!Number.isFinite(best[i])) continue;
      const width = bounds[j] - bounds[i];
      let step: number;
      if (width <= maxWordLength) {
        const known = cost.get(text.slice(bounds[i], bounds[j]));
        step = known ?? unknownCost(j - i, optimum);
      } else {
        step = unknownCost(j - i, optimum);
      }
      const total = best[i] + step;
      if (total < best[j]) {
        best[j] = total;
        from[j] = i;
      }
    }
  }

  const path: number[] = [];
  for (let j = n; j >= 0; j = from[j]) {
    path.push(j);
    if (j === 0) break;
  }
  return path.reverse();
}

// -------------------------------------------------------------------- engines

function nativeSpansFromBounds(text: string, bounds: number[], picks: number[]): Span[] {
  const out: Span[] = [];
  for (let k = 0; k < picks.length - 1; k++) {
    const start = bounds[picks[k]];
    const end = bounds[picks[k + 1]];
    out.push({ start, end, text: text.slice(start, end), wordLike: true });
  }
  return out;
}

function buildSegments(
  text: string,
  locale: string,
  pick: (slice: string, bounds: number[]) => number[],
): Span[] {
  const script = clusterScriptFor(locale);
  if (script === "Latn") return spacedSegments(text, 0);

  const out: Span[] = [];
  for (const run of scriptRuns(text, script)) {
    const slice = text.slice(run.start, run.end);
    if (!run.native) {
      for (const span of spacedSegments(slice, run.start)) out.push(span);
      continue;
    }

    const bounds = orthographicBoundaries(slice, script);

    // Native punctuation — the Khmer khan, the Burmese section mark, a full
    // stop pasted inside a Thai run — is a hard boundary. Letting the lattice
    // span it lets an unknown-run chunk swallow the punctuation into a "word",
    // and no amount of cost tuning fixes that because it is not a cost
    // question.
    let from = 0;
    for (let i = 0; i <= bounds.length - 1; i++) {
      const isEnd = i === bounds.length - 1;
      const cluster = isEnd ? "" : slice.slice(bounds[i], bounds[i + 1]);
      if (!isEnd && hasLetter(cluster)) continue;

      if (i > from) {
        const window = bounds.slice(from, i + 1);
        for (const span of nativeSpansFromBounds(slice, window, pick(slice, window))) {
          out.push({
            start: run.start + span.start,
            end: run.start + span.end,
            text: span.text,
            wordLike: true,
          });
        }
      }
      if (!isEnd) {
        out.push({
          start: run.start + bounds[i],
          end: run.start + bounds[i + 1],
          text: cluster,
          wordLike: false,
        });
      }
      from = i + 1;
    }
  }
  return out;
}

const LETTER_RE = /[\p{L}\p{N}]/u;

function hasLetter(text: string): boolean {
  return LETTER_RE.test(text);
}

/**
 * Approach B: every legal break point is a boundary. No data, no search.
 * Kept as a first-class engine because it is the fallback for any locale with
 * no lexicon, and because it is the floor the lexical engine has to beat.
 */
export const orthographicEngine: SegmentationEngine = {
  id: "orthographic",
  segments(text, locale) {
    return buildSegments(text, locale, (_slice, bounds) => bounds.map((_, i) => i));
  },
  breaks(text, locale) {
    return interiorBreaks(this.segments(text, locale), text);
  },
};

/**
 * Approach C: unigram Viterbi over the cluster lattice against the curated
 * lexicon, falling back to Approach B for locales with no lexicon.
 */
export const lexicalEngine: SegmentationEngine = {
  id: "lexical",
  segments(text, locale) {
    const lex = lexiconFor(locale);
    if (!lex) return orthographicEngine.segments(text, locale);
    const optimum = UNKNOWN_OPTIMUM[clusterScriptFor(locale)];
    return buildSegments(text, locale, (slice, bounds) =>
      viterbi(slice, bounds, lex.cost, lex.maxLength, optimum),
    );
  },
  breaks(text, locale) {
    return interiorBreaks(this.segments(text, locale), text);
  },
};

/**
 * Break opportunities from a segmentation.
 *
 * Only the start of a word-like span counts. The start of a punctuation span
 * does not, because the punctuation this hits — the Khmer khan, the Burmese
 * section mark, CJK full stops — is break-*after* punctuation in UAX #14. A
 * line may not begin with it, so offering the offset would let a paragraph
 * wrap onto a line that starts with a full stop.
 */
function interiorBreaks(spans: Span[], text: string): number[] {
  const out: number[] = [];
  for (const span of spans) {
    if (!span.wordLike) continue;
    if (span.start > 0 && span.start < text.length) out.push(span.start);
  }
  return out;
}

/**
 * The engine the package uses. Swappable so an application can trade accuracy
 * for size — dropping to `orthographicEngine` removes the lexicon from the
 * bundle for anyone who only needs line breaking.
 */
let active: SegmentationEngine = lexicalEngine;

export function setSegmentationEngine(engine: SegmentationEngine): void {
  active = engine;
}

export function segmentationEngine(): SegmentationEngine {
  return active;
}
