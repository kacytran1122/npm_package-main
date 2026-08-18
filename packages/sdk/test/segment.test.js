/**
 * Tests for the segmentation stack.
 *
 * Organised as unit (the cluster rules and the cost model in isolation),
 * integration (the public API, the React and server entry points, mixed-script
 * strings), and regression (a committed golden file, an accuracy floor against
 * the annotated corpus, and the properties that must hold for every input).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ZWSP,
  clusterScriptFor,
  graphemeClusters,
  graphemeLength,
  graphemes,
  insertLineBreakOpportunities,
  lexicalEngine,
  lexiconSize,
  orthographicBoundaries,
  orthographicClusters,
  orthographicEngine,
  registerWords,
  segmentationEngine,
  sentences,
  setSegmentationEngine,
  stripLineBreakOpportunities,
  truncate,
  wordCount,
  words,
} from "../dist/index.js";

import { illegalBreakReasons } from "../bench/legality.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, "..", "bench", "data", "corpus.json"), "utf8"));
const golden = JSON.parse(readFileSync(join(here, "fixtures", "segmentation.golden.json"), "utf8"));

const LOCALES = Object.keys(corpus).filter((k) => !k.startsWith("_"));
const everySentence = LOCALES.flatMap((locale) =>
  corpus[locale].dev.concat(corpus[locale].test).map((s) => ({ locale, text: s.replace(/\|/g, "") })),
);

// ====================================================================== unit
// ------------------------------------------------------------------ clusters

test("grapheme clusters follow UAX #29 without Intl", () => {
  assert.deepEqual(graphemeClusters("abc"), ["a", "b", "c"]);
  // Combining marks attach.
  assert.deepEqual(graphemeClusters("é"), ["é".normalize("NFD")]);
  // Emoji ZWJ sequences stay whole (GB11).
  assert.deepEqual(graphemeClusters("👨‍👩‍👧‍👦"), ["👨‍👩‍👧‍👦"]);
  // Regional indicators pair up, and only in pairs (GB12/GB13).
  assert.deepEqual(graphemeClusters("🇹🇭🇸🇬"), ["🇹🇭", "🇸🇬"]);
  assert.deepEqual(graphemeClusters("🇹🇭🇸"), ["🇹🇭", "🇸"]);
  // CRLF is one cluster (GB3).
  assert.deepEqual(graphemeClusters("a\r\nb"), ["a", "\r\n", "b"]);
  // Skin tone modifiers and variation selectors attach.
  assert.deepEqual(graphemeClusters("👍🏽"), ["👍🏽"]);
  assert.equal(graphemeClusters("").length, 0);
});

test("Thai leading vowels never stand alone", () => {
  // UAX #29 alone yields ["เ", "กี่", "ย", "ว"]; a truncation there prints a
  // dangling เ, which is the bug the tailoring exists to prevent.
  const cs = orthographicClusters("เกี่ยว", "Thai");
  assert.ok(!cs.includes("เ"), `leading vowel orphaned: ${JSON.stringify(cs)}`);
  assert.equal(cs.join(""), "เกี่ยว");
  for (const c of cs) assert.ok(!/^[เ-ไ]$/u.test(c));
});

test("Thai spacing vowels attach to the consonant they follow", () => {
  for (const [text, vowel] of [
    ["ภาษา", "า"],
    ["จะ", "ะ"],
    ["ทำ", "ำ"],
  ]) {
    const cs = orthographicClusters(text, "Thai");
    assert.ok(!cs.includes(vowel), `${vowel} orphaned in ${text}: ${JSON.stringify(cs)}`);
  }
});

test("Burmese keeps a killed coda with its syllable", () => {
  // Intl grapheme granularity splits this into ["ကျွ", "န်"].
  assert.deepEqual(orthographicClusters("ကျွန်", "Mymr"), ["ကျွန်"]);
  assert.deepEqual(orthographicClusters("ကျွန်တော်", "Mymr"), ["ကျွန်", "တော်"]);
});

test("Khmer coeng stacks stay whole", () => {
  assert.deepEqual(orthographicClusters("ខ្ញុំ", "Khmr"), ["ខ្ញុំ"]);
  // Clusters may be finer than a syllable — that is safe, and the lattice
  // merges them back. What must never happen is a coeng stack coming apart.
  const cs = orthographicClusters("ស្រឡាញ់", "Khmr");
  assert.equal(cs.join(""), "ស្រឡាញ់");
  assert.ok(cs.includes("ស្រ"), `coeng stack split: ${JSON.stringify(cs)}`);
  for (const c of cs) {
    assert.ok(!c.startsWith("\u17D2"), "a cluster began with coeng");
    assert.ok(!c.endsWith("\u17D2"), "a cluster ended with a dangling coeng");
  }
});

test("Lao mirrors the Thai rules", () => {
  const cs = orthographicClusters("ເມືອງ", "Laoo");
  assert.ok(!cs.includes("ເ"));
  assert.equal(cs.join(""), "ເມືອງ");
});

test("cluster boundaries always start at 0, end at length, and ascend", () => {
  for (const { locale, text } of everySentence) {
    const b = orthographicBoundaries(text, clusterScriptFor(locale));
    assert.equal(b[0], 0);
    assert.equal(b[b.length - 1], text.length);
    for (let i = 1; i < b.length; i++) assert.ok(b[i] > b[i - 1], `not ascending in ${text}`);
  }
});

// -------------------------------------------------------------- cost model

test("the lexicon prefers a known word over an unknown chunk of the same span", () => {
  assert.deepEqual(words("ฉันรักภาษาไทย", "th"), ["ฉัน", "รัก", "ภาษา", "ไทย"]);
});

test("unknown runs are cut rather than returned as one block", () => {
  // Deliberate nonsense: no lexicon entry can match any of it.
  const gibberish = "กกกกกกกกกกกกกกกกกกกก";
  const parts = words(gibberish, "th");
  assert.ok(parts.length > 1, "an unknown run came back as a single token");
  assert.equal(parts.join(""), gibberish);
  for (const p of parts) assert.ok(p.length <= 8, `unknown chunk too long: ${p}`);
});

test("registerWords extends a locale and takes effect immediately", () => {
  const brand = "เซลากาตะพลัสโปร";
  const before = lexiconSize("th");
  assert.ok(words(brand, "th").length > 1, "precondition: the brand is unknown");

  registerWords("th", [brand]);

  assert.equal(lexiconSize("th"), before + 1);
  assert.deepEqual(words(brand, "th"), [brand]);
  assert.deepEqual(words(`ยินดีต้อนรับสู่${brand}`, "th").at(-1), brand);
});

test("Shan borrows the Burmese lexicon rather than having none", () => {
  assert.ok(lexiconSize("shn") > 0);
  assert.equal(lexiconSize("shn"), lexiconSize("my"));
});

test("locales with no lexicon fall back to the orthographic engine", () => {
  // Javanese in the Javanese script is unspaced-adjacent but has no lexicon.
  assert.equal(lexiconSize("vi"), 0);
  assert.deepEqual(words("Tiếng Việt", "vi"), ["Tiếng", "Việt"]);
});

// =============================================================== integration

test("segments unspaced scripts across all five", () => {
  assert.deepEqual(words("ฉันรักภาษาไทย", "th"), ["ฉัน", "รัก", "ภาษา", "ไทย"]);
  assert.deepEqual(words("ຂ້ອຍຮັກພາສາລາວ", "lo"), ["ຂ້ອຍ", "ຮັກ", "ພາສາ", "ລາວ"]);
  assert.deepEqual(words("ខ្ញុំស្រឡាញ់ភាសាខ្មែរ", "km"), ["ខ្ញុំ", "ស្រឡាញ់", "ភាសា", "ខ្មែរ"]);
  assert.deepEqual(words("请输入您的密码", "zh-Hans-SG"), ["请", "输入", "您", "的", "密码"]);
  assert.equal(wordCount("ဤစနစ်သည်ဘာသာပြန်ခြင်းကိုပံ့ပိုးသည်", "my"), 8);
});

test("mixed script strings keep their Latin and numeric runs intact", () => {
  assert.deepEqual(words("ราคา 1,500 บาท", "th"), ["ราคา", "1,500", "บาท"]);
  assert.deepEqual(words("คลิก OK เพื่อยืนยัน", "th"), ["คลิก", "OK", "เพื่อ", "ยืนยัน"]);
  assert.deepEqual(words("សូមចុច OK", "km"), ["សូម", "ចុច", "OK"]);
});

test("native punctuation is a hard boundary and is not word-like", () => {
  assert.deepEqual(words("ខ្ញុំស្រឡាញ់។", "km"), ["ខ្ញុំ", "ស្រឡាញ់"]);
  assert.deepEqual(words("သင်၏စကားဝှက်", "my"), ["သင်", "စကားဝှက်"]);
});

test("a line is never allowed to start with break-after punctuation", () => {
  // ។ and ၏ are UAX #14 break-after: legal to end a line on, never to start
  // one with. A ZWSP in front of either would wrap the paragraph wrong.
  for (const [locale, text, mark] of [
    ["km", "ខ្ញុំស្រឡាញ់។ភាសាខ្មែរ", "។"],
    ["my", "သင်၏စကားဝှက်", "၏"],
    ["zh-Hans-SG", "请输入密码。谢谢", "。"],
  ]) {
    const marked = insertLineBreakOpportunities(text, locale);
    assert.ok(marked.includes(ZWSP), `${locale}: no break opportunities at all`);
    assert.ok(
      !marked.includes(ZWSP + mark),
      `${locale}: a line could start with ${mark} in ${JSON.stringify(marked)}`,
    );
  }
});

test("spaced locales are untouched", () => {
  assert.deepEqual(words("Selamat pagi", "id"), ["Selamat", "pagi"]);
  assert.deepEqual(words("Tôi yêu tiếng Việt", "vi"), ["Tôi", "yêu", "tiếng", "Việt"]);
  assert.deepEqual(words("e-mail can't 1,500", "en"), ["e-mail", "can't", "1,500"]);
  assert.equal(insertLineBreakOpportunities("hello world", "en"), "hello world");
});

test("break opportunities round-trip and land only where they are legal", () => {
  for (const { locale, text } of everySentence) {
    const marked = insertLineBreakOpportunities(text, locale);
    assert.equal(stripLineBreakOpportunities(marked), text, `round trip failed for ${text}`);

    // Map each inserted ZWSP back to an offset in the original.
    let original = 0;
    for (let i = 0; i < marked.length; i++) {
      if (marked[i] === ZWSP) {
        assert.deepEqual(
          illegalBreakReasons(text, original),
          [],
          `illegal break at ${original} in ${text}`,
        );
      } else {
        original++;
      }
    }
  }
});

test("break opportunities are never adjacent to whitespace", () => {
  const marked = insertLineBreakOpportunities("ราคา 1500 บาท", "th");
  assert.ok(!marked.includes(`${ZWSP} `));
  assert.ok(!marked.includes(` ${ZWSP}`));
});

test("graphemes are orthographic clusters for the tailored scripts", () => {
  assert.deepEqual(graphemes("เกี่ยว", "th"), ["เกี่", "ย", "ว"]);
  assert.deepEqual(graphemes("ကျွန်", "my"), ["ကျွန်"]);
  assert.deepEqual(graphemes("ខ្ញុំ", "km"), ["ខ្ញុំ"]);
  assert.deepEqual(graphemes("a👨‍👩‍👧‍👦b", "en"), ["a", "👨‍👩‍👧‍👦", "b"]);
  assert.equal(graphemeLength("👨‍👩‍👧‍👦", "en"), 1);
  assert.equal(graphemeLength("", "th"), 0);
});

test("truncate stays inside its budget and never cuts illegally", () => {
  for (const { locale, text } of everySentence) {
    for (let budget = 1; budget <= graphemeLength(text, locale); budget++) {
      const out = truncate(text, locale, budget);
      assert.ok(
        graphemeLength(out, locale) <= Math.max(budget, 2),
        `budget ${budget} overrun on ${locale}: ${out}`,
      );
      if (out.endsWith("…")) {
        const kept = out.slice(0, -1);
        if (kept.length > 0 && kept.length < text.length) {
          assert.deepEqual(
            illegalBreakReasons(text, kept.length, "cut"),
            [],
            `illegal truncation at ${kept.length} in ${text}`,
          );
        }
      }
    }
  }
});

test("truncate leaves short strings alone", () => {
  assert.equal(truncate("ฉันรัก", "th", 20), "ฉันรัก");
  assert.equal(truncate("hello", "en", 5), "hello");
});

test("truncates on word boundaries without breaking clusters", () => {
  const out = truncate("ฉันรักภาษาไทยมาก", "th", 8);
  assert.equal(out, "ฉันรักภาษา…");
});

test("sentences split on terminators, not on Thai spacing", () => {
  assert.deepEqual(sentences("ខ្ញុំស្រឡាញ់។ អ្នកជាអ្វី។", "km"), [
    "ខ្ញុំស្រឡាញ់។ ",
    "អ្នកជាអ្វី។",
  ]);
  assert.deepEqual(sentences("Hello there. How are you?", "en"), [
    "Hello there. ",
    "How are you?",
  ]);
  assert.deepEqual(sentences("ငွေပေးချေမှုမအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ။", "my"), [
    "ငွေပေးချေမှုမအောင်မြင်ပါ။ ",
    "ထပ်ကြိုးစားပါ။",
  ]);
  // A space in Thai separates a number from its unit as often as it ends a
  // sentence, so it is not a boundary on its own.
  assert.deepEqual(sentences("ราคา 1,500 บาท สินค้าพร้อมส่ง", "th"), [
    "ราคา 1,500 บาท สินค้าพร้อมส่ง",
  ]);
  // A decimal point is not a full stop.
  assert.deepEqual(sentences("Version 1.2 shipped.", "en"), ["Version 1.2 shipped."]);
  assert.deepEqual(sentences("", "th"), []);
});

test("truncate accounts for a multi-character ellipsis", () => {
  const text = "ฉันรักภาษาไทยมาก";
  const dots = truncate(text, "th", 8, "...");
  assert.ok(dots.endsWith("..."));
  assert.ok(
    graphemeLength(dots, "th") <= 8,
    `"${dots}" is ${graphemeLength(dots, "th")} cells, budget was 8`,
  );
  assert.ok(graphemeLength(truncate(text, "th", 8), "th") <= 8);
});

test("the server entry point exposes the same segmentation", async () => {
  const server = await import("../dist/server.js");
  assert.deepEqual(server.words("ฉันรักภาษาไทย", "th"), words("ฉันรักภาษาไทย", "th"));
  assert.equal(
    server.insertLineBreakOpportunities("ฉันรักภาษาไทย", "th"),
    insertLineBreakOpportunities("ฉันรักภาษาไทย", "th"),
  );
});

test("the engine is swappable and swaps back", () => {
  const previous = segmentationEngine();
  try {
    setSegmentationEngine(orthographicEngine);
    assert.equal(segmentationEngine().id, "orthographic");
    // Rules only: every legal boundary becomes a word.
    assert.ok(words("ฉันรักภาษาไทย", "th").length > 4);
  } finally {
    setSegmentationEngine(previous);
  }
  assert.equal(segmentationEngine().id, "lexical");
  assert.deepEqual(words("ฉันรักภาษาไทย", "th"), ["ฉัน", "รัก", "ภาษา", "ไทย"]);
});

// ================================================================ regression

test("segmentation is stable against the committed golden file", () => {
  for (const [locale, cases] of Object.entries(golden)) {
    for (const [text, expected] of Object.entries(cases)) {
      assert.deepEqual(words(text, locale), expected, `${locale}: ${text}`);
    }
  }
});

test("the whole stack runs with no Intl.Segmenter present", () => {
  const saved = Intl.Segmenter;
  try {
    delete Intl.Segmenter;
    assert.equal(typeof Intl.Segmenter, "undefined");
    assert.deepEqual(words("ฉันรักภาษาไทย", "th"), ["ฉัน", "รัก", "ภาษา", "ไทย"]);
    assert.ok(insertLineBreakOpportunities("ខ្ញុំស្រឡាញ់ភាសាខ្មែរ", "km").includes(ZWSP));
    assert.deepEqual(graphemes("ကျွန်", "my"), ["ကျွန်"]);
    assert.equal(truncate("ฉันรักภาษาไทยมาก", "th", 8), "ฉันรักภาษา…");
  } finally {
    Intl.Segmenter = saved;
  }
});

test("output is a pure function of the input", () => {
  for (const { locale, text } of everySentence.slice(0, 25)) {
    const first = words(text, locale);
    for (let i = 0; i < 3; i++) assert.deepEqual(words(text, locale), first);
  }
});

test("no input produces an illegal break, including degenerate ones", () => {
  const edge = [
    "",
    " ",
    "\n",
    "ก",
    "เ",
    "า",
    "​",
    "ฉัน​รัก",
    "ก".repeat(200),
    "ខ្",
    "ကျ",
    "ฉันรัก 😀 ภาษาไทย",
  ];
  for (const locale of LOCALES) {
    for (const text of edge) {
      const marked = insertLineBreakOpportunities(text, locale);
      assert.equal(stripLineBreakOpportunities(marked), stripLineBreakOpportunities(text));
      assert.doesNotThrow(() => words(text, locale));
      assert.doesNotThrow(() => truncate(text, locale, 3));
      assert.doesNotThrow(() => sentences(text, locale));
    }
  }
});

test("every text is covered exactly once by its segments", () => {
  for (const { locale, text } of everySentence) {
    const spans = lexicalEngine.segments(text, locale);
    assert.equal(spans.map((s) => s.text).join(""), text, `coverage gap in ${text}`);
    let at = 0;
    for (const span of spans) {
      assert.equal(span.start, at, `span gap in ${text}`);
      at = span.end;
    }
    assert.equal(at, text.length);
  }
});

/**
 * The accuracy floor. These are the held-out numbers from
 * `node bench/segmentation.mjs`, rounded down with a little slack, so a change
 * that quietly degrades segmentation fails the build instead of shipping.
 * Raise them when the lexicon or the cost model genuinely improves.
 */
const F1_FLOOR = {
  th: 0.88,
  lo: 0.95,
  km: 0.93,
  my: 0.93,
  "zh-Hans-SG": 0.92,
};

test("held-out boundary F1 stays above the floor", () => {
  for (const locale of LOCALES) {
    let tp = 0;
    let fp = 0;
    let fn = 0;

    for (const annotated of corpus[locale].test) {
      const parts = annotated.split("|");
      const text = parts.join("");
      const gold = new Set();
      let at = 0;
      for (let i = 0; i < parts.length - 1; i++) {
        at += parts[i].length;
        gold.add(at);
      }

      const predicted = new Set();
      for (const span of lexicalEngine.segments(text, locale)) {
        if (span.start > 0 && span.start < text.length) predicted.add(span.start);
      }

      for (const b of predicted) (gold.has(b) ? tp++ : fp++);
      for (const b of gold) if (!predicted.has(b)) fn++;
    }

    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    const f1 = (2 * precision * recall) / (precision + recall);
    assert.ok(
      f1 >= F1_FLOOR[locale],
      `${locale} F1 ${f1.toFixed(3)} fell below floor ${F1_FLOOR[locale]}`,
    );
  }
});

test("no proposed break anywhere in the corpus is illegal", () => {
  for (const engine of [orthographicEngine, lexicalEngine]) {
    for (const { locale, text } of everySentence) {
      for (const at of engine.breaks(text, locale)) {
        assert.deepEqual(
          illegalBreakReasons(text, at),
          [],
          `${engine.id} broke illegally at ${at} in ${text}`,
        );
      }
    }
  }
});
