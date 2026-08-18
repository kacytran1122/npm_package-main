import type { ClassifierCategory, CountOrder } from "./types.js";
import { fallbackChain, resolveLocale } from "./locales/index.js";
import { toNativeDigits } from "./format/digits.js";
import { formatNumber } from "./format/number.js";

/**
 * Numeral classifiers, also called measure words.
 *
 * You cannot say "2 cats" in Vietnamese, Thai, Khmer, Lao, or Burmese. You say
 * the equivalent of "2 CLF cat" or "cat 2 CLF", where the classifier depends on
 * what kind of thing the noun is. Interpolating a number straight into a string
 * produces text that reads as broken to a native speaker, which is the most
 * common way a translated app gives itself away.
 */
export const CLASSIFIERS: Record<string, Partial<Record<ClassifierCategory, string>>> = {
  vi: {
    person: "người",
    animal: "con",
    thing: "cái",
    book: "quyển",
    vehicle: "chiếc",
    flat: "tờ",
    long: "cây",
    round: "quả",
    building: "ngôi",
    plant: "cây",
    pair: "đôi",
    cloth: "tấm",
  },
  th: {
    person: "คน",
    animal: "ตัว",
    thing: "อัน",
    book: "เล่ม",
    vehicle: "คัน",
    flat: "แผ่น",
    long: "แท่ง",
    round: "ลูก",
    building: "หลัง",
    plant: "ต้น",
    pair: "คู่",
    cloth: "ผืน",
  },
  km: {
    person: "នាក់",
    animal: "ក្បាល",
    thing: "ដុំ",
    book: "ក្បាល",
    vehicle: "គ្រឿង",
    flat: "សន្លឹក",
    long: "ដើម",
    round: "គ្រាប់",
    building: "ខ្នង",
    plant: "ដើម",
    pair: "គូ",
    cloth: "ផ្ទាំង",
  },
  lo: {
    person: "ຄົນ",
    animal: "ໂຕ",
    thing: "ອັນ",
    book: "ຫົວ",
    vehicle: "ຄັນ",
    flat: "ແຜ່ນ",
    long: "ທ່ອນ",
    round: "ໜ່ວຍ",
    building: "ຫຼັງ",
    plant: "ຕົ້ນ",
    pair: "ຄູ່",
    cloth: "ຜືນ",
  },
  my: {
    person: "ယောက်",
    animal: "ကောင်",
    thing: "ခု",
    book: "အုပ်",
    vehicle: "စီး",
    flat: "ရွက်",
    long: "ချောင်း",
    round: "လုံး",
    building: "ဆောင်",
    plant: "ပင်",
    pair: "စုံ",
    cloth: "ထည်",
  },
  id: {
    person: "orang",
    animal: "ekor",
    thing: "buah",
    book: "buah",
    vehicle: "buah",
    flat: "lembar",
    long: "batang",
    round: "butir",
    building: "buah",
    plant: "batang",
    pair: "pasang",
    cloth: "helai",
  },
  ms: {
    person: "orang",
    animal: "ekor",
    thing: "buah",
    book: "buah",
    vehicle: "buah",
    flat: "helai",
    long: "batang",
    round: "biji",
    building: "buah",
    plant: "batang",
    pair: "pasang",
    cloth: "helai",
  },
  "zh-Hans-SG": {
    person: "位",
    animal: "只",
    thing: "个",
    book: "本",
    vehicle: "辆",
    flat: "张",
    long: "条",
    round: "颗",
    building: "座",
    plant: "棵",
    pair: "双",
    cloth: "块",
  },
};

/**
 * The classifier for a category, walking the locale's fallback chain.
 * Javanese and Sundanese inherit Indonesian, Shan inherits Burmese.
 */
export function classifierFor(
  locale: string,
  category: ClassifierCategory,
): string | undefined {
  for (const tag of fallbackChain(locale)) {
    const hit = CLASSIFIERS[tag]?.[category];
    if (hit) return hit;
  }
  return undefined;
}

/** True when the language requires a classifier in counted phrases. */
export function usesClassifiers(locale: string): boolean {
  return resolveLocale(locale)?.countOrder !== "num-noun";
}

/** Where the numeral and classifier sit relative to the noun. */
export function countOrder(locale: string): CountOrder {
  return resolveLocale(locale)?.countOrder ?? "num-noun";
}

export interface CountOptions {
  locale: string;
  category?: ClassifierCategory;
  /** Overrides the table, for nouns with an idiosyncratic classifier. */
  classifier?: string;
  nativeDigits?: boolean;
  /** Group the numeral, e.g. 10.000 rather than 10000. */
  groupDigits?: boolean;
}

/**
 * Build a grammatical counted phrase.
 *
 * formatCount(2, "mèo", { locale: "vi", category: "animal" })  // "2 con mèo"
 * formatCount(2, "แมว", { locale: "th", category: "animal" })  // "แมว 2 ตัว"
 * formatCount(3, "libro", { locale: "fil" })                   // "3 na libro"
 * formatCount(3, "buku", { locale: "id", category: "book" })   // "3 buah buku"
 */
export function formatCount(count: number, noun: string, opts: CountOptions): string {
  const { locale, category = "thing", classifier, nativeDigits, groupDigits } = opts;
  const def = resolveLocale(locale);
  const order = def?.countOrder ?? "num-noun";

  let num = groupDigits ? formatNumber(count, locale) : String(count);
  if (nativeDigits) num = toNativeDigits(num, locale);

  if (order === "num-noun") {
    // Filipino and Cebuano insert a linker between numeral and noun.
    if (def?.code === "fil" || def?.code === "ceb" || def?.baseLocale === "fil") {
      return `${num} na ${noun}`;
    }
    return `${num} ${noun}`;
  }

  const clf = classifier ?? classifierFor(locale, category);
  if (!clf) return order === "noun-num-clf" ? `${noun} ${num}` : `${num} ${noun}`;

  // Chinese writes the whole phrase without spaces.
  const join = def?.wordSpaced === false && def.script === "Hans" ? "" : " ";

  return order === "noun-num-clf"
    ? [noun, num, clf].join(join)
    : [num, clf, noun].join(join);
}
