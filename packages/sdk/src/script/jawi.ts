/**
 * Jawi is the Arabic-derived script for Malay, co-official in Brunei and used
 * on signage, in religious contexts, and in Kelantan and Terengganu. It is
 * right-to-left, which means a Malay app that supports Jawi needs real RTL
 * layout, not just a font swap.
 */

/** The Jawi alphabet with its Rumi (Latin) equivalent. This table is exact. */
export const JAWI_LETTERS: { jawi: string; rumi: string; name: string }[] = [
  { jawi: "ا", rumi: "a", name: "alif" },
  { jawi: "ب", rumi: "b", name: "ba" },
  { jawi: "ت", rumi: "t", name: "ta" },
  { jawi: "ث", rumi: "th", name: "tha" },
  { jawi: "ج", rumi: "j", name: "jim" },
  { jawi: "چ", rumi: "c", name: "ca" },
  { jawi: "ح", rumi: "h", name: "ha" },
  { jawi: "خ", rumi: "kh", name: "kha" },
  { jawi: "د", rumi: "d", name: "dal" },
  { jawi: "ذ", rumi: "dz", name: "dzal" },
  { jawi: "ر", rumi: "r", name: "ra" },
  { jawi: "ز", rumi: "z", name: "zai" },
  { jawi: "س", rumi: "s", name: "sin" },
  { jawi: "ش", rumi: "sy", name: "syin" },
  { jawi: "ص", rumi: "s", name: "sad" },
  { jawi: "ض", rumi: "d", name: "dad" },
  { jawi: "ط", rumi: "t", name: "ta" },
  { jawi: "ظ", rumi: "z", name: "za" },
  { jawi: "ع", rumi: "'", name: "ain" },
  { jawi: "غ", rumi: "gh", name: "ghain" },
  { jawi: "ڠ", rumi: "ng", name: "nga" },
  { jawi: "ف", rumi: "f", name: "fa" },
  { jawi: "ڤ", rumi: "p", name: "pa" },
  { jawi: "ق", rumi: "q", name: "qaf" },
  { jawi: "ک", rumi: "k", name: "kaf" },
  { jawi: "ݢ", rumi: "g", name: "ga" },
  { jawi: "ل", rumi: "l", name: "lam" },
  { jawi: "م", rumi: "m", name: "mim" },
  { jawi: "ن", rumi: "n", name: "nun" },
  { jawi: "و", rumi: "w", name: "wau" },
  { jawi: "ۏ", rumi: "v", name: "va" },
  { jawi: "ه", rumi: "h", name: "ha" },
  { jawi: "ة", rumi: "t", name: "ta marbutah" },
  { jawi: "ء", rumi: "'", name: "hamzah" },
  { jawi: "ي", rumi: "y", name: "ya" },
  { jawi: "ڽ", rumi: "ny", name: "nya" },
  { jawi: "ى", rumi: "a", name: "alif maqsurah" },
];

/** Digraphs first so "ng" does not become n + g. */
const RUMI_TO_JAWI: [string, string][] = [
  ["ng", "ڠ"],
  ["ny", "ڽ"],
  ["sy", "ش"],
  ["kh", "خ"],
  ["gh", "غ"],
  ["th", "ث"],
  ["dz", "ذ"],
  ["ch", "چ"],
  ["a", "ا"],
  ["b", "ب"],
  ["c", "چ"],
  ["d", "د"],
  ["e", "ي"],
  ["f", "ف"],
  ["g", "ݢ"],
  ["h", "ه"],
  ["i", "ي"],
  ["j", "ج"],
  ["k", "ک"],
  ["l", "ل"],
  ["m", "م"],
  ["n", "ن"],
  ["o", "و"],
  ["p", "ڤ"],
  ["q", "ق"],
  ["r", "ر"],
  ["s", "س"],
  ["t", "ت"],
  ["u", "و"],
  ["v", "ۏ"],
  ["w", "و"],
  ["y", "ي"],
  ["z", "ز"],
];

/**
 * Transliterate Rumi to Jawi, letter by letter.
 *
 * Best effort only. Real Jawi orthography drops some medial vowels, keeps
 * original Arabic spellings for loanwords, and varies by publisher. Treat the
 * output as a draft for a human to check, not as authoritative text.
 */
export function rumiToJawi(text: string): string {
  let out = "";
  let i = 0;
  const lower = text.toLowerCase();
  while (i < lower.length) {
    let matched = false;
    for (const [rumi, jawi] of RUMI_TO_JAWI) {
      if (lower.startsWith(rumi, i)) {
        out += jawi;
        i += rumi.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += lower[i];
      i++;
    }
  }
  return out;
}

const JAWI_TO_RUMI = new Map(JAWI_LETTERS.map((l) => [l.jawi, l.rumi]));

/** Transliterate Jawi to Rumi. Same caveat: a draft, not a final answer. */
export function jawiToRumi(text: string): string {
  let out = "";
  for (const ch of text) out += JAWI_TO_RUMI.get(ch) ?? ch;
  return out;
}

/** True when the string contains Arabic-script characters. */
export function isJawi(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}
