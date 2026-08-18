import { getCountry, resolveLocale } from "../locales/index.js";
import { toNativeDigits } from "./digits.js";

/** Thai Buddhist Era runs 543 years ahead of the Common Era. */
export const BUDDHIST_ERA_OFFSET = 543;

export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + BUDDHIST_ERA_OFFSET;
}

export function fromBuddhistYear(buddhistYear: number): number {
  return buddhistYear - BUDDHIST_ERA_OFFSET;
}

export interface DateOptions extends Intl.DateTimeFormatOptions {
  nativeDigits?: boolean;
  /** Overrides the locale default. Thai defaults to "buddhist". */
  calendar?: "gregory" | "buddhist";
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

/**
 * Format a date for the locale.
 *
 * Thai output uses Buddhist Era by default, because that is what appears on
 * every Thai form, receipt, and government page.
 *
 * formatDate(new Date("2026-08-18"), "th", { dateStyle: "long" })
 *   // "18 สิงหาคม 2569"
 * formatDate(new Date("2026-08-18"), "th", { dateStyle: "long", calendar: "gregory" })
 *   // "18 สิงหาคม 2026"
 */
export function formatDate(
  date: Date | number | string,
  locale: string,
  opts: DateOptions = {},
): string {
  const def = resolveLocale(locale);
  const { nativeDigits, calendar, ...intlOpts } = opts;
  const cal = calendar ?? def?.calendar ?? "gregory";

  // Pin the calendar either way. CLDR already defaults th-TH to Buddhist, so
  // asking for Gregorian has to be explicit or the override silently does
  // nothing.
  const tag = withCalendar(def?.intlLocale ?? locale, cal);

  const value = date instanceof Date ? date : new Date(date);
  const out = formatter(tag, { dateStyle: "medium", ...intlOpts }).format(value);
  return nativeDigits ? toNativeDigits(out, locale) : out;
}

function withCalendar(tag: string, calendar: string): string {
  return tag.includes("-u-") ? `${tag}-ca-${calendar}` : `${tag}-u-ca-${calendar}`;
}

/**
 * Format a date in a country's default time zone and calendar. Indonesia spans
 * three zones, so the first is used unless you pass one.
 */
export function formatDateForCountry(
  date: Date | number | string,
  country: string,
  opts: DateOptions & { locale?: string; timeZone?: string } = {},
): string {
  const c = getCountry(country);
  if (!c) throw new Error(`selakata: unknown country "${country}"`);
  const { locale, timeZone, ...rest } = opts;
  return formatDate(date, locale ?? c.defaultLocale, {
    calendar: c.defaultCalendar,
    timeZone: timeZone ?? c.timeZones[0],
    ...rest,
  });
}

export function formatTime(
  date: Date | number | string,
  locale: string,
  opts: DateOptions = {},
): string {
  return formatDate(date, locale, { dateStyle: undefined, timeStyle: "short", ...opts });
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

/**
 * "3 ngày trước", "3 วันที่แล้ว", "3 hari yang lalu".
 */
export function formatRelativeTime(
  date: Date | number | string,
  locale: string,
  opts: Intl.RelativeTimeFormatOptions & { now?: Date; nativeDigits?: boolean } = {},
): string {
  const def = resolveLocale(locale);
  const { now, nativeDigits, ...rest } = opts;
  const target = date instanceof Date ? date : new Date(date);
  const diff = target.getTime() - (now ?? new Date()).getTime();

  let unit: Intl.RelativeTimeFormatUnit = "second";
  let value = 0;
  for (const [u, ms] of UNITS) {
    if (Math.abs(diff) >= ms || u === "second") {
      unit = u;
      value = Math.round(diff / ms);
      break;
    }
  }

  const rtf = new Intl.RelativeTimeFormat(def?.intlLocale ?? locale, {
    numeric: "auto",
    ...rest,
  });
  const out = rtf.format(value, unit);
  return nativeDigits ? toNativeDigits(out, locale) : out;
}

/** Week start differs across the region: Sunday in Thailand, Monday in Vietnam. */
export function firstDayOfWeek(country: string): number {
  return getCountry(country)?.firstDayOfWeek ?? 1;
}
