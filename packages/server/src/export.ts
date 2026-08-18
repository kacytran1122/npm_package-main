/**
 * Exporters.
 *
 * Mobile teams do not consume a JSON API, they consume platform resource
 * files. Escaping rules differ per format and getting them wrong corrupts a
 * build, so each one is handled explicitly.
 */

import type { Key } from "./store.js";

export type ExportFormat = "json" | "csv" | "android" | "ios";

function valueFor(key: Key, locale: string, register: string): string {
  const table = key.values[locale];
  if (!table) return "";
  return table[register] ?? table.neutral ?? table.formal ?? table.casual ?? "";
}

/** RFC 4180: wrap in quotes when needed, and double any inner quote. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(keys: Key[], locales: string[], register: string): string {
  const header = ["key", "description", ...locales].map(csvCell).join(",");
  const rows = keys.map((k) =>
    [
      csvCell(k.name),
      csvCell(k.description ?? ""),
      ...locales.map((l) => csvCell(valueFor(k, l, register))),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

/**
 * Android strings.xml.
 *
 * Apostrophes and quotes must be backslash-escaped or aapt fails the build,
 * and `%` has to be doubled unless it is a positional format specifier.
 */
export function toAndroidXml(keys: Key[], locale: string, register: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/%(?![\d$sd])/g, "%%");

  const entries = keys
    .map((k) => {
      const value = valueFor(k, locale, register);
      if (!value) return null;
      // Android resource names allow only word characters.
      const name = k.name.replace(/[^A-Za-z0-9_]/g, "_");
      return `    <string name="${name}">${escape(value)}</string>`;
    })
    .filter(Boolean);

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<resources>",
    ...entries,
    "</resources>",
    "",
  ].join("\n");
}

/** iOS Localizable.strings, UTF-8 with escaped quotes and newlines. */
export function toIosStrings(keys: Key[], locale: string, register: string): string {
  const escape = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

  return (
    keys
      .map((k) => {
        const value = valueFor(k, locale, register);
        if (!value) return null;
        const comment = k.description ? `/* ${k.description.replace(/\*\//g, "")} */\n` : "";
        return `${comment}"${escape(k.name)}" = "${escape(value)}";`;
      })
      .filter(Boolean)
      .join("\n") + "\n"
  );
}

/** Nested JSON, so `cart.title` becomes { cart: { title: ... } }. */
export function toJson(keys: Key[], locale: string, register: string): string {
  const out: Record<string, any> = {};
  for (const key of keys) {
    const value = valueFor(key, locale, register);
    if (!value) continue;
    const parts = key.name.split(".");
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      // A leaf already sitting where a branch needs to go would be silently
      // overwritten, so skip rather than corrupt the tree.
      if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) {
        if (node[parts[i]] !== undefined) break;
        node[parts[i]] = {};
      }
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }
  return JSON.stringify(out, null, 2);
}

export function exportKeys(
  format: ExportFormat,
  keys: Key[],
  locales: string[],
  register: string,
): { body: string; contentType: string; filename: string } {
  switch (format) {
    case "csv":
      return {
        body: toCsv(keys, locales, register),
        contentType: "text/csv; charset=utf-8",
        filename: `translations-${register}.csv`,
      };
    case "android":
      return {
        body: toAndroidXml(keys, locales[0], register),
        contentType: "application/xml; charset=utf-8",
        filename: `strings-${locales[0]}.xml`,
      };
    case "ios":
      return {
        body: toIosStrings(keys, locales[0], register),
        contentType: "text/plain; charset=utf-8",
        filename: `Localizable-${locales[0]}.strings`,
      };
    default:
      return {
        body: toJson(keys, locales[0], register),
        contentType: "application/json; charset=utf-8",
        filename: `${locales[0]}.json`,
      };
  }
}
