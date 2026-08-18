import type { Bundle } from "./core.js";
import { flatten } from "./core.js";
import { resolveLocale } from "./locales/index.js";
import { detectMyanmarEncoding } from "./script/zawgyi.js";
import { hasGrammaticalNumber } from "./plural.js";

export interface LintIssue {
  locale: string;
  key: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
}

const PLACEHOLDER = /\{(\w+)\}/g;

function stringsOf(bundle: Bundle): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const key of flatten(bundle)) {
    const values: string[] = [];
    collect(resolveNode(bundle, key), values);
    out.set(key, values);
  }
  return out;
}

/**
 * Find the message at a dotted key.
 *
 * Bundles arrive both ways: nested from a hand-written JSON file, and flat
 * with dotted names from the API, which stores "cart.title" as a single key.
 * Walking the path alone silently found nothing in the flat case, which left
 * every rule with no strings to check.
 */
function resolveNode(bundle: Bundle, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(bundle, key)) {
    return (bundle as Record<string, unknown>)[key];
  }

  let node: unknown = bundle;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
    if (node === undefined) return undefined;
  }
  return node;
}

/** Every string in a message: a bare one, or each register or plural variant. */
function collect(node: unknown, out: string[]): void {
  if (typeof node === "string") out.push(node);
  else if (typeof node === "object" && node !== null) {
    for (const v of Object.values(node)) collect(v, out);
  }
}

/**
 * Check one locale's bundle for problems specific to this region.
 *
 * Rules cover the mistakes that survive review because the reviewer cannot
 * read the script: Zawgyi-encoded Burmese, Thai copy that silently assigns a
 * gender to your product's voice, counted phrases with no classifier, and
 * Vietnamese stored in a decomposed form that will not match on search.
 */
export function lintBundle(
  locale: string,
  bundle: Bundle,
  reference?: Bundle,
): LintIssue[] {
  const def = resolveLocale(locale);
  const issues: LintIssue[] = [];
  if (!def) return issues;

  const entries = stringsOf(bundle);
  const refEntries = reference ? stringsOf(reference) : undefined;

  const push = (
    key: string,
    rule: string,
    severity: LintIssue["severity"],
    message: string,
  ) => issues.push({ locale, key, rule, severity, message });

  for (const [key, values] of entries) {
    for (const value of values) {
      if (value.trim() === "") {
        push(key, "empty-value", "error", "Value is empty.");
        continue;
      }

      // Burmese encoding.
      if (def.script === "Mymr") {
        const result = detectMyanmarEncoding(value);
        if (result.encoding === "zawgyi") {
          push(
            key,
            "zawgyi-encoding",
            "error",
            `Value looks like Zawgyi, not Unicode (${result.signals[0]}). It will render as garbage for most users.`,
          );
        }
      }

      // Vietnamese normalization.
      if (def.code === "vi" && value !== value.normalize("NFC")) {
        push(
          key,
          "vietnamese-nfc",
          "error",
          "Value is not in NFC form, so it will not compare or sort correctly.",
        );
      }

      // Thai politeness particles fix your product's apparent gender.
      if (def.code === "th" && /(ครับ|ค่ะ|คะ)\s*$/.test(value)) {
        push(
          key,
          "gendered-particle",
          "warning",
          "Hardcoded Thai polite particle. This makes your product speak as a specific gender. Use withPoliteness() so it stays configurable.",
        );
      }

      // English-style plural hacks in languages with no grammatical number.
      if (!hasGrammaticalNumber(def.code) && /\(s\)|\(es\)/i.test(value)) {
        push(
          key,
          "hardcoded-plural",
          "warning",
          `${def.name} has no grammatical number. "(s)" is meaningless here.`,
        );
      }

      // Counted phrases without a classifier.
      if (def.countOrder !== "num-noun" && /\{count\}\s*\S/.test(value)) {
        push(
          key,
          "missing-classifier",
          "warning",
          `${def.name} needs a numeral classifier between the count and the noun. Use formatCount() instead of interpolating.`,
        );
      }

      // Long unspaced strings overflow their container.
      if (!def.wordSpaced && value.length > 40 && !/[\s\u200B]/.test(value)) {
        push(
          key,
          "no-break-opportunity",
          "warning",
          "Long string in an unspaced script with no break opportunity. It will overflow. Use insertLineBreakOpportunities().",
        );
      }

      // Wrong currency symbol baked into copy.
      if (/[$€£]/.test(value) && def.defaultCurrency !== "USD") {
        push(
          key,
          "hardcoded-currency",
          "warning",
          `Hardcoded currency symbol in a ${def.defaultCurrency} locale. Use formatCurrency().`,
        );
      }
    }

    // Placeholder drift against the reference locale.
    if (refEntries?.has(key)) {
      const expected = new Set(
        [...(refEntries.get(key)![0] ?? "").matchAll(PLACEHOLDER)].map((m) => m[1]),
      );
      for (const value of values) {
        const actual = new Set([...value.matchAll(PLACEHOLDER)].map((m) => m[1]));
        for (const name of expected) {
          if (!actual.has(name)) {
            push(
              key,
              "missing-placeholder",
              "error",
              `Missing placeholder {${name}} present in the source string.`,
            );
          }
        }
        for (const name of actual) {
          if (!expected.has(name)) {
            push(key, "unknown-placeholder", "error", `Unknown placeholder {${name}}.`);
          }
        }
      }
    }
  }

  // Untranslated keys.
  if (refEntries) {
    for (const [key, refValues] of refEntries) {
      const values = entries.get(key);
      if (!values) {
        push(key, "missing-key", "error", "Key is missing from this locale.");
      } else if (
        def.code !== "en" &&
        values[0] !== undefined &&
        values[0] === refValues[0] &&
        values[0].length > 3
      ) {
        push(key, "untranslated", "warning", "Value is identical to the source string.");
      }
    }
  }

  return issues;
}

/** Lint every locale in a bundle set against a reference locale. */
export function lintBundles(
  bundles: Record<string, Bundle>,
  reference = "en",
): LintIssue[] {
  const ref = bundles[reference];
  return Object.entries(bundles)
    .filter(([locale]) => locale !== reference)
    .flatMap(([locale, bundle]) => lintBundle(locale, bundle, ref));
}
