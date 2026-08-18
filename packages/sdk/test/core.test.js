import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COUNTRIES,
  LOCALE_CODES,
  classifierFor,
  coverage,
  createI18n,
  detectMyanmarEncoding,
  foldVietnamese,
  formatCount,
  formatCurrency,
  formatDate,
  formatName,
  fromTelex,
  hasGrammaticalNumber,
  insertLineBreakOpportunities,
  lintBundle,
  nameFields,
  negotiateLocale,
  parseAcceptLanguage,
  parseNumber,
  politeParticle,
  pronoun,
  resolveLocale,
  slugifyVietnamese,
  toBuddhistYear,
  toLatinDigits,
  toNativeDigits,
  toSearchKey,
  truncate,
  wordCount,
  words,
  zawgyiToUnicode,
} from "../dist/index.js";

import { localeFromRequest } from "../dist/server.js";

// ------------------------------------------------------------------ registry

test("covers 12 countries and 29 locales", () => {
  assert.equal(Object.keys(COUNTRIES).length, 12);
  assert.equal(LOCALE_CODES.length, 29);
});

test("every locale fallback chain terminates at English", () => {
  for (const code of LOCALE_CODES) {
    const chain = resolveLocale(code).fallback;
    assert.ok(chain.includes("en"), `${code} does not fall back to en`);
    assert.equal(chain[0], code, `${code} chain does not start with itself`);
  }
});

test("every country's locales are registered", () => {
  for (const country of Object.values(COUNTRIES)) {
    for (const locale of country.locales) {
      assert.ok(resolveLocale(locale), `${country.code} references unknown locale ${locale}`);
    }
    assert.ok(country.locales.includes(country.defaultLocale));
  }
});

test("resolves partial and messy tags", () => {
  assert.equal(resolveLocale("VI-vn").code, "vi");
  assert.equal(resolveLocale("th_TH").code, "th");
  assert.equal(resolveLocale("ms-Arab-BN").code, "ms-Arab-BN");
  assert.equal(resolveLocale("xx-YY"), undefined);
});

test("negotiates through fallback chains", () => {
  // A Javanese speaker gets Indonesian before English.
  assert.equal(negotiateLocale(["jv"], ["id", "en"]), "id");
  // A Lao speaker gets Thai before English.
  assert.equal(negotiateLocale(["lo"], ["th", "en"]), "th");
  assert.equal(negotiateLocale(["fr"], ["id", "en"]), "en");
});

test("parses Accept-Language by quality", () => {
  assert.deepEqual(parseAcceptLanguage("en;q=0.5,vi,th;q=0.8"), ["vi", "th", "en"]);
});

test("country beats Accept-Language when resolving a request", () => {
  // A phone sold in Cambodia often reports en-US.
  const locale = localeFromRequest({
    country: "KH",
    acceptLanguage: "en-US,en;q=0.9",
    available: ["km", "en"],
  });
  assert.equal(locale, "km");
});

// ------------------------------------------------------------------ numbers

test("formats whole-unit currencies without decimals", () => {
  assert.match(formatCurrency(1500000, "vi"), /1\.500\.000/);
  assert.ok(!formatCurrency(1500000, "vi").includes(",00"));
  assert.match(formatCurrency(50000, "id"), /50\.000/);
  assert.match(formatCurrency(2500, "th"), /2,500\.00/);
});

test("parses locale-formatted numbers back", () => {
  assert.equal(parseNumber("1.500.000", "vi"), 1500000);
  assert.equal(parseNumber("1,234.5", "th"), 1234.5);
  assert.equal(parseNumber("๑,๒๓๔.๕", "th"), 1234.5);
});

test("converts native digits both ways", () => {
  assert.equal(toNativeDigits("2569", "th"), "๒๕๖๙");
  assert.equal(toNativeDigits("2026", "my"), "၂၀၂၆");
  assert.equal(toNativeDigits("123", "km"), "១២៣");
  assert.equal(toLatinDigits("๒๕๖๙"), "2569");
  assert.equal(toLatinDigits("១២៣"), "123");
  assert.equal(toNativeDigits("123", "vi"), "123");
});

// ------------------------------------------------------------------ dates

test("Thai dates default to Buddhist Era", () => {
  assert.equal(toBuddhistYear(2026), 2569);
  const thai = formatDate(new Date("2026-08-18T00:00:00Z"), "th", {
    dateStyle: "long",
    timeZone: "UTC",
  });
  assert.match(thai, /2569/);

  const gregorian = formatDate(new Date("2026-08-18T00:00:00Z"), "th", {
    dateStyle: "long",
    calendar: "gregory",
    timeZone: "UTC",
  });
  assert.match(gregorian, /2026/);
});

test("Vietnamese dates stay Gregorian", () => {
  const vi = formatDate(new Date("2026-08-18T00:00:00Z"), "vi", {
    dateStyle: "long",
    timeZone: "UTC",
  });
  assert.match(vi, /2026/);
});

// ------------------------------------------------------------------ plurals

test("most regional languages have no grammatical number", () => {
  for (const code of ["vi", "th", "km", "lo", "my", "id", "ms", "zh-Hans-SG"]) {
    assert.equal(hasGrammaticalNumber(code), false, `${code} should be number-less`);
  }
  assert.equal(hasGrammaticalNumber("fil"), true);
  assert.equal(hasGrammaticalNumber("en"), true);
});

// ------------------------------------------------------------------ classifiers

test("classifier tables resolve through fallback", () => {
  assert.equal(classifierFor("vi", "animal"), "con");
  assert.equal(classifierFor("th", "animal"), "ตัว");
  assert.equal(classifierFor("my", "person"), "ယောက်");
  // Javanese inherits Indonesian, Shan inherits Burmese.
  assert.equal(classifierFor("jv", "animal"), "ekor");
  assert.equal(classifierFor("shn", "person"), "ယောက်");
});

test("counted phrases use the right word order", () => {
  assert.equal(formatCount(2, "mèo", { locale: "vi", category: "animal" }), "2 con mèo");
  assert.equal(formatCount(2, "แมว", { locale: "th", category: "animal" }), "แมว 2 ตัว");
  assert.equal(formatCount(3, "buku", { locale: "id", category: "book" }), "3 buah buku");
  assert.equal(formatCount(3, "libro", { locale: "fil" }), "3 na libro");
  assert.equal(formatCount(2, "ကြောင်", { locale: "my", category: "animal" }), "ကြောင် 2 ကောင်");
  assert.equal(
    formatCount(2, "แมว", { locale: "th", category: "animal", nativeDigits: true }),
    "แมว ๒ ตัว",
  );
});

// ------------------------------------------------------------------ register

test("Thai polite particles depend on the speaker's gender", () => {
  assert.equal(politeParticle("th", { speakerGender: "male" }), "ครับ");
  assert.equal(politeParticle("th", { speakerGender: "female" }), "ค่ะ");
  assert.equal(
    politeParticle("th", { speakerGender: "female", sentenceType: "question" }),
    "คะ",
  );
  // Thai has no neutral polite particle, so the API says so instead of guessing.
  assert.equal(politeParticle("th", { speakerGender: "neutral" }), null);
  assert.equal(politeParticle("id"), null);
});

test("pronouns follow politeness level and speaker gender", () => {
  assert.equal(pronoun("vi", "you", { register: "formal" }), "quý khách");
  assert.equal(pronoun("vi", "you", { register: "casual" }), "cậu");
  assert.equal(pronoun("th", "i", { speakerGender: "female" }), "ดิฉัน");
  assert.equal(pronoun("th", "i", { speakerGender: "male" }), "ผม");
  // Javanese speech levels map onto the register scale.
  assert.equal(pronoun("jv", "you", { register: "formal" }), "panjenengan");
  assert.equal(pronoun("jv", "you", { register: "casual" }), "kowé");
  assert.equal(pronoun("id", "you", { register: "casual" }), "lo");
});

// ------------------------------------------------------------------ Myanmar

test("detects Zawgyi and Unicode Burmese", () => {
  assert.equal(detectMyanmarEncoding("ျမန္မာ").encoding, "zawgyi");
  assert.equal(detectMyanmarEncoding("မြန်မာ").encoding, "unicode");
  assert.equal(detectMyanmarEncoding("hello").encoding, "unknown");
});

test("converts Zawgyi to Unicode", () => {
  assert.equal(zawgyiToUnicode("ျမန္မာ"), "မြန်မာ");
  assert.equal(detectMyanmarEncoding(zawgyiToUnicode("ျမန္မာ")).encoding, "unicode");
});

// ------------------------------------------------------------------ Vietnamese

test("folds Vietnamese for search and slugs", () => {
  assert.equal(foldVietnamese("Tiếng Việt"), "Tieng Viet");
  assert.equal(foldVietnamese("Đà Nẵng"), "Da Nang");
  assert.equal(slugifyVietnamese("Hồ Chí Minh"), "ho-chi-minh");
  assert.equal(toSearchKey("Tiếng Việt", "vi"), "tieng viet");
});

test("decomposed and precomposed Vietnamese match after folding", () => {
  const nfc = "Việt".normalize("NFC");
  const nfd = "Việt".normalize("NFD");
  assert.notEqual(nfc, nfd);
  assert.equal(toSearchKey(nfc, "vi"), toSearchKey(nfd, "vi"));
});

test("converts Telex input", () => {
  assert.equal(fromTelex("Vieejt"), "Việt");
  assert.equal(fromTelex("ddaa"), "đâ");
});

// ------------------------------------------------------------------ segmentation

test("segments unspaced scripts", () => {
  assert.deepEqual(words("ฉันรักภาษาไทย", "th"), ["ฉัน", "รัก", "ภาษา", "ไทย"]);
  assert.equal(wordCount("ฉันรักภาษาไทย", "th"), 4);
  assert.ok(wordCount("ខ្ញុំស្រឡាញ់ភាសាខ្មែរ", "km") >= 2);
});

test("inserts break opportunities only where needed", () => {
  const thai = insertLineBreakOpportunities("ฉันรักภาษาไทย", "th");
  assert.ok(thai.includes("\u200B"));
  assert.equal(thai.replace(/\u200B/g, ""), "ฉันรักภาษาไทย");
  assert.equal(insertLineBreakOpportunities("hello world", "en"), "hello world");
});

test("truncates on word boundaries without breaking clusters", () => {
  const out = truncate("ฉันรักภาษาไทยมาก", "th", 8);
  assert.ok(out.endsWith("…"));
  assert.ok(out.length < "ฉันรักภาษาไทยมาก".length);
});

// ------------------------------------------------------------------ names

test("Burmese names have no surname field", () => {
  const fields = nameFields("MM");
  assert.equal(fields.length, 1);
  assert.equal(fields[0].key, "full");
});

test("Indonesian surname is optional because mononyms are legal", () => {
  const family = nameFields("ID").find((f) => f.key === "family");
  assert.equal(family.required, false);
});

test("name order follows the country", () => {
  assert.equal(
    formatName({ family: "Nguyễn", middle: "Văn", given: "An" }, "VN"),
    "Nguyễn Văn An",
  );
  assert.equal(
    formatName({ given: "Ahmad", patronymic: "bin", family: "Ismail" }, "MY"),
    "Ahmad bin Ismail",
  );
  assert.equal(formatName({ full: "Aung San Suu Kyi" }, "MM"), "Aung San Suu Kyi");
});

// ------------------------------------------------------------------ translator

test("resolves messages through the fallback chain", () => {
  const i18n = createI18n({
    locale: "jv",
    bundles: {
      jv: { greeting: "Sugeng rawuh" },
      id: { farewell: "Sampai jumpa" },
      en: { greeting: "Welcome", farewell: "Goodbye", missing: "Only here" },
    },
  });
  assert.equal(i18n.t("greeting"), "Sugeng rawuh");
  // Falls through Javanese to Indonesian before reaching English.
  assert.equal(i18n.t("farewell"), "Sampai jumpa");
  assert.equal(i18n.t("missing"), "Only here");
  assert.equal(i18n.t("absent"), "absent");
});

test("picks the register variant", () => {
  const bundles = {
    vi: { greeting: { formal: "Chào quý khách", casual: "Chào cậu" } },
    en: { greeting: "Hello" },
  };
  const formal = createI18n({ locale: "vi", register: "formal", bundles });
  const casual = createI18n({ locale: "vi", register: "casual", bundles });
  assert.equal(formal.t("greeting"), "Chào quý khách");
  assert.equal(casual.t("greeting"), "Chào cậu");
  // No neutral variant defined, so it falls back rather than failing.
  assert.equal(formal.withRegister("neutral").t("greeting"), "Chào quý khách");
});

test("interpolates and formats numbers inside messages", () => {
  const i18n = createI18n({
    locale: "vi",
    bundles: { vi: { cart: "Bạn có {count} sản phẩm, tổng {total}" }, en: {} },
  });
  assert.equal(
    i18n.t("cart", { total: "1.500.000 ₫" }, { count: 3 }),
    "Bạn có 3 sản phẩm, tổng 1.500.000 ₫",
  );
});

test("nested and flat keys both work", () => {
  const i18n = createI18n({
    locale: "en",
    bundles: { en: { nav: { home: "Home" }, "nav.about": "About" } },
  });
  assert.equal(i18n.t("nav.home"), "Home");
  assert.equal(i18n.t("nav.about"), "About");
});

test("coverage reports missing keys", () => {
  const report = coverage({
    en: { a: "A", b: "B", c: "C" },
    th: { a: "ก" },
  });
  assert.equal(report.th.total, 3);
  assert.equal(report.th.translated, 1);
  assert.deepEqual(report.th.missing, ["b", "c"]);
});

// ------------------------------------------------------------------ lint

test("flags Zawgyi in a Burmese bundle", () => {
  const issues = lintBundle("my", { title: "ျမန္မာ" });
  assert.ok(issues.some((i) => i.rule === "zawgyi-encoding" && i.severity === "error"));
});

test("flags a hardcoded Thai polite particle", () => {
  const issues = lintBundle("th", { greeting: "สวัสดีครับ" });
  assert.ok(issues.some((i) => i.rule === "gendered-particle"));
});

test("flags a counted phrase with no classifier", () => {
  const issues = lintBundle("vi", { cart: "Bạn có {count} sản phẩm" });
  assert.ok(issues.some((i) => i.rule === "missing-classifier"));
});

test("flags English plural hacks in number-less languages", () => {
  const issues = lintBundle("id", { items: "{count} item(s)" });
  assert.ok(issues.some((i) => i.rule === "hardcoded-plural"));
});

test("flags placeholder drift against the source", () => {
  const issues = lintBundle("vi", { hi: "Xin chào {ten}" }, { hi: "Hello {name}" });
  assert.ok(issues.some((i) => i.rule === "missing-placeholder"));
  assert.ok(issues.some((i) => i.rule === "unknown-placeholder"));
});

test("clean bundles produce no issues", () => {
  const issues = lintBundle("vi", { greeting: "Xin chào" }, { greeting: "Hello" });
  assert.deepEqual(issues, []);
});
