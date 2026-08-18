import { resolveLocale } from "../locales/index.js";
import { foldVietnamese } from "../script/vietnamese.js";
import { normalizeMyanmar } from "../script/zawgyi.js";
import { toLatinDigits } from "../format/digits.js";

/** Thai tone marks and the mai-han-akat family, often dropped when searching. */
const THAI_MARKS = /[\u0E47-\u0E4E]/g;
const LAO_MARKS = /[\u0EC8-\u0ECD]/g;
const KHMER_MARKS = /[\u17C6-\u17D3]/g;

/**
 * Fold a string into a form suitable for search indexes and fuzzy matching.
 *
 * Users type "tieng viet" and expect to find "Tiếng Việt". Thai users type
 * without tone marks. Burmese input arrives in either encoding. This turns all
 * of those into one comparable key.
 *
 * toSearchKey("Tiếng Việt", "vi")   // "tieng viet"
 * toSearchKey("ภาษาไทย", "th")      // "ภาษาไทย" with tone marks removed
 */
export function toSearchKey(text: string, locale = "en"): string {
  const def = resolveLocale(locale);
  let out = text.normalize("NFC");

  switch (def?.script) {
    case "Mymr":
      out = normalizeMyanmar(out).replace(/[\u102B-\u103E]/g, "");
      break;
    case "Thai":
      out = out.replace(THAI_MARKS, "");
      break;
    case "Laoo":
      out = out.replace(LAO_MARKS, "");
      break;
    case "Khmr":
      out = out.replace(KHMER_MARKS, "");
      break;
    default:
      // Latin scripts in the region: Vietnamese needs the đ rule, the rest are
      // handled by plain NFD stripping, which foldVietnamese also does.
      out = foldVietnamese(out);
  }

  return toLatinDigits(out).toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when two strings match after folding. */
export function searchMatches(query: string, candidate: string, locale = "en"): boolean {
  const q = toSearchKey(query, locale);
  return q.length > 0 && toSearchKey(candidate, locale).includes(q);
}
