import { resolveLocale } from "../locales/index.js";

const LATIN = "0123456789";

/**
 * Rewrite ASCII digits into the locale's native numerals.
 * Returns the input unchanged for locales that use Latin digits.
 *
 * toNativeDigits("2569", "th") // "๒๕๖๙"
 */
export function toNativeDigits(input: string, locale: string): string {
  const def = resolveLocale(locale);
  if (!def?.nativeDigits) return input;
  const digits = def.nativeDigits;
  return input.replace(/[0-9]/g, (d) => digits[Number(d)]);
}

/**
 * Rewrite native numerals from any supported script back to ASCII.
 * Useful for parsing form input, where users mix Thai and Latin digits freely.
 */
export function toLatinDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    const mapped = latinize(code);
    out += mapped ?? ch;
  }
  return out;
}

function latinize(code: number): string | null {
  const ranges: [number, number][] = [
    [0x0e50, 0x0e59], // Thai
    [0x0ed0, 0x0ed9], // Lao
    [0x17e0, 0x17e9], // Khmer
    [0x1040, 0x1049], // Myanmar
    [0x1090, 0x1099], // Shan
    [0xa9d0, 0xa9d9], // Javanese
    [0x0be6, 0x0bef], // Tamil
    [0x0660, 0x0669], // Arabic-Indic
    [0xff10, 0xff19], // Fullwidth
  ];
  for (const [start, end] of ranges) {
    if (code >= start && code <= end) return LATIN[code - start];
  }
  return null;
}

/** True when the string contains numerals from a non-Latin script. */
export function hasNativeDigits(input: string): boolean {
  return toLatinDigits(input) !== input;
}
