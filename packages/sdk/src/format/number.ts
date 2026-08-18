import { getCountry, resolveLocale } from "../locales/index.js";
import { toNativeDigits } from "./digits.js";

/**
 * Currencies people quote whole, regardless of what ISO 4217 says about minor
 * units. Nobody writes 1.500.000,00 ₫ on a receipt.
 */
const WHOLE_UNIT_CURRENCIES = new Set(["VND", "IDR", "KHR", "LAK", "MMK"]);

export interface NumberOptions extends Intl.NumberFormatOptions {
  /** Render the result in the locale's native numerals. */
  nativeDigits?: boolean;
}

const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

export function formatNumber(value: number, locale: string, opts: NumberOptions = {}): string {
  const def = resolveLocale(locale);
  const { nativeDigits, ...intlOpts } = opts;
  const out = formatter(def?.intlLocale ?? locale, intlOpts).format(value);
  return nativeDigits ? toNativeDigits(out, locale) : out;
}

export interface CurrencyOptions extends NumberOptions {
  currency?: string;
  /** "symbol" (₫), "code" (VND), "name" (Vietnamese dong), or "narrowSymbol". */
  display?: "symbol" | "narrowSymbol" | "code" | "name";
}

/**
 * Format money for the region.
 *
 * formatCurrency(1500000, "vi")            // "1.500.000 ₫"
 * formatCurrency(1500000, "id")            // "Rp 1.500.000"
 * formatCurrency(2500, "th", { nativeDigits: true }) // "฿๒,๕๐๐.๐๐"
 */
export function formatCurrency(
  value: number,
  locale: string,
  opts: CurrencyOptions = {},
): string {
  const def = resolveLocale(locale);
  const currency = opts.currency ?? def?.defaultCurrency ?? "USD";
  const whole = WHOLE_UNIT_CURRENCIES.has(currency);
  const { nativeDigits, display, currency: _c, ...rest } = opts;

  return formatNumber(value, locale, {
    style: "currency",
    currency,
    currencyDisplay: display ?? "symbol",
    minimumFractionDigits: whole ? 0 : undefined,
    maximumFractionDigits: whole ? 0 : undefined,
    ...rest,
    nativeDigits,
  });
}

/** Minor units a currency is actually quoted in across the region. */
export function currencyDecimals(currency: string): number {
  return WHOLE_UNIT_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

/** Format money using a country's currency rather than a locale's default. */
export function formatCurrencyForCountry(
  value: number,
  country: string,
  locale?: string,
  opts: CurrencyOptions = {},
): string {
  const c = getCountry(country);
  if (!c) throw new Error(`selakata: unknown country "${country}"`);
  return formatCurrency(value, locale ?? c.defaultLocale, { ...opts, currency: c.currency });
}

export function formatPercent(value: number, locale: string, opts: NumberOptions = {}): string {
  return formatNumber(value, locale, { style: "percent", ...opts });
}

/**
 * Compact notation, e.g. "1,5 jt" in Indonesian or "1.5M" in English.
 * Indonesian, Vietnamese, and Thai all have their own compact forms in CLDR.
 */
export function formatCompact(value: number, locale: string, opts: NumberOptions = {}): string {
  return formatNumber(value, locale, { notation: "compact", ...opts });
}

/**
 * Parse a locale-formatted number back to a JS number. Handles the dot-as-
 * thousands convention used in Vietnamese and Indonesian, and native digits.
 *
 * parseNumber("1.500.000", "vi") // 1500000
 * parseNumber("๑,๒๓๔.๕", "th")   // 1234.5
 */
export function parseNumber(input: string, locale: string): number {
  const def = resolveLocale(locale);
  const intlLocale = def?.intlLocale ?? locale;
  const parts = new Intl.NumberFormat(intlLocale).formatToParts(12345.6);
  const group = parts.find((p) => p.type === "group")?.value ?? ",";
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";

  // Import lazily to keep the digit table in one place.
  const latin = stripNative(input);
  const cleaned = latin
    .split(group)
    .join("")
    .replace(decimal, ".")
    .replace(/[^0-9.\-]/g, "");
  return Number.parseFloat(cleaned);
}

function stripNative(input: string): string {
  // Local copy avoids a circular import at module init.
  const ranges: [number, number][] = [
    [0x0e50, 0x0e59],
    [0x0ed0, 0x0ed9],
    [0x17e0, 0x17e9],
    [0x1040, 0x1049],
    [0x1090, 0x1099],
    [0xa9d0, 0xa9d9],
    [0x0be6, 0x0bef],
    [0x0660, 0x0669],
    [0xff10, 0xff19],
  ];
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    let mapped: string | null = null;
    for (const [s, e] of ranges) {
      if (code >= s && code <= e) {
        mapped = String(code - s);
        break;
      }
    }
    out += mapped ?? ch;
  }
  return out;
}
