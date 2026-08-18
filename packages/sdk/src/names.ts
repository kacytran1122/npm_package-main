import type { NameOrder } from "./types.js";
import { getCountry } from "./locales/index.js";

/**
 * Name shapes across the region.
 *
 * A single "First name / Last name" form locks out a large share of the
 * region's users. Burmese names have no family name at all: Aung San Suu Kyi
 * is one indivisible name, not three. Many Indonesians are legally mononymous.
 * Vietnamese and Khmer names put the family name first. Malay and Bruneian
 * names are patronymic, built with bin or binti rather than an inherited
 * surname.
 */

export interface PersonName {
  /** The whole legal name. The only field guaranteed to exist. */
  full?: string;
  given?: string;
  middle?: string;
  family?: string;
  /** Malay and Bruneian patronymic connector: "bin", "binti", "a/l", "a/p". */
  patronymic?: string;
  /** Thai users are routinely addressed by a short nickname instead. */
  nickname?: string;
}

export interface NameFieldSpec {
  key: keyof PersonName;
  label: string;
  required: boolean;
  hint?: string;
}

/**
 * The form fields a country's names actually need, in display order.
 *
 * nameFields("MM") // one required "Name" field, no surname
 * nameFields("VN") // family name first, then given name
 */
export function nameFields(country: string): NameFieldSpec[] {
  const c = getCountry(country);
  const order: NameOrder = c?.nameOrder ?? "given-family";

  if (order === "mononym") {
    return [
      {
        key: "full",
        label: "Name",
        required: true,
        hint: "Burmese names are a single unit with no family name.",
      },
    ];
  }

  if (order === "patronymic") {
    return [
      { key: "given", label: "Name", required: true },
      { key: "patronymic", label: "bin / binti", required: false },
      { key: "family", label: "Father's name", required: false },
    ];
  }

  if (order === "family-given") {
    return [
      { key: "family", label: "Family name", required: true },
      { key: "middle", label: "Middle name", required: false },
      { key: "given", label: "Given name", required: true },
    ];
  }

  return [
    { key: "given", label: "Given name", required: true },
    { key: "middle", label: "Middle name", required: false },
    {
      key: "family",
      label: "Family name",
      // A single legal name is common in Indonesia, so never force this.
      required: !(c?.mononymCommon ?? false),
    },
  ];
}

/**
 * Assemble a display name in the country's conventional order.
 *
 * formatName({ family: "Nguyễn", middle: "Văn", given: "An" }, "VN")
 *   // "Nguyễn Văn An"
 * formatName({ given: "Ahmad", patronymic: "bin", family: "Ismail" }, "MY")
 *   // "Ahmad bin Ismail"
 */
export function formatName(name: PersonName, country: string): string {
  const c = getCountry(country);
  const order: NameOrder = c?.nameOrder ?? "given-family";

  if (name.full && (order === "mononym" || !name.given)) return name.full.trim();

  const parts =
    order === "family-given"
      ? [name.family, name.middle, name.given]
      : order === "patronymic"
        ? [name.given, name.patronymic, name.family]
        : [name.given, name.middle, name.family];

  return parts.filter(Boolean).join(" ").trim();
}

/**
 * How to address someone in conversation. Thai users go by nickname, Burmese by
 * their whole indivisible name, and everyone else by the given name — including
 * Vietnamese and Khmer speakers, who write the family name first regardless.
 */
export function shortName(name: PersonName, country: string): string {
  const c = getCountry(country);
  if (country.toUpperCase() === "TH" && name.nickname) return name.nickname;
  if (c?.nameOrder === "mononym") return name.full ?? name.given ?? "";
  // Everywhere else in the region people are addressed by the given name,
  // including Vietnam and Cambodia, where the family name comes first in
  // writing but is never what you call someone.
  return name.given ?? name.full ?? "";
}

/** True when the country commonly has legally mononymous citizens. */
export function allowsMononym(country: string): boolean {
  const c = getCountry(country);
  return Boolean(c && (c.mononymCommon || c.nameOrder === "mononym"));
}

/**
 * Validate a name for a country without assuming a surname exists.
 * Returns a list of problems, empty when the name is acceptable.
 */
export function validateName(name: PersonName, country: string): string[] {
  const problems: string[] = [];
  const empty = nameFields(country).filter(
    (f) => f.required && !String(name[f.key] ?? "").trim(),
  );
  for (const f of empty) problems.push(`${f.label} is required`);
  // Backstop for an unknown country, whose fields we had to guess. Only fires
  // when no required field already reported itself, so nothing repeats.
  if (problems.length === 0 && !name.full && !name.given && !name.family) {
    problems.push("Name is required");
  }
  return problems;
}
