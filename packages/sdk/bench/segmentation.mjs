/**
 * Segmentation benchmark.
 *
 * Compares three approaches to the same problem on the same data:
 *
 *   A  intl          Intl.Segmenter, i.e. delegate to the host's ICU. The
 *                    approach this package used before, and the one every
 *                    JavaScript i18n library reaches for first.
 *   B  orthographic  Rule-based orthographic clustering, no data at all.
 *   C  lexical       Unigram Viterbi over the cluster lattice against a
 *                    curated lexicon. Falls back to B for anything it does
 *                    not recognise.
 *
 * Reported per approach, per locale:
 *
 *   boundary P/R/F1  Against the hand-annotated corpus. A word boundary is a
 *                    character offset; this is the standard word-segmentation
 *                    metric and it does not reward or punish tokenisation of
 *                    the text into equal-length pieces.
 *   illegal          Proposed breaks that would render wrong, judged by
 *                    bench/legality.mjs, which shares no code with the
 *                    implementation. Any number above zero is a rendering bug.
 *   maxRun           Longest stretch with no break opportunity, in clusters.
 *                    This is the line-overflow metric: a paragraph wraps only
 *                    where a break exists, so the worst run sets the widest
 *                    unbreakable box the layout has to fit.
 *   throughput       Characters segmented per millisecond, warm.
 *   available        Whether the approach runs at all on a host with no
 *                    Intl.Segmenter.
 *
 * Usage: node bench/segmentation.mjs [--json] [--split dev|test|both]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  lexicalEngine,
  orthographicEngine,
  orthographicBoundaries,
  clusterScriptFor,
} from "../dist/index.js";
import { illegalBreakReasons } from "./legality.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, "data", "corpus.json"), "utf8"));

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const splitArg = args.includes("--split") ? args[args.indexOf("--split") + 1] : "both";
const SPLITS = splitArg === "both" ? ["dev", "test"] : [splitArg];

// --------------------------------------------------------------- approach A
//
// The baseline, kept out of src/ on purpose: shipping it would put the
// dependency back into the package. It lives here so the comparison is honest
// and repeatable, not so the library can fall back to it.

const intlCache = new Map();

function intlSegmenter(locale) {
  let s = intlCache.get(locale);
  if (!s) {
    s = new Intl.Segmenter(locale, { granularity: "word" });
    intlCache.set(locale, s);
  }
  return s;
}

const intlEngine = {
  id: "intl",
  segments(text, locale) {
    const out = [];
    for (const part of intlSegmenter(locale).segment(text)) {
      out.push({
        start: part.index,
        end: part.index + part.segment.length,
        text: part.segment,
        wordLike: Boolean(part.isWordLike),
      });
    }
    return out;
  },
  breaks(text) {
    return [];
  },
};
intlEngine.breaks = function breaks(text, locale) {
  const out = [];
  for (const span of this.segments(text, locale)) {
    if (span.start > 0 && span.start < text.length) out.push(span.start);
  }
  return out;
};

const APPROACHES = [
  { key: "A", engine: intlEngine, label: "intl (Intl.Segmenter)" },
  { key: "B", engine: orthographicEngine, label: "orthographic (rules only)" },
  { key: "C", engine: lexicalEngine, label: "lexical (Viterbi + lexicon)" },
];

// ------------------------------------------------------------------- metrics

/** Gold boundaries as character offsets into the joined sentence. */
function goldBoundaries(annotated) {
  const parts = annotated.split("|");
  const offsets = new Set();
  let at = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    at += parts[i].length;
    offsets.add(at);
  }
  return { text: parts.join(""), offsets };
}

function predictedBoundaries(engine, text, locale) {
  const out = new Set();
  for (const span of engine.segments(text, locale)) {
    if (span.start > 0 && span.start < text.length) out.add(span.start);
  }
  return out;
}

function prf(tp, fp, fn) {
  const p = tp + fp === 0 ? 1 : tp / (tp + fp);
  const r = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f = p + r === 0 ? 0 : (2 * p * r) / (p + r);
  return { p, r, f };
}

/** Longest run of clusters containing no break opportunity. */
function maxUnbreakableRun(engine, text, locale) {
  const script = clusterScriptFor(locale);
  const clusters = orthographicBoundaries(text, script);
  const breaks = new Set(engine.breaks(text, locale));
  breaks.add(0);
  breaks.add(text.length);

  let worst = 0;
  let run = 0;
  for (let i = 0; i < clusters.length; i++) {
    if (breaks.has(clusters[i])) {
      if (run > worst) worst = run;
      run = 0;
    }
    if (i < clusters.length - 1) run++;
  }
  return Math.max(worst, run);
}

function evaluate(engine, locale, sentences) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let illegal = 0;
  let breaksTotal = 0;
  let worstRun = 0;
  const reasons = new Map();

  for (const annotated of sentences) {
    const { text, offsets } = goldBoundaries(annotated);
    const predicted = predictedBoundaries(engine, text, locale);

    for (const at of predicted) {
      if (offsets.has(at)) tp++;
      else fp++;
      breaksTotal++;
      // A word boundary is a tokenisation boundary, not a line-break
      // opportunity — `breaks()` is what filters those — so it is judged by
      // the cluster rules only.
      for (const reason of illegalBreakReasons(text, at, "cut")) {
        illegal++;
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      }
    }
    for (const at of offsets) if (!predicted.has(at)) fn++;

    const run = maxUnbreakableRun(engine, text, locale);
    if (run > worstRun) worstRun = run;
  }

  return { ...prf(tp, fp, fn), illegal, breaksTotal, worstRun, reasons };
}

// ---------------------------------------------------------------- throughput

function throughput(engine, locale, sentences) {
  const text = sentences.map((s) => s.replace(/\|/g, "")).join(" ");
  const body = text.repeat(20);

  for (let i = 0; i < 20; i++) engine.segments(body, locale); // warm

  const rounds = 50;
  const start = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) engine.segments(body, locale);
  const ns = Number(process.hrtime.bigint() - start);

  return (body.length * rounds) / (ns / 1e6); // chars per millisecond
}

// ------------------------------------------------------------ cluster safety
//
// Word breaks are not the only cut this package makes. `truncate()` and
// `graphemeLength()` cut at *cluster* boundaries, and that is where delegating
// to the platform actually breaks: UAX #29 is an encoding-level algorithm and
// says nothing about Thai leading vowels or Burmese syllable codas, so ICU is
// not wrong so much as answering a different question.

const graphemeCache = new Map();

function intlGraphemeBoundaries(text, locale) {
  let s = graphemeCache.get(locale);
  if (!s) {
    s = new Intl.Segmenter(locale, { granularity: "grapheme" });
    graphemeCache.set(locale, s);
  }
  const out = [];
  for (const part of s.segment(text)) if (part.index > 0) out.push(part.index);
  return out;
}

function clusterSafety(locale, sentences) {
  const script = clusterScriptFor(locale);
  const result = {
    intl: { offsets: 0, illegal: 0, reasons: {} },
    orthographic: { offsets: 0, illegal: 0, reasons: {} },
  };

  for (const annotated of sentences) {
    const text = annotated.replace(/\|/g, "");

    const pairs = [
      ["intl", intlGraphemeBoundaries(text, locale)],
      ["orthographic", orthographicBoundaries(text, script).filter((o) => o > 0 && o < text.length)],
    ];

    for (const [key, offsets] of pairs) {
      for (const at of offsets) {
        result[key].offsets++;
        const reasons = illegalBreakReasons(text, at, "cut");
        if (reasons.length > 0) result[key].illegal++;
        for (const reason of reasons) {
          result[key].reasons[reason] = (result[key].reasons[reason] ?? 0) + 1;
        }
      }
    }
  }
  return result;
}

// -------------------------------------------------------------- availability

function survivesWithoutIntlSegmenter(engine) {
  const saved = Intl.Segmenter;
  try {
    // eslint-disable-next-line no-extend-native
    delete Intl.Segmenter;
    engine.segments("ฉันรักภาษาไทย", "th");
    return true;
  } catch {
    return false;
  } finally {
    Intl.Segmenter = saved;
  }
}

// -------------------------------------------------------------------- report

const locales = Object.keys(corpus).filter((k) => !k.startsWith("_"));
const report = {
  runtime: { node: process.version, icu: process.versions.icu, unicode: process.versions.unicode },
  splits: {},
  throughput: {},
  availability: {},
};

for (const approach of APPROACHES) {
  report.availability[approach.key] = survivesWithoutIntlSegmenter(approach.engine);
}

for (const split of SPLITS) {
  report.splits[split] = {};
  for (const locale of locales) {
    const sentences = corpus[locale][split];
    report.splits[split][locale] = {};
    for (const approach of APPROACHES) {
      const r = evaluate(approach.engine, locale, sentences);
      report.splits[split][locale][approach.key] = {
        precision: r.p,
        recall: r.r,
        f1: r.f,
        illegalBreaks: r.illegal,
        breaks: r.breaksTotal,
        maxUnbreakableClusters: r.worstRun,
        reasons: Object.fromEntries(r.reasons),
      };
    }
  }
}

report.clusterSafety = {};
for (const locale of locales) {
  report.clusterSafety[locale] = clusterSafety(
    locale,
    corpus[locale].dev.concat(corpus[locale].test),
  );
}

for (const locale of locales) {
  report.throughput[locale] = {};
  for (const approach of APPROACHES) {
    report.throughput[locale][approach.key] = throughput(
      approach.engine,
      locale,
      corpus[locale].dev.concat(corpus[locale].test),
    );
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printText(report);
}

function printText(r) {
  const pct = (x) => (x * 100).toFixed(1).padStart(5);
  console.log(
    `runtime  node ${r.runtime.node}  ICU ${r.runtime.icu}  Unicode ${r.runtime.unicode}\n`,
  );

  for (const split of SPLITS) {
    console.log(`── ${split} split ${"─".repeat(62 - split.length)}`);
    console.log(
      "locale       approach                       P      R     F1   illegal  maxRun",
    );
    for (const locale of locales) {
      for (const approach of APPROACHES) {
        const m = r.splits[split][locale][approach.key];
        console.log(
          `${locale.padEnd(12)} ${approach.label.padEnd(28)} ${pct(m.precision)} ${pct(
            m.recall,
          )} ${pct(m.f1)}  ${String(m.illegalBreaks).padStart(7)}  ${String(
            m.maxUnbreakableClusters,
          ).padStart(6)}`,
        );
      }
    }
    console.log();

    const macro = {};
    for (const approach of APPROACHES) {
      const f1s = locales.map((l) => r.splits[split][l][approach.key].f1);
      const illegal = locales.reduce(
        (a, l) => a + r.splits[split][l][approach.key].illegalBreaks,
        0,
      );
      const worst = Math.max(
        ...locales.map((l) => r.splits[split][l][approach.key].maxUnbreakableClusters),
      );
      macro[approach.key] = {
        f1: f1s.reduce((a, b) => a + b, 0) / f1s.length,
        illegal,
        worst,
      };
    }
    for (const approach of APPROACHES) {
      const m = macro[approach.key];
      console.log(
        `  macro ${approach.label.padEnd(28)} F1 ${pct(m.f1)}   illegal ${String(
          m.illegal,
        ).padStart(4)}   worst run ${String(m.worst).padStart(3)}`,
      );
    }
    console.log();
  }

  console.log("── cluster safety: offsets a truncation may cut at " + "─".repeat(27));
  console.log("locale       source          offsets  illegal   rate  worst reason");
  for (const locale of locales) {
    for (const key of ["intl", "orthographic"]) {
      const m = r.clusterSafety[locale][key];
      const rate = m.offsets === 0 ? 0 : (m.illegal / m.offsets) * 100;
      const worst = Object.entries(m.reasons).sort((a, b) => b[1] - a[1])[0];
      console.log(
        `${locale.padEnd(12)} ${(key === "intl" ? "Intl grapheme" : "orthographic").padEnd(14)} ${String(
          m.offsets,
        ).padStart(7)}  ${String(m.illegal).padStart(7)} ${rate.toFixed(1).padStart(6)}%  ${
          worst ? `${worst[0]} x${worst[1]}` : "-"
        }`,
      );
    }
  }
  console.log();

  console.log("── throughput, characters per millisecond " + "─".repeat(36));
  console.log("locale       " + APPROACHES.map((a) => a.key.padStart(12)).join(""));
  for (const locale of locales) {
    console.log(
      locale.padEnd(12) +
        APPROACHES.map((a) => r.throughput[locale][a.key].toFixed(0).padStart(12)).join(""),
    );
  }
  console.log();

  console.log("── availability without Intl.Segmenter " + "─".repeat(39));
  for (const approach of APPROACHES) {
    console.log(
      `  ${approach.label.padEnd(30)} ${r.availability[approach.key] ? "works" : "throws"}`,
    );
  }
}
