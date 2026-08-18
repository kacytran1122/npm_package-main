/**
 * Myanmar has two incompatible encodings that use the same Unicode block.
 *
 * Zawgyi stores text in visual order and reuses codepoints that Unicode
 * assigns to Mon, Shan, and Karen. Standard Unicode stores logical order.
 * The two look identical in the wrong font and turn to noise in the right one.
 * A large share of Burmese text on the open web is still Zawgyi, so any
 * pipeline that accepts Burmese input has to detect it.
 */

export type MyanmarEncoding = "unicode" | "zawgyi" | "unknown";

export interface EncodingResult {
  encoding: MyanmarEncoding;
  /** 0 to 1. Short strings score low even when the guess is right. */
  confidence: number;
  /** Human-readable signals, useful in lint output. */
  signals: string[];
}

const MYANMAR_RANGE = /[\u1000-\u109F\uAA60-\uAA7F]/;

/** Codepoints Unicode reserves for Mon, Shan, and Karen that Zawgyi reuses. */
const ZAWGYI_ONLY = /[\u1033\u1034\u1060-\u1097]/;

/**
 * In Unicode the e-vowel always follows its consonant. Zawgyi stores it first,
 * so an e-vowel with no consonant in front of it can only be Zawgyi.
 */
const ORPHAN_E_VOWEL = /(^|[^\u1000-\u102A\u103B-\u103E\u1039])\u1031/;

/**
 * Unicode medials attach to the consonant before them. Zawgyi stores medial ra
 * and ya ahead of the consonant, which leaves them orphaned.
 */
const ORPHAN_MEDIAL = /(^|[^\u1000-\u102A\u103B-\u103E])[\u103B-\u103E]/;

/** The kinzi sequence is well-formed Unicode and never appears in Zawgyi. */
const UNICODE_KINZI = /\u1004\u103A\u1039/;

/** Unicode asat sits after a consonant. Zawgyi puts medial ya in that slot. */
const UNICODE_ASAT = /[\u1000-\u102A]\u103A/;

/** A medial directly after its consonant is logical order, so Unicode. */
const UNICODE_MEDIAL = /[\u1000-\u102A][\u103B-\u103E]/;

/**
 * Virama stacking. Weak on its own: Zawgyi uses U+1039 as its asat, so the
 * same two characters occur in both encodings.
 */
const UNICODE_STACK = /\u1039[\u1000-\u1021]/;

/**
 * Guess whether a string is Zawgyi or standard Unicode.
 *
 * detectMyanmarEncoding("မြန်မာ")   // { encoding: "unicode", ... }
 * detectMyanmarEncoding("ျမန္မာ")   // { encoding: "zawgyi", ... }
 */
export function detectMyanmarEncoding(text: string): EncodingResult {
  if (!MYANMAR_RANGE.test(text)) {
    return { encoding: "unknown", confidence: 0, signals: ["no Myanmar characters"] };
  }

  let zawgyi = 0;
  let unicode = 0;
  const signals: string[] = [];

  if (ZAWGYI_ONLY.test(text)) {
    zawgyi += 3;
    signals.push("uses codepoints Unicode reserves for other Myanmar languages");
  }
  if (ORPHAN_E_VOWEL.test(text)) {
    zawgyi += 3;
    signals.push("e-vowel stored before its consonant");
  }
  if (ORPHAN_MEDIAL.test(text)) {
    zawgyi += 3;
    signals.push("medial stored before its consonant");
  }
  if (UNICODE_KINZI.test(text)) {
    unicode += 3;
    signals.push("well-formed kinzi sequence");
  }
  if (UNICODE_MEDIAL.test(text)) {
    unicode += 3;
    signals.push("medial follows its consonant");
  }
  if (UNICODE_ASAT.test(text)) {
    unicode += 2;
    signals.push("asat follows its consonant");
  }
  if (UNICODE_STACK.test(text)) {
    unicode += 1;
    signals.push("virama stacking in logical order");
  }

  const total = zawgyi + unicode;
  if (total === 0) {
    // Plain consonants and common vowels are identical in both encodings.
    return { encoding: "unicode", confidence: 0.2, signals: ["no distinguishing marks"] };
  }

  return zawgyi > unicode
    ? { encoding: "zawgyi", confidence: zawgyi / total, signals }
    : { encoding: "unicode", confidence: unicode / total, signals };
}

export function isZawgyi(text: string): boolean {
  return detectMyanmarEncoding(text).encoding === "zawgyi";
}

/** Throw when a string is Zawgyi. Handy as a guard on user input or imports. */
export function assertUnicodeMyanmar(text: string, label = "text"): void {
  const result = detectMyanmarEncoding(text);
  if (result.encoding === "zawgyi") {
    throw new Error(
      `selakata: ${label} appears to be Zawgyi-encoded (${result.signals.join("; ")}). ` +
        `Convert it with zawgyiToUnicode() before storing.`,
    );
  }
}

// ---------------------------------------------------------------- conversion

/** Zawgyi codepoints that expand into Unicode sequences. */
const EXPANSIONS: Record<string, string> = {
  "\u1033": "\u102F",
  "\u1034": "\u1030",
  "\u1064": "\u1004\u103A\u1039",
  "\u105A": "\u102B\u103A",
  "\u108B": "\u1004\u103A\u1039\u102D",
  "\u108C": "\u1004\u103A\u1039\u102E",
  "\u108D": "\u1004\u103A\u1039\u1036",
  "\u1088": "\u103E\u102F",
  "\u1089": "\u103E\u1030",
  "\u108A": "\u103D\u103E",
  "\u1090": "\u101B",
  "\u1086": "\u103F",
  "\u1087": "\u103E",
  "\u1093": "\u1018",
  "\u1096": "\u1039\u1010\u103D",
  "\u1097": "\u100B\u1039\u100B",
  // Subscript consonant forms: virama plus the consonant they stack.
  "\u1060": "\u1039\u1000",
  "\u1061": "\u1039\u1001",
  "\u1062": "\u1039\u1002",
  "\u1063": "\u1039\u1003",
  "\u1065": "\u1039\u1005",
  "\u1066": "\u1039\u1006",
  "\u1067": "\u1039\u1006",
  "\u1068": "\u1039\u1007",
  "\u1069": "\u1039\u1008",
  "\u106C": "\u1039\u100B",
  "\u106D": "\u1039\u100C",
  "\u106E": "\u100D\u1039\u100D",
  "\u106F": "\u100D\u1039\u100E",
  "\u1070": "\u1039\u100F",
  "\u1071": "\u1039\u1010",
  "\u1072": "\u1039\u1010",
  "\u1073": "\u1039\u1011",
  "\u1074": "\u1039\u1011",
  "\u1075": "\u1039\u1012",
  "\u1076": "\u1039\u1013",
  "\u1077": "\u1039\u1014",
  "\u1078": "\u1039\u1015",
  "\u1079": "\u1039\u1016",
  "\u107A": "\u1039\u1017",
  "\u107B": "\u1039\u1018",
  "\u107C": "\u1039\u1019",
  "\u1085": "\u1039\u101C",
};

/** Medial and asat slots shift by one between the two encodings. */
const MEDIAL_SHIFT: Record<string, string> = {
  "\u1039": "\u103A", // Zawgyi asat -> Unicode asat
  "\u103A": "\u103B", // ya
  "\u103B": "\u103C", // ra
  "\u103C": "\u103D", // wa
  "\u103D": "\u103E", // ha
};

/** Zawgyi medial-ra and medial-ya glyph variants all collapse to one codepoint. */
const VARIANT_MEDIALS: Record<string, string> = {
  "\u107D": "\u103B",
  "\u107E": "\u103C",
  "\u107F": "\u103C",
  "\u1080": "\u103C",
  "\u1081": "\u103C",
  "\u1082": "\u103C",
  "\u1083": "\u103C",
  "\u1084": "\u103C",
};

const BASE_CONSONANT = /[\u1000-\u102A\u103F\u104C-\u104F]/;

/** Canonical order of the marks that can follow a base consonant. */
const RANK: Record<string, number> = {
  "\u1039": 1, // virama (stack marker, kept with its consonant)
  "\u103B": 2, // ya
  "\u103C": 3, // ra
  "\u103D": 4, // wa
  "\u103E": 5, // ha
  "\u1031": 6, // e
  "\u102D": 7,
  "\u102E": 7,
  "\u1032": 7,
  "\u102F": 8,
  "\u1030": 8,
  "\u102B": 9,
  "\u102C": 9,
  "\u103A": 10, // asat
  "\u1036": 11,
  "\u1037": 12,
  "\u1038": 13,
};

/**
 * Convert Zawgyi to standard Unicode.
 *
 * Best effort. It handles ordinary Burmese prose, including medials, stacked
 * consonants, kinzi, and the reordered e-vowel. It does not cover every legacy
 * Zawgyi variant glyph, and it does not attempt Shan or Mon. For archival
 * conversion where losses are unacceptable, use Google's `myanmar-tools`.
 *
 * zawgyiToUnicode("ျမန္မာ") // "မြန်မာ"
 */
export function zawgyiToUnicode(text: string): string {
  // 1. Expand composite codepoints and normalise variant medials.
  let out = "";
  for (const ch of text) {
    out += EXPANSIONS[ch] ?? VARIANT_MEDIALS[ch] ?? ch;
  }

  // 2. Shift medial and asat slots. Single pass so mappings cannot cascade.
  out = out.replace(/[\u1039-\u103D]/g, (ch) => MEDIAL_SHIFT[ch] ?? ch);

  // 3. Reorder each syllable into logical order.
  return reorderSyllables(out);
}

function reorderSyllables(text: string): string {
  const chars = [...text];
  const result: string[] = [];
  let pending: string[] = []; // marks seen before their base consonant

  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];

    if (BASE_CONSONANT.test(ch)) {
      const marks = [...pending];
      pending = [];
      i++;

      // Collect the stack (virama + consonant) and every following mark.
      while (i < chars.length) {
        const next = chars[i];
        if (next === "\u1039" && i + 1 < chars.length && BASE_CONSONANT.test(chars[i + 1])) {
          marks.push(next + chars[i + 1]);
          i += 2;
          continue;
        }
        if (RANK[next] !== undefined && next !== "\u1039") {
          marks.push(next);
          i++;
          continue;
        }
        break;
      }

      marks.sort((a, b) => (RANK[a[0]] ?? 99) - (RANK[b[0]] ?? 99));
      result.push(ch, ...marks);
      continue;
    }

    if (RANK[ch] !== undefined) {
      // A mark with no base consonant yet. Hold it for the next one.
      pending.push(ch);
      i++;
      continue;
    }

    result.push(...pending, ch);
    pending = [];
    i++;
  }

  result.push(...pending);
  return result.join("");
}

/**
 * Convert only if the input looks like Zawgyi. Safe to run on mixed corpora.
 */
export function normalizeMyanmar(text: string): string {
  return isZawgyi(text) ? zawgyiToUnicode(text) : text;
}
