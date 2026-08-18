/**
 * Orthographic clustering: the indivisible units of a script.
 *
 * Everything downstream — line breaking, truncation, the word lattice — is
 * built on one question: *where is it legal to cut this string?* Answering it
 * needs two layers, and the platform only ships the first.
 *
 * Layer one is UAX #29 extended grapheme clusters, implemented here from the
 * rule set rather than delegated, so the answer is identical on every runtime
 * and exists on runtimes with no ICU at all.
 *
 * Layer two is the tailoring UAX #29 deliberately omits, because it is
 * orthographic rather than encoding-level. Three examples, all of which the
 * untailored algorithm gets visibly wrong:
 *
 * - Thai and Lao write some vowels *before* the consonant they are pronounced
 *   after. `เ` in `เกี่ยว` is a full letter (Lo), not a combining mark, so
 *   UAX #29 makes it its own cluster and a truncation can leave a dangling `เ`
 *   on screen. No reader accepts that; it is the visual equivalent of ending a
 *   line on a lone `q`.
 * - Burmese marks a killed final consonant with asat, U+103A. `န်` in
 *   `ကျွန်` is consonant + mark, a well-formed cluster by UAX #29 and a
 *   syllable coda in reality. Split there and `ကျွ` renders as a different
 *   syllable.
 * - Khmer subjoins consonants with coeng, U+17D2. The coeng is a mark and
 *   attaches leftwards; the consonant it pulls under the base does not, so the
 *   stack comes apart.
 *
 * The output is a list of boundaries that are safe to break at. Being slightly
 * finer than a syllable is harmless — a lattice can always merge units back
 * together, and a line break at a legal-but-unidiomatic point is a typographic
 * nit. Being coarser is not: an illegal break is a rendering bug.
 */

/** Scripts that need orthographic tailoring beyond UAX #29. */
export type ClusterScript = "Thai" | "Laoo" | "Khmr" | "Mymr" | "Hans" | "Latn";

// --------------------------------------------------------------- code points

const CR = 0x0d;
const LF = 0x0a;
const ZWJ = 0x200d;
const ZWSP_CP = 0x200b;

// Thai
const TH_LEAD_LO = 0x0e40; // เ
const TH_LEAD_HI = 0x0e44; // ไ
const TH_PHINTHU = 0x0e3a;
/** Thai letters that are pronounced after the preceding consonant: ะ า ำ ๅ ๆ ฯ */
const TH_TRAIL = new Set([0x0e30, 0x0e32, 0x0e33, 0x0e45, 0x0e46, 0x0e2f, 0x0e5a, 0x0e5b]);

// Lao
const LO_LEAD_LO = 0x0ec0; // ເ
const LO_LEAD_HI = 0x0ec4; // ໄ
/** Lao letters pronounced after the preceding consonant: ະ າ ຳ ໆ */
const LO_TRAIL = new Set([0x0eb0, 0x0eb2, 0x0eb3, 0x0ec6]);

// Khmer
const KM_COENG = 0x17d2;

// Myanmar
const MM_VIRAMA = 0x1039;
const MM_ASAT = 0x103a;

// --------------------------------------------------------------- UAX #29 GCB

const RE_MARK = /\p{M}/u;
const RE_PICTO = /\p{Extended_Pictographic}/u;
const RE_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const RE_RI = /[\u{1F1E6}-\u{1F1FF}]/u;

/**
 * Prepend, from UAX #29. Short enough to enumerate, and enumerating it keeps
 * us off `\p{gcb=...}`, which no JavaScript engine exposes.
 */
const PREPEND = new Set([
  0x0600, 0x0601, 0x0602, 0x0603, 0x0604, 0x0605, 0x06dd, 0x070f, 0x0890, 0x0891, 0x08e2,
  0x0d4e, 0x110bd, 0x110cd, 0x111c2, 0x111c3, 0x1193f, 0x11941, 0x11a3a, 0x11a84, 0x11a85,
  0x11a86, 0x11a87, 0x11a88, 0x11a89, 0x11d46, 0x11f02,
]);

/** Grapheme_Cluster_Break classes. Plain constants, so the build stays isolatedModules-safe. */
const GCB = {
  Other: 0,
  CR: 1,
  LF: 2,
  Control: 3,
  Extend: 4,
  ZWJ: 5,
  RI: 6,
  Prepend: 7,
  L: 8,
  V: 9,
  T: 10,
  LV: 11,
  LVT: 12,
} as const;

type GCB = (typeof GCB)[keyof typeof GCB];

function gcb(cp: number): GCB {
  if (cp === CR) return GCB.CR;
  if (cp === LF) return GCB.LF;
  if (cp === ZWJ) return GCB.ZWJ;

  // Variation selectors, the tag block, and ZWNJ extend but are Cf, so they
  // have to be classified before the general Control test below. Emoji
  // modifiers (the Fitzpatrick skin tones) extend but are Sk, so they are not
  // caught by \p{M} either. ZWSP is deliberately left as Other: it is a break
  // opportunity, not an attachment.
  if (
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xe0020 && cp <= 0xe007f) ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    cp === 0x200c
  ) {
    return GCB.Extend;
  }
  if (cp === ZWSP_CP) return GCB.Other;

  if (PREPEND.has(cp)) return GCB.Prepend;

  const s = String.fromCodePoint(cp);
  if (RE_MARK.test(s)) return GCB.Extend;
  if (RE_CONTROL.test(s)) return GCB.Control;
  if (RE_RI.test(s)) return GCB.RI;

  // Hangul jamo.
  if (cp >= 0x1100 && cp <= 0x115f) return GCB.L;
  if (cp >= 0xa960 && cp <= 0xa97c) return GCB.L;
  if ((cp >= 0x1160 && cp <= 0x11a7) || (cp >= 0xd7b0 && cp <= 0xd7c6)) return GCB.V;
  if ((cp >= 0x11a8 && cp <= 0x11ff) || (cp >= 0xd7cb && cp <= 0xd7fb)) return GCB.T;
  if (cp >= 0xac00 && cp <= 0xd7a3) return (cp - 0xac00) % 28 === 0 ? GCB.LV : GCB.LVT;

  return GCB.Other;
}

function isPictographic(cp: number): boolean {
  return RE_PICTO.test(String.fromCodePoint(cp));
}

/**
 * True when a break is allowed between two adjacent code points, per UAX #29
 * GB3–GB13. `ctx` carries the state GB11 (emoji ZWJ sequences) and GB12/GB13
 * (flag pairs) need, because neither rule is decidable from the pair alone.
 */
interface GraphemeState {
  /** Odd number of unbroken regional indicators immediately before. */
  riOdd: boolean;
  /** The run before a ZWJ was Extended_Pictographic Extend*. */
  pictoRun: boolean;
}

function allowBreak(prev: number, next: number, state: GraphemeState): boolean {
  const a = gcb(prev);
  const b = gcb(next);

  if (a === GCB.CR && b === GCB.LF) return false; // GB3
  if (a === GCB.Control || a === GCB.CR || a === GCB.LF) return true; // GB4
  if (b === GCB.Control || b === GCB.CR || b === GCB.LF) return true; // GB5

  // GB6–GB8: Hangul syllable composition.
  if (a === GCB.L && (b === GCB.L || b === GCB.V || b === GCB.LV || b === GCB.LVT)) return false;
  if ((a === GCB.LV || a === GCB.V) && (b === GCB.V || b === GCB.T)) return false;
  if ((a === GCB.LVT || a === GCB.T) && b === GCB.T) return false;

  if (b === GCB.Extend || b === GCB.ZWJ) return false; // GB9 + GB9a
  if (a === GCB.Prepend) return false; // GB9b

  // GB11: ExtPict Extend* ZWJ x ExtPict
  if (a === GCB.ZWJ && state.pictoRun && isPictographic(next)) return false;

  // GB12/GB13: pair up regional indicators.
  if (a === GCB.RI && b === GCB.RI && state.riOdd) return false;

  return true; // GB999
}

/**
 * UAX #29 extended grapheme clusters, as index boundaries into `text`.
 * Always starts with 0 and ends with `text.length`.
 */
export function graphemeBoundaries(text: string): number[] {
  const out = [0];
  if (text.length === 0) return out;

  const state: GraphemeState = { riOdd: false, pictoRun: false };
  let prev = text.codePointAt(0) as number;
  let i = prev > 0xffff ? 2 : 1;
  state.riOdd = gcb(prev) === GCB.RI;
  state.pictoRun = isPictographic(prev);

  while (i < text.length) {
    const next = text.codePointAt(i) as number;
    const width = next > 0xffff ? 2 : 1;

    if (allowBreak(prev, next, state)) {
      out.push(i);
      state.riOdd = gcb(next) === GCB.RI;
      state.pictoRun = isPictographic(next);
    } else {
      const c = gcb(next);
      if (c === GCB.RI) state.riOdd = !state.riOdd;
      else if (c !== GCB.Extend && c !== GCB.ZWJ) state.riOdd = false;
      // GB11 needs the picto run to survive Extend* and the ZWJ itself.
      if (c !== GCB.Extend && c !== GCB.ZWJ) state.pictoRun = isPictographic(next);
    }

    prev = next;
    i += width;
  }

  out.push(text.length);
  return out;
}

// ------------------------------------------------------------- SEA tailoring

function isThaiConsonant(cp: number): boolean {
  return cp >= 0x0e01 && cp <= 0x0e2e;
}

function isLaoConsonant(cp: number): boolean {
  return (cp >= 0x0e81 && cp <= 0x0eae) || cp === 0x0edc || cp === 0x0edd;
}

function isKhmerConsonant(cp: number): boolean {
  return (cp >= 0x1780 && cp <= 0x17b3) || cp === 0x17a3 || cp === 0x17a4;
}

/** Myanmar consonants, including the Mon, Shan, and Karen extensions. */
function isMyanmarConsonant(cp: number): boolean {
  return (
    (cp >= 0x1000 && cp <= 0x102a) ||
    cp === 0x103f ||
    (cp >= 0x1050 && cp <= 0x1055) ||
    (cp >= 0x105a && cp <= 0x105d) ||
    cp === 0x1061 ||
    (cp >= 0x1065 && cp <= 0x1066) ||
    (cp >= 0x106e && cp <= 0x1070) ||
    (cp >= 0x1075 && cp <= 0x1081) ||
    cp === 0x108e
  );
}

/** Myanmar vowel signs. A cluster carrying one is a nucleus, not a coda. */
function isMyanmarVowel(cp: number): boolean {
  return (
    (cp >= 0x102b && cp <= 0x1035) ||
    (cp >= 0x1056 && cp <= 0x1059) ||
    (cp >= 0x105e && cp <= 0x1060) ||
    (cp >= 0x1062 && cp <= 0x1064) ||
    (cp >= 0x1067 && cp <= 0x106d) ||
    (cp >= 0x1071 && cp <= 0x1074) ||
    (cp >= 0x1082 && cp <= 0x108d) ||
    (cp >= 0x109c && cp <= 0x109d)
  );
}

function isThaiLead(cp: number): boolean {
  return cp >= TH_LEAD_LO && cp <= TH_LEAD_HI;
}

function isLaoLead(cp: number): boolean {
  return cp >= LO_LEAD_LO && cp <= LO_LEAD_HI;
}

/**
 * Merge a grapheme boundary list down to orthographic clusters.
 *
 * Returns boundaries, not substrings, so callers can index the original string
 * without allocating. Only boundaries that survive here are legal break points.
 */
export function orthographicBoundaries(text: string, script: ClusterScript): number[] {
  if (text.length === 0) return [0];
  if (script === "Hans" || script === "Latn") return graphemeBoundaries(text);

  const base = graphemeBoundaries(text);
  const out: number[] = [base[0]];

  for (let i = 1; i < base.length - 1; i++) {
    const at = base[i];
    const prevStart = out[out.length - 1];
    const here = text.codePointAt(at) as number;
    const before = text.codePointAt(prevStart) as number;
    // Last code point of the cluster that is about to close.
    const beforeEndCp = lastCodePoint(text, prevStart, at);

    if (!legalBreakBetween(script, text, prevStart, at, before, beforeEndCp, here)) continue;
    out.push(at);
  }

  out.push(text.length);
  return out;
}

function lastCodePoint(text: string, start: number, end: number): number {
  if (end - start === 0) return 0;
  const lead = text.charCodeAt(end - 2);
  if (end - start >= 2 && lead >= 0xd800 && lead <= 0xdbff) {
    return text.codePointAt(end - 2) as number;
  }
  return text.charCodeAt(end - 1);
}

function legalBreakBetween(
  script: ClusterScript,
  text: string,
  clusterStart: number,
  at: number,
  clusterFirstCp: number,
  clusterLastCp: number,
  nextCp: number,
): boolean {
  switch (script) {
    case "Thai": {
      // A leading vowel belongs to the consonant it precedes.
      if (isThaiLead(clusterLastCp)) return false;
      // ะ า ำ ๅ ๆ ฯ are letters that attach leftwards.
      if (TH_TRAIL.has(nextCp)) return false;
      // Phinthu subjoins the next consonant (Pali orthography).
      if (clusterLastCp === TH_PHINTHU) return false;
      // A cluster that is only a leading vowel run must swallow its consonant.
      if (isThaiLead(clusterFirstCp) && !containsConsonant(text, clusterStart, at, isThaiConsonant)) {
        return false;
      }
      return true;
    }
    case "Laoo": {
      if (isLaoLead(clusterLastCp)) return false;
      if (LO_TRAIL.has(nextCp)) return false;
      if (isLaoLead(clusterFirstCp) && !containsConsonant(text, clusterStart, at, isLaoConsonant)) {
        return false;
      }
      return true;
    }
    case "Khmr": {
      // Coeng pulls the following consonant under the base.
      if (clusterLastCp === KM_COENG) return false;
      if (nextCp === KM_COENG) return false;
      // Khmer signs and the independent-vowel diacritics attach leftwards.
      if (nextCp >= 0x17c6 && nextCp <= 0x17d3) return false;
      return true;
    }
    case "Mymr": {
      // Virama stacks the following consonant.
      if (clusterLastCp === MM_VIRAMA) return false;
      if (nextCp === MM_VIRAMA) return false;
      // A killed consonant is this syllable's coda, not the next syllable's onset.
      if (isMyanmarConsonant(nextCp) && codaFollows(text, at)) return false;
      // Signs, medials, and vowel marks attach leftwards.
      if (isMyanmarVowel(nextCp) || nextCp === 0x1038 || nextCp === MM_ASAT) return false;
      return true;
    }
    default:
      return true;
  }
}

function containsConsonant(
  text: string,
  start: number,
  end: number,
  test: (cp: number) => boolean,
): boolean {
  for (let i = start; i < end; ) {
    const cp = text.codePointAt(i) as number;
    if (test(cp)) return true;
    i += cp > 0xffff ? 2 : 1;
  }
  return false;
}

/**
 * True when the consonant starting at `at` is killed by asat before the next
 * base — that is, it is a coda that belongs to the syllable on its left.
 * Medials may intervene; a vowel sign means it is an onset instead.
 */
function codaFollows(text: string, at: number): boolean {
  let i = at + 1;
  while (i < text.length) {
    const cp = text.codePointAt(i) as number;
    if (cp === MM_ASAT) return true;
    if (cp >= 0x103b && cp <= 0x103e) {
      i += 1; // medial ya/ra/wa/ha
      continue;
    }
    return false;
  }
  return false;
}

/** Convenience wrapper: boundaries turned into substrings. */
export function orthographicClusters(text: string, script: ClusterScript): string[] {
  const b = orthographicBoundaries(text, script);
  const out: string[] = [];
  for (let i = 0; i < b.length - 1; i++) out.push(text.slice(b[i], b[i + 1]));
  return out;
}

/** Grapheme clusters as substrings. Runtime-independent, no ICU required. */
export function graphemeClusters(text: string): string[] {
  const b = graphemeBoundaries(text);
  const out: string[] = [];
  for (let i = 0; i < b.length - 1; i++) out.push(text.slice(b[i], b[i + 1]));
  return out;
}
