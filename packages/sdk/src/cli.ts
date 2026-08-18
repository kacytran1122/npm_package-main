#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { lintBundles, type LintIssue } from "./lint.js";
import { type Bundle } from "./core.js";
import { readinessFromBundles, type LocaleReadiness } from "./readiness.js";
import { COUNTRIES, LOCALES, localesForCountry } from "./locales/index.js";
import { fontLinkHref } from "./fonts.js";

const args = process.argv.slice(2);
const command = args[0];

function flag(name: string, fallback?: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

function loadBundles(dir: string): Record<string, Bundle> {
  const bundles: Record<string, Bundle> = {};
  if (!existsSync(dir)) {
    console.error(`sela: no locales directory at ${dir}`);
    process.exit(1);
  }
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const locale = file.replace(/\.json$/, "");
    bundles[locale] = JSON.parse(readFileSync(join(dir, file), "utf8"));
  }
  return bundles;
}

function cmdInit(): void {
  const country = (flag("country") ?? "VN").toUpperCase();
  const dir = resolve(flag("dir") ?? "locales");
  const locales = localesForCountry(country);

  if (locales.length === 0) {
    console.error(`sela: unknown country "${country}"`);
    console.error(`Known: ${Object.keys(COUNTRIES).join(", ")}`);
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  const starter = {
    app: { name: "My App", tagline: "Welcome" },
    action: { save: "Save", cancel: "Cancel" },
  };

  for (const locale of locales) {
    const path = join(dir, `${locale}.json`);
    if (existsSync(path)) continue;
    writeFileSync(path, JSON.stringify(locale === "en" ? starter : {}, null, 2) + "\n");
  }
  if (!existsSync(join(dir, "en.json"))) {
    writeFileSync(join(dir, "en.json"), JSON.stringify(starter, null, 2) + "\n");
  }

  const config = {
    country,
    defaultLocale: COUNTRIES[country as keyof typeof COUNTRIES].defaultLocale,
    locales,
    localesDir: "locales",
    reference: "en",
  };
  writeFileSync("sela.config.json", JSON.stringify(config, null, 2) + "\n");

  console.log(`Created ${dir} with ${locales.length} locale files.`);
  console.log(`Font link for these scripts:\n  ${fontLinkHref(locales)}`);
}

function cmdLint(): void {
  const dir = resolve(flag("dir") ?? "locales");
  const reference = flag("reference") ?? "en";
  const strict = args.includes("--strict");
  const issues = lintBundles(loadBundles(dir), reference);

  if (issues.length === 0) {
    console.log("No issues found.");
    return;
  }

  const byLocale = new Map<string, LintIssue[]>();
  for (const issue of issues) {
    const list = byLocale.get(issue.locale) ?? [];
    list.push(issue);
    byLocale.set(issue.locale, list);
  }

  for (const [locale, list] of byLocale) {
    console.log(`\n${locale} (${LOCALES[locale]?.name ?? "unknown"})`);
    for (const issue of list) {
      const tag = issue.severity === "error" ? "error" : "warn ";
      console.log(`  ${tag}  ${issue.key}  [${issue.rule}]`);
      console.log(`         ${issue.message}`);
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  console.log(`\n${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0 || (strict && warnings > 0)) process.exit(1);
}

function cmdReadiness(): void {
  const dir = resolve(flag("dir") ?? "locales");
  const reference = flag("reference") ?? "en";
  const threshold = Number(flag("threshold") ?? "75");
  const verbose = args.includes("--verbose");

  const report = readinessFromBundles(loadBundles(dir), reference, threshold);

  const line = (l: LocaleReadiness) => {
    const bar = "#".repeat(Math.round(l.score / 5)).padEnd(20, ".");
    const name = (LOCALES[l.locale]?.nativeName ?? l.locale).padEnd(18);
    return `${l.locale.padEnd(18)} ${name} ${bar} ${String(l.score).padStart(3)}  ${l.grade}`;
  };

  // Worst first: the top of this list is the work queue.
  for (const locale of report.locales) {
    console.log(line(locale));
    if (locale.topDrag) {
      console.log(`${" ".repeat(39)}${locale.topDrag.label}: ${locale.topDrag.detail}`);
    }
    if (verbose) {
      for (const f of locale.facets) {
        const pct = String(Math.round(f.score * 100)).padStart(3);
        console.log(
          `${" ".repeat(39)}  ${f.label.padEnd(15)} ${pct}%  x${f.weight.toFixed(2)}` +
            `  = ${f.contribution.toFixed(1)} pts`,
        );
      }
    }
  }

  console.log(
    `\nProject ${report.score}/100 (${report.grade}) across ` +
      `${report.locales.length} locale(s), threshold ${report.releaseThreshold}.`,
  );

  if (report.blocking.length > 0) {
    console.log(`Below threshold: ${report.blocking.join(", ")}`);
    if (args.includes("--strict")) process.exit(1);
  }
}

function cmdInfo(): void {
  const target = args[1];
  if (target && COUNTRIES[target.toUpperCase() as keyof typeof COUNTRIES]) {
    console.log(JSON.stringify(COUNTRIES[target.toUpperCase() as keyof typeof COUNTRIES], null, 2));
    return;
  }
  if (target && LOCALES[target]) {
    console.log(JSON.stringify(LOCALES[target], null, 2));
    return;
  }
  console.log(`${Object.keys(COUNTRIES).length} countries, ${Object.keys(LOCALES).length} locales\n`);
  for (const [code, c] of Object.entries(COUNTRIES)) {
    console.log(`${code}  ${c.name.padEnd(18)} ${c.currency}  ${c.locales.join(", ")}`);
  }
}

function usage(): void {
  console.log(`sela: i18n tooling for Southeast Asia

  sela init --country VN [--dir locales]
      Scaffold locale files and sela.config.json for a country.

  sela lint [--dir locales] [--reference en] [--strict]
      Check bundles for Zawgyi text, missing classifiers, gendered Thai
      particles, placeholder drift, and other regional mistakes.

  sela readiness [--dir locales] [--reference en] [--threshold 75]
                 [--verbose] [--strict]
      Release readiness per locale, worst first. Scores coverage, register
      depth, lint cleanliness, and review state into one number out of 100,
      because "100% translated" says nothing about whether it is shippable.
      --strict exits non-zero when any locale is below the threshold.

  sela info [COUNTRY|LOCALE]
      Print what this package knows about a country or locale.
`);
}

switch (command) {
  case "init":
    cmdInit();
    break;
  case "lint":
  case "check":
    cmdLint();
    break;
  case "readiness":
  case "coverage": // previous name for this command
    cmdReadiness();
    break;
  case "info":
    cmdInfo();
    break;
  default:
    usage();
    if (command) process.exit(1);
}
