import type { LocaleDef, PluralCategory, Register, SpeakerGender } from "./types.js";
import { fallbackChain, getLocale, LOCALE_CODES, resolveLocale } from "./locales/index.js";
import { pluralCategory } from "./plural.js";
import { toNativeDigits } from "./format/digits.js";
import { formatCurrency, formatNumber, type CurrencyOptions, type NumberOptions } from "./format/number.js";
import { formatDate, formatRelativeTime, type DateOptions } from "./format/date.js";
import { formatCount, type CountOptions } from "./classifier.js";
import { politeParticle, pronoun, withPoliteness, type Referent } from "./register.js";

const REGISTER_KEYS = new Set<string>(["formal", "neutral", "casual"]);
const PLURAL_KEYS = new Set<string>(["zero", "one", "two", "few", "many", "other"]);

/** A message is a plain string, or variants by register, or by plural category. */
export type Message =
  | string
  | Partial<Record<Register, string | Partial<Record<PluralCategory, string>>>>
  | Partial<Record<PluralCategory, string>>;

export interface Bundle {
  [key: string]: Message | Bundle;
}

export interface I18nOptions {
  locale: string;
  /** Keyed by locale code. Missing locales resolve through the fallback chain. */
  bundles: Record<string, Bundle>;
  /** Default politeness level for messages that define variants. */
  register?: Register;
  /** Needed for Thai, Burmese, and Khmer, where politeness marks the speaker. */
  speakerGender?: SpeakerGender;
  /** Render numerals in the native script by default. */
  nativeDigits?: boolean;
  /** Called when a key is missing from every locale in the chain. */
  onMissing?: (key: string, locale: string) => void;
}

export interface TranslateOptions {
  register?: Register;
  count?: number;
  nativeDigits?: boolean;
  /** Append the language's polite sentence-final particle. */
  polite?: boolean;
  speakerGender?: SpeakerGender;
  /** Value returned when the key is missing everywhere. Defaults to the key. */
  fallback?: string;
}

export type Params = Record<string, string | number>;

function lookup(bundle: Bundle | undefined, key: string): Message | undefined {
  if (!bundle) return undefined;
  if (key in bundle && typeof bundle[key] !== "object") return bundle[key] as Message;

  // Support both flat "a.b.c" keys and nested objects.
  const flat = bundle[key];
  if (flat !== undefined && isMessage(flat)) return flat as Message;

  let node: Bundle | Message | undefined = bundle;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Bundle)[part];
    if (node === undefined) return undefined;
  }
  return isMessage(node) ? (node as Message) : undefined;
}

function isMessage(value: unknown): boolean {
  if (typeof value === "string") return true;
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  return (
    keys.length > 0 &&
    (keys.every((k) => REGISTER_KEYS.has(k)) || keys.every((k) => PLURAL_KEYS.has(k)))
  );
}

function pickRegister(
  message: Message,
  register: Register,
): string | Partial<Record<PluralCategory, string>> | undefined {
  if (typeof message === "string") return message;
  const keys = Object.keys(message);
  if (!keys.some((k) => REGISTER_KEYS.has(k))) {
    return message as Partial<Record<PluralCategory, string>>;
  }
  const table = message as Partial<Record<Register, string>>;
  return table[register] ?? table.neutral ?? table.formal ?? table.casual;
}

function pickPlural(
  value: string | Partial<Record<PluralCategory, string>>,
  count: number | undefined,
  locale: string,
): string | undefined {
  if (typeof value === "string") return value;
  const category = count === undefined ? "other" : pluralCategory(count, locale);
  return value[category] ?? value.other ?? Object.values(value)[0];
}

function interpolate(template: string, params: Params, locale: string, native: boolean): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const raw = params[name];
    if (raw === undefined) return `{${name}}`;
    if (typeof raw === "number") {
      const formatted = formatNumber(raw, locale);
      return native ? toNativeDigits(formatted, locale) : formatted;
    }
    return String(raw);
  });
}

export interface I18n {
  readonly locale: string;
  readonly def: LocaleDef;
  readonly dir: "ltr" | "rtl";
  readonly register: Register;
  t(key: string, params?: Params, opts?: TranslateOptions): string;
  has(key: string): boolean;
  /** Keys defined for the reference locale but missing from this one. */
  missingKeys(reference?: string): string[];
  withLocale(locale: string): I18n;
  withRegister(register: Register): I18n;
  number(value: number, opts?: NumberOptions): string;
  currency(value: number, opts?: CurrencyOptions): string;
  date(value: Date | number | string, opts?: DateOptions): string;
  relativeTime(value: Date | number | string, opts?: Parameters<typeof formatRelativeTime>[2]): string;
  count(n: number, noun: string, opts?: Omit<CountOptions, "locale">): string;
  pronoun(referent?: Referent): string | undefined;
  particle(): string | null;
}

/**
 * Create a translator.
 *
 * const i18n = createI18n({
 *   locale: "vi",
 *   register: "formal",
 *   bundles: {
 *     vi: { greeting: { formal: "Chào quý khách", casual: "Chào bạn" } },
 *     en: { greeting: "Hello" },
 *   },
 * });
 * i18n.t("greeting"); // "Chào quý khách"
 */
export function createI18n(options: I18nOptions): I18n {
  const def = getLocale(options.locale);
  const chain = fallbackChain(def.code);
  const defaultRegister: Register = options.register ?? "neutral";

  const api: I18n = {
    locale: def.code,
    def,
    dir: def.dir,
    register: defaultRegister,

    t(key, params = {}, opts = {}) {
      const register = opts.register ?? defaultRegister;
      const native = opts.nativeDigits ?? options.nativeDigits ?? false;

      for (const tag of chain) {
        const message = lookup(options.bundles[tag], key);
        if (message === undefined) continue;
        const byRegister = pickRegister(message, register);
        if (byRegister === undefined) continue;
        const template = pickPlural(byRegister, opts.count, tag);
        if (template === undefined) continue;

        const withCount =
          opts.count === undefined ? params : { count: opts.count, ...params };
        let out = interpolate(template, withCount, def.code, native);
        if (native) out = toNativeDigits(out, def.code);
        if (opts.polite) {
          out = withPoliteness(out, def.code, {
            speakerGender: opts.speakerGender ?? options.speakerGender,
          });
        }
        return out;
      }

      options.onMissing?.(key, def.code);
      return opts.fallback ?? key;
    },

    has(key) {
      return chain.some((tag) => lookup(options.bundles[tag], key) !== undefined);
    },

    missingKeys(reference = "en") {
      const source = flatten(options.bundles[reference] ?? {});
      return source.filter((key) => lookup(options.bundles[def.code], key) === undefined);
    },

    withLocale(locale) {
      return createI18n({ ...options, locale });
    },

    withRegister(register) {
      return createI18n({ ...options, register });
    },

    number: (value, opts = {}) =>
      formatNumber(value, def.code, { nativeDigits: options.nativeDigits, ...opts }),

    currency: (value, opts = {}) =>
      formatCurrency(value, def.code, { nativeDigits: options.nativeDigits, ...opts }),

    date: (value, opts = {}) =>
      formatDate(value, def.code, { nativeDigits: options.nativeDigits, ...opts }),

    relativeTime: (value, opts = {}) => formatRelativeTime(value, def.code, opts),

    count: (n, noun, opts = {}) =>
      formatCount(n, noun, {
        locale: def.code,
        nativeDigits: options.nativeDigits,
        ...opts,
      }),

    pronoun: (referent = "you") =>
      pronoun(def.code, referent, {
        register: defaultRegister,
        speakerGender: options.speakerGender,
      }),

    particle: () =>
      politeParticle(def.code, { speakerGender: options.speakerGender }),
  };

  return api;
}

/** Flatten a nested bundle into dotted keys. */
export function flatten(bundle: Bundle, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(bundle)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isMessage(value)) out.push(path);
    else if (typeof value === "object" && value !== null) {
      out.push(...flatten(value as Bundle, path));
    }
  }
  return out;
}

/**
 * Coverage report across every locale in a bundle set. Useful in CI.
 */
export function coverage(
  bundles: Record<string, Bundle>,
  reference = "en",
): Record<string, { total: number; translated: number; missing: string[] }> {
  const keys = flatten(bundles[reference] ?? {});
  const report: Record<string, { total: number; translated: number; missing: string[] }> = {};

  for (const locale of Object.keys(bundles)) {
    if (locale === reference) continue;
    const missing = keys.filter((k) => lookup(bundles[locale], k) === undefined);
    report[locale] = {
      total: keys.length,
      translated: keys.length - missing.length,
      missing,
    };
  }
  return report;
}

/** Every locale this package knows about, for building a language switcher. */
export function supportedLocales(): LocaleDef[] {
  return LOCALE_CODES.map((c) => resolveLocale(c)!).filter(Boolean);
}
