import type { Register, SentenceType, SpeakerGender } from "./types.js";
import { resolveLocale } from "./locales/index.js";

/**
 * Politeness particles that close a sentence.
 *
 * In Thai, Burmese, and Khmer the particle depends on the gender of the
 * *speaker*, not the listener. An app speaking in its own voice has to decide
 * what gender it presents as, or use a neutral form. Hardcoding ครับ makes
 * every Thai user read your product as a man.
 */
interface ParticleSet {
  male: { statement: string; question: string };
  female: { statement: string; question: string };
  neutral: { statement: string; question: string } | null;
}

const PARTICLES: Record<string, ParticleSet> = {
  th: {
    male: { statement: "ครับ", question: "ครับ" },
    female: { statement: "ค่ะ", question: "คะ" },
    // Thai has no truly neutral polite particle. Brands usually pick one and
    // stay consistent, or write around it.
    neutral: null,
  },
  my: {
    male: { statement: "ခင်ဗျာ", question: "ခင်ဗျာ" },
    female: { statement: "ရှင်", question: "ရှင်" },
    // ပါ softens without marking gender.
    neutral: { statement: "ပါ", question: "ပါ" },
  },
  km: {
    male: { statement: "បាទ", question: "បាទ" },
    female: { statement: "ចាស", question: "ចាស" },
    neutral: null,
  },
  vi: {
    male: { statement: "ạ", question: "ạ" },
    female: { statement: "ạ", question: "ạ" },
    neutral: { statement: "ạ", question: "ạ" },
  },
  fil: {
    male: { statement: "po", question: "po" },
    female: { statement: "po", question: "po" },
    neutral: { statement: "po", question: "po" },
  },
  lo: {
    male: { statement: "ເດີ້", question: "ເດີ້" },
    female: { statement: "ເດີ້", question: "ເດີ້" },
    neutral: { statement: "ເດີ້", question: "ເດີ້" },
  },
};

export interface ParticleOptions {
  speakerGender?: SpeakerGender;
  sentenceType?: SentenceType;
}

/**
 * The polite sentence-final particle for a locale, or null when the language
 * has none or has no neutral option.
 *
 * politeParticle("th", { speakerGender: "female", sentenceType: "question" })
 *   // "คะ"
 * politeParticle("th", { speakerGender: "neutral" })  // null
 */
export function politeParticle(locale: string, opts: ParticleOptions = {}): string | null {
  const def = resolveLocale(locale);
  const set = def ? PARTICLES[def.baseLocale ?? def.code] ?? PARTICLES[def.code] : undefined;
  if (!set) return null;
  const gender = opts.speakerGender ?? "neutral";
  const bucket = set[gender];
  if (!bucket) return null;
  return bucket[opts.sentenceType ?? "statement"];
}

/** Append the polite particle to a sentence, if the language has one. */
export function withPoliteness(
  text: string,
  locale: string,
  opts: ParticleOptions = {},
): string {
  const particle = politeParticle(locale, opts);
  if (!particle) return text;
  const trimmed = text.replace(/\s+$/, "");
  const punctuation = trimmed.match(/[.!?？。]$/) ? trimmed.slice(0, -1) : trimmed;
  const tail = trimmed.match(/[.!?？。]$/)?.[0] ?? "";
  return `${punctuation} ${particle}${tail}`;
}

/** True when the sentence-final particle changes with the speaker's gender. */
export function particleIsGendered(locale: string): boolean {
  const def = resolveLocale(locale);
  const set = def ? PARTICLES[def.baseLocale ?? def.code] : undefined;
  if (!set) return false;
  return set.male.statement !== set.female.statement;
}

// ---------------------------------------------------------------- pronouns

export type Referent = "you" | "i" | "we";

type PronounTable = Partial<
  Record<Register, Partial<Record<Referent, string | { male: string; female: string }>>>
>;

/**
 * Second and first person pronouns by politeness level.
 *
 * Thai and Burmese first person pronouns are marked for speaker gender.
 * Javanese and Sundanese use full speech levels, mapped here onto
 * formal / neutral / casual.
 */
const PRONOUNS: Record<string, PronounTable> = {
  vi: {
    formal: { you: "quý khách", i: "tôi", we: "chúng tôi" },
    neutral: { you: "bạn", i: "tôi", we: "chúng tôi" },
    casual: { you: "cậu", i: "mình", we: "bọn mình" },
  },
  th: {
    formal: { you: "ท่าน", i: "ข้าพเจ้า", we: "เรา" },
    neutral: { you: "คุณ", i: { male: "ผม", female: "ดิฉัน" }, we: "เรา" },
    casual: { you: "เธอ", i: "ฉัน", we: "เรา" },
  },
  km: {
    formal: { you: "លោក", i: "ខ្ញុំបាទ", we: "យើងខ្ញុំ" },
    neutral: { you: "អ្នក", i: "ខ្ញុំ", we: "យើង" },
    casual: { you: "អ្នក", i: "ខ្ញុំ", we: "យើង" },
  },
  lo: {
    formal: { you: "ທ່ານ", i: "ຂ້າພະເຈົ້າ", we: "ພວກເຮົາ" },
    neutral: { you: "ເຈົ້າ", i: "ຂ້ອຍ", we: "ພວກເຮົາ" },
    casual: { you: "ເຈົ້າ", i: "ຂ້ອຍ", we: "ເຮົາ" },
  },
  my: {
    formal: {
      you: { male: "ခင်ဗျား", female: "ရှင်" },
      i: { male: "ကျွန်တော်", female: "ကျွန်မ" },
      we: "ကျွန်တော်တို့",
    },
    neutral: {
      you: { male: "ခင်ဗျား", female: "ရှင်" },
      i: { male: "ကျွန်တော်", female: "ကျွန်မ" },
      we: "ကျွန်တော်တို့",
    },
    casual: { you: "မင်း", i: "ငါ", we: "ငါတို့" },
  },
  id: {
    formal: { you: "Anda", i: "saya", we: "kami" },
    neutral: { you: "kamu", i: "saya", we: "kami" },
    casual: { you: "lo", i: "gue", we: "kita" },
  },
  ms: {
    formal: { you: "anda", i: "saya", we: "kami" },
    neutral: { you: "awak", i: "saya", we: "kami" },
    casual: { you: "kau", i: "aku", we: "kita" },
  },
  jv: {
    // krama / madya / ngoko
    formal: { you: "panjenengan", i: "kula", we: "kula sedaya" },
    neutral: { you: "sampeyan", i: "kula", we: "kita" },
    casual: { you: "kowé", i: "aku", we: "awaké dhéwé" },
  },
  su: {
    formal: { you: "anjeun", i: "abdi", we: "abdi sadaya" },
    neutral: { you: "anjeun", i: "abdi", we: "urang" },
    casual: { you: "manéh", i: "urang", we: "urang" },
  },
  fil: {
    formal: { you: "kayo", i: "ako", we: "kami" },
    neutral: { you: "ikaw", i: "ako", we: "kami" },
    casual: { you: "ikaw", i: "ako", we: "tayo" },
  },
  ceb: {
    formal: { you: "kamo", i: "ako", we: "kami" },
    neutral: { you: "ikaw", i: "ako", we: "kami" },
    casual: { you: "ikaw", i: "ako", we: "kita" },
  },
  tet: {
    formal: { you: "Ita-boot", i: "ha'u", we: "ami" },
    neutral: { you: "Ita", i: "ha'u", we: "ami" },
    casual: { you: "o", i: "ha'u", we: "ita" },
  },
  tpi: {
    formal: { you: "yu", i: "mi", we: "mipela" },
    neutral: { you: "yu", i: "mi", we: "mipela" },
    casual: { you: "yu", i: "mi", we: "yumi" },
  },
  "zh-Hans-SG": {
    formal: { you: "您", i: "我", we: "我们" },
    neutral: { you: "你", i: "我", we: "我们" },
    casual: { you: "你", i: "我", we: "我们" },
  },
  "ta-SG": {
    formal: { you: "தாங்கள்", i: "நான்", we: "நாங்கள்" },
    neutral: { you: "நீங்கள்", i: "நான்", we: "நாங்கள்" },
    casual: { you: "நீ", i: "நான்", we: "நாம்" },
  },
  en: {
    formal: { you: "you", i: "I", we: "we" },
    neutral: { you: "you", i: "I", we: "we" },
    casual: { you: "you", i: "I", we: "we" },
  },
};

export interface PronounOptions {
  register?: Register;
  /** Needed for Thai and Burmese first person, and Burmese second person. */
  speakerGender?: SpeakerGender;
}

/**
 * pronoun("vi", "you", { register: "formal" })  // "quý khách"
 * pronoun("th", "i", { speakerGender: "female" }) // "ดิฉัน"
 * pronoun("jv", "you", { register: "formal" })  // "panjenengan"  (krama)
 */
export function pronoun(
  locale: string,
  referent: Referent = "you",
  opts: PronounOptions = {},
): string | undefined {
  const def = resolveLocale(locale);
  if (!def) return undefined;
  const table =
    PRONOUNS[def.code] ?? (def.baseLocale ? PRONOUNS[def.baseLocale] : undefined);
  if (!table) return PRONOUNS.en[opts.register ?? "neutral"]?.[referent] as string;

  const register = opts.register ?? "neutral";
  const entry = table[register]?.[referent] ?? table.neutral?.[referent];
  if (!entry) return undefined;
  if (typeof entry === "string") return entry;
  const gender = opts.speakerGender ?? "male";
  return gender === "female" ? entry.female : entry.male;
}

/** True when first person pronouns change with the speaker's gender. */
export function pronounIsGendered(locale: string): boolean {
  const def = resolveLocale(locale);
  const table = def ? PRONOUNS[def.code] ?? PRONOUNS[def.baseLocale ?? ""] : undefined;
  if (!table) return false;
  return Object.values(table).some((r) =>
    Object.values(r ?? {}).some((v) => typeof v === "object"),
  );
}

/** Native names for the language's own politeness system, where it has one. */
const SPEECH_LEVELS: Record<string, Record<Register, string>> = {
  jv: { formal: "krama", neutral: "madya", casual: "ngoko" },
  su: { formal: "lemes", neutral: "sedeng", casual: "loma" },
  th: { formal: "ราชาศัพท์/สุภาพ", neutral: "สุภาพ", casual: "กันเอง" },
  km: { formal: "ភាសាសុភាព", neutral: "ធម្មតា", casual: "មិត្តភាព" },
};

export function speechLevel(locale: string, register: Register): string | undefined {
  const def = resolveLocale(locale);
  return def ? SPEECH_LEVELS[def.code]?.[register] : undefined;
}

export function hasSpeechLevels(locale: string): boolean {
  const def = resolveLocale(locale);
  return Boolean(def && SPEECH_LEVELS[def.code]);
}
