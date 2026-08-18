/**
 * Vietnamese text handling.
 *
 * Vietnamese stacks a diacritic on the vowel and a tone mark on top of that, so
 * the same word has several valid Unicode spellings. "tiếng" can be one
 * precomposed codepoint plus a combining mark (NFC) or a bare letter plus two
 * combining marks (NFD). They compare unequal with === and sort apart in a
 * database. Normalise on write, fold on search.
 */

/** Precomposed form. Use this before storing or comparing Vietnamese text. */
export function normalizeVietnamese(text: string): string {
  return text.normalize("NFC");
}

/** True when two strings are the same word in different Unicode forms. */
export function equalsVietnamese(a: string, b: string): boolean {
  return a.normalize("NFC") === b.normalize("NFC");
}

const D_STROKE = /[đĐ]/g;

/**
 * Strip tones and diacritics for search and slugs.
 * Handles đ -> d, which NFD alone does not, because đ is a distinct letter.
 *
 * foldVietnamese("Tiếng Việt")   // "Tieng Viet"
 * foldVietnamese("Đà Nẵng")      // "Da Nang"
 */
export function foldVietnamese(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(D_STROKE, (m) => (m === "đ" ? "d" : "D"));
}

/** URL-safe slug from Vietnamese text. */
export function slugifyVietnamese(text: string): string {
  return foldVietnamese(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type VietnameseTone = "ngang" | "huyền" | "sắc" | "hỏi" | "ngã" | "nặng";

const TONE_MARKS: Record<string, VietnameseTone> = {
  "\u0300": "huyền",
  "\u0301": "sắc",
  "\u0309": "hỏi",
  "\u0303": "ngã",
  "\u0323": "nặng",
};

/** The tone carried by a syllable, or "ngang" for the level tone. */
export function toneOf(syllable: string): VietnameseTone {
  for (const ch of syllable.normalize("NFD")) {
    const tone = TONE_MARKS[ch];
    if (tone) return tone;
  }
  return "ngang";
}

/**
 * True when the string contains Vietnamese-specific letters. Useful for
 * detecting whether a "Latin" field actually needs a Vietnamese-capable font.
 */
export function hasVietnameseDiacritics(text: string): boolean {
  return /[ăâđêôơưĂÂĐÊÔƠƯ]/.test(text) || /[\u0300\u0301\u0303\u0309\u0323]/.test(text.normalize("NFD"));
}

/**
 * Convert Telex input to proper Vietnamese. Telex is the default keyboard
 * layout in Vietnam, and pasted or badly configured input often arrives raw.
 *
 * fromTelex("Tieengs Vieejt") // "Tiếng Việt"
 */
export function fromTelex(input: string): string {
  const vowelDouble: Record<string, string> = { aa: "â", ee: "ê", oo: "ô" };
  const toneKeys: Record<string, string> = {
    s: "\u0301",
    f: "\u0300",
    r: "\u0309",
    x: "\u0303",
    j: "\u0323",
  };

  return input
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s*$/.test(word)) return word;
      let w = word;
      let tone = "";

      // Trailing tone key, e.g. "vieejt" carries j on the last vowel group.
      w = w.replace(/[sfrxj]/gi, (m, offset: number) => {
        // Keep s/f/r/x/j that begin the word or follow a consonant cluster.
        if (offset === 0) return m;
        const prev = w[offset - 1];
        if (!/[aeiouyăâêôơưAEIOUY]/i.test(prev)) return m;
        tone = toneKeys[m.toLowerCase()];
        return "";
      });

      w = w.replace(/aa|ee|oo/gi, (m) => {
        const mapped = vowelDouble[m.toLowerCase()];
        return m[0] === m[0].toUpperCase() ? mapped.toUpperCase() : mapped;
      });
      w = w.replace(/aw/gi, (m) => (m[0] === "A" ? "Ă" : "ă"));
      w = w.replace(/ow/gi, (m) => (m[0] === "O" ? "Ơ" : "ơ"));
      w = w.replace(/uw/gi, (m) => (m[0] === "U" ? "Ư" : "ư"));
      w = w.replace(/dd/gi, (m) => (m[0] === "D" ? "Đ" : "đ"));

      if (!tone) return w.normalize("NFC");

      // Place the tone on the main vowel of the last vowel cluster.
      const match = w.match(/[aăâeêioôơuưyAĂÂEÊIOÔƠUƯY]+/g);
      if (!match) return w.normalize("NFC");
      const cluster = match[match.length - 1];
      const index = w.lastIndexOf(cluster);
      const target = pickToneVowel(cluster);
      const at = index + target;
      return (w.slice(0, at + 1) + tone + w.slice(at + 1)).normalize("NFC");
    })
    .join("");
}

/** Vietnamese puts the tone on the nucleus, not simply the first vowel. */
function pickToneVowel(cluster: string): number {
  const priority = "âêôơưăAÂÊÔƠƯĂ";
  for (let i = 0; i < cluster.length; i++) {
    if (priority.includes(cluster[i])) return i;
  }
  return cluster.length > 1 ? 1 : 0;
}
