/**
 * What the new segmentation stack costs in bytes.
 *
 * Delegating to `Intl.Segmenter` is free at the byte level — the dictionaries
 * are the host's, not ours. Replacing it is not free, so the size has to be on
 * the table next to the accuracy, or the comparison is rigged.
 *
 * Three figures are reported, each minified and gzipped, which is what a user
 * actually downloads:
 *
 *   rules only   clusters.ts + engines.ts, the dictionary-free path
 *   with lexicon the shipped default, lexicon included
 *   whole package the full public entry point, for context
 *
 * Usage: node bench/footprint.mjs [--json]
 */

import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { lexiconSize } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");

const TARGETS = [
  {
    name: "locale registry only (shared baseline)",
    contents: `export { resolveLocale } from ${JSON.stringify(join(src, "locales", "index.ts"))};`,
  },
  {
    name: "rules only (clusters + orthographic engine)",
    contents: `export { orthographicBoundaries, graphemeClusters } from ${JSON.stringify(
      join(src, "text", "clusters.ts"),
    )};
export { orthographicEngine } from ${JSON.stringify(join(src, "text", "engines.ts"))};`,
  },
  {
    name: "with lexicon (shipped default)",
    contents: `export * from ${JSON.stringify(join(src, "text", "segment.ts"))};`,
  },
  {
    name: "whole package entry point",
    contents: `export * from ${JSON.stringify(join(src, "index.ts"))};`,
  },
];

const results = [];

for (const target of TARGETS) {
  const out = await build({
    stdin: { contents: target.contents, resolveDir: src, loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    write: false,
    logLevel: "silent",
    external: ["react"],
  });
  const code = out.outputFiles[0].contents;
  results.push({
    name: target.name,
    minified: code.byteLength,
    gzipped: gzipSync(code).byteLength,
  });
}

const lexicons = ["th", "lo", "km", "my", "zh-Hans-SG"].map((code) => ({
  locale: code,
  entries: lexiconSize(code),
}));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ bundles: results, lexicons }, null, 2));
} else {
  const kb = (n) => (n / 1024).toFixed(1).padStart(7);
  console.log("── bundle footprint " + "─".repeat(57));
  console.log("target                                          min KB   gzip KB");
  for (const r of results) {
    console.log(`${r.name.padEnd(44)} ${kb(r.minified)}   ${kb(r.gzipped)}`);
  }
  const [baseline, rules, full] = results;
  const marginal = (r) => ((r.gzipped - baseline.gzipped) / 1024).toFixed(1);
  console.log(
    `\nover the locale registry the package already ships:` +
      `\n  rules only    +${marginal(rules)} KB gzipped` +
      `\n  with lexicon  +${marginal(full)} KB gzipped` +
      `\n  the lexicon itself is ${((full.gzipped - rules.gzipped) / 1024).toFixed(1)} KB of that.`,
  );
  console.log("\n── lexicon size " + "─".repeat(61));
  for (const l of lexicons) {
    console.log(`${l.locale.padEnd(12)} ${String(l.entries).padStart(5)} entries`);
  }
}
