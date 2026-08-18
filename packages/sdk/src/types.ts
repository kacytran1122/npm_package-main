/**
 * Core types for selakata.
 */

/** ISO 3166-1 alpha-2 codes for the 12 countries covered. */
export type CountryCode =
  | "BN" // Brunei Darussalam
  | "KH" // Cambodia
  | "ID" // Indonesia
  | "LA" // Laos
  | "MY" // Malaysia
  | "MM" // Myanmar
  | "PH" // Philippines
  | "SG" // Singapore
  | "TH" // Thailand
  | "TL" // Timor-Leste
  | "VN" // Vietnam
  | "PG"; // Papua New Guinea

/** ISO 15924 script codes used across the region. */
export type ScriptCode =
  | "Latn"
  | "Thai"
  | "Laoo"
  | "Khmr"
  | "Mymr"
  | "Arab"
  | "Hans"
  | "Taml"
  | "Java";

export type Direction = "ltr" | "rtl";

/** CLDR plural categories. Most languages here only use "other". */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/**
 * Politeness level. Mapped to concrete pronouns and particles per language.
 * Javanese speech levels map onto this as ngoko / madya / krama.
 */
export type Register = "formal" | "neutral" | "casual";

/** Needed because Thai, Khmer, and Burmese politeness particles change with the speaker. */
export type SpeakerGender = "male" | "female" | "neutral";

export type SentenceType = "statement" | "question";

/** Semantic buckets for numeral classifiers (measure words). */
export type ClassifierCategory =
  | "person"
  | "animal"
  | "thing"
  | "book"
  | "vehicle"
  | "flat"
  | "long"
  | "round"
  | "building"
  | "plant"
  | "pair"
  | "cloth";

/** Where the numeral and classifier sit relative to the noun. */
export type CountOrder =
  | "noun-num-clf" // Thai, Khmer, Lao, Burmese: "cat 2 CLF"
  | "num-clf-noun" // Vietnamese, Indonesian, Malay: "2 CLF cat"
  | "num-noun"; // English, Tagalog, Tetum: "2 cats"

export interface FontSpec {
  /** CSS font-family stack. */
  family: string;
  /** Google Fonts family name, or null when the system stack is enough. */
  googleFont: string | null;
  weights: number[];
  /**
   * Extra line height. Myanmar, Khmer, Thai, and Lao stack marks above and
   * below the baseline and clip at the usual 1.4.
   */
  lineHeight: number;
}

export interface LocaleDef {
  /** BCP-47 tag, with -x- extensions for code-mixed varieties. */
  code: string;
  name: string;
  nativeName: string;
  /** Countries where this locale is spoken by a meaningful share of users. */
  countries: CountryCode[];
  script: ScriptCode;
  dir: Direction;
  /** Tag safe to hand to the Intl APIs. Code-mixed locales resolve to their base. */
  intlLocale: string;
  numberingSystem: string;
  /** Native digits 0-9, when the script has its own. */
  nativeDigits: string[] | null;
  defaultCurrency: string;
  calendar: "gregory" | "buddhist";
  /** True when the script separates words with spaces. */
  wordSpaced: boolean;
  /** Order of numeral, classifier, and noun in a counted phrase. */
  countOrder: CountOrder;
  /** Politeness levels this language actually distinguishes. */
  registers: Register[];
  /** True for Taglish, Singlish, Manglish, and bahasa gaul. */
  codeMixed: boolean;
  /** Base locale for a code-mixed variety. */
  baseLocale?: string;
  /** Resolution order when a key is missing. Always ends at "en". */
  fallback: string[];
  font: FontSpec;
}

export interface CountryDef {
  code: CountryCode;
  name: string;
  nativeName: string;
  currency: string;
  currencySymbol: string;
  /**
   * Digits people actually type. VND, IDR, KHR, LAK, and MMK are quoted whole
   * even though ISO 4217 assigns two minor units to some of them.
   */
  currencyDecimals: number;
  callingCode: string;
  timeZones: string[];
  defaultLocale: string;
  locales: string[];
  /** Thailand prints Buddhist Era on anything official. */
  defaultCalendar: "gregory" | "buddhist";
  /** 0 is Sunday. */
  firstDayOfWeek: number;
  nameOrder: NameOrder;
  /** True where a legal name is commonly one word with no surname. */
  mononymCommon: boolean;
}

export type NameOrder = "given-family" | "family-given" | "mononym" | "patronymic";

export interface TranslationBundle {
  [key: string]: string | TranslationBundle;
}

export interface FormatOptions {
  /** Render numerals in the native script, e.g. ๑๒๓ for Thai. */
  nativeDigits?: boolean;
  register?: Register;
  speakerGender?: SpeakerGender;
}
