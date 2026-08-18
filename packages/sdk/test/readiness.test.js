import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FACET_WEIGHTS,
  gradeFor,
  COVERAGE_RULES,
  lintBundle,
  projectReadiness,
  readinessFromBundles,
  scoreReadiness,
} from "../dist/index.js";

/** Raw lint rule names the linter emits for a bundle set, for the guard below. */
function readinessFromBundlesRuleNames(bundles, reference = "en") {
  return lintBundle("th", bundles.th, bundles[reference]).map((i) => i.rule);
}

/** Pull one facet out of a score by id. */
const facet = (result, id) => result.facets.find((f) => f.id === id);

test("weights sum to one, so a perfect locale scores exactly 100", () => {
  const total = Object.values(FACET_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(total * 1000) / 1000, 1);

  const perfect = scoreReadiness({
    locale: "th",
    totalKeys: 10,
    translatedKeys: 10,
    filledRegisterSlots: 30, // 10 keys x 3 Thai registers
    issues: [],
    draftKeys: 0,
  });

  assert.equal(perfect.score, 100);
  assert.equal(perfect.grade, "A");
  assert.equal(perfect.topDrag, null);
});

test("a fully translated but wholly unreviewed locale is not a 100", () => {
  // This is the case plain percent-translated gets wrong: every string is
  // present, so coverage reports done, but nothing has been signed off.
  const result = scoreReadiness({
    locale: "th",
    totalKeys: 20,
    translatedKeys: 20,
    filledRegisterSlots: 60,
    issues: [],
    draftKeys: 20,
  });

  assert.equal(facet(result, "translated").score, 1);
  assert.equal(facet(result, "reviewed").score, 0);
  assert.equal(result.score, 85); // loses the whole 15-point review facet
  assert.equal(result.grade, "B");
  assert.equal(result.topDrag.id, "reviewed");
});

test("register depth falls when only the neutral variant is written", () => {
  const result = scoreReadiness({
    locale: "th",
    totalKeys: 10,
    translatedKeys: 10,
    filledRegisterSlots: 10, // one register of the three
    issues: [],
    draftKeys: 0,
  });

  const depth = facet(result, "registerDepth");
  assert.equal(Math.round(depth.score * 100) / 100, 0.33);
  assert.equal(result.counts.registerSlots.expected, 30);
  assert.equal(result.topDrag.id, "registerDepth");
});

test("code-mixed locales are not penalised for lacking a formal register", () => {
  // bahasa gaul has no formal register at all, so two variants per key is
  // full depth, not two thirds of it.
  const gaul = scoreReadiness({
    locale: "id-x-gaul",
    totalKeys: 10,
    translatedKeys: 10,
    filledRegisterSlots: 20,
    issues: [],
    draftKeys: 0,
  });

  assert.equal(gaul.counts.registerSlots.expected, 20);
  assert.equal(facet(gaul, "registerDepth").score, 1);
  assert.equal(gaul.score, 100);
});

test("lint density scales with project size, not raw issue count", () => {
  const small = scoreReadiness({
    locale: "th",
    totalKeys: 10,
    translatedKeys: 10,
    filledRegisterSlots: 30,
    issues: Array.from({ length: 5 }, () => ({ severity: "error" })),
  });
  const large = scoreReadiness({
    locale: "th",
    totalKeys: 100,
    translatedKeys: 100,
    filledRegisterSlots: 300,
    issues: Array.from({ length: 50 }, () => ({ severity: "error" })),
  });

  // Same density, same lint facet, despite a 10x difference in issue count.
  assert.equal(facet(small, "lintClean").score, facet(large, "lintClean").score);
  assert.equal(facet(small, "lintClean").score, 0.5);
});

test("a warning costs less than an error", () => {
  const withErrors = scoreReadiness({
    locale: "th",
    totalKeys: 10,
    translatedKeys: 10,
    issues: Array.from({ length: 4 }, () => ({ severity: "error" })),
  });
  const withWarnings = scoreReadiness({
    locale: "th",
    totalKeys: 10,
    translatedKeys: 10,
    issues: Array.from({ length: 4 }, () => ({ severity: "warning" })),
  });

  assert.ok(facet(withWarnings, "lintClean").score > facet(withErrors, "lintClean").score);
  assert.equal(facet(withErrors, "lintClean").score, 0.6);
  assert.equal(facet(withWarnings, "lintClean").score, 0.84);
});

test("the lint facet floors at zero rather than going negative", () => {
  const swamped = scoreReadiness({
    locale: "th",
    totalKeys: 2,
    translatedKeys: 2,
    issues: Array.from({ length: 40 }, () => ({ severity: "error" })),
  });

  assert.equal(facet(swamped, "lintClean").score, 0);
  assert.ok(swamped.score >= 0);
});

test("counts are clamped so bad input cannot score above 100", () => {
  const nonsense = scoreReadiness({
    locale: "vi",
    totalKeys: 5,
    translatedKeys: 500,
    filledRegisterSlots: 9000,
    draftKeys: -3,
  });

  assert.equal(nonsense.counts.translatedKeys, 5);
  assert.equal(nonsense.counts.registerSlots.filled, 15);
  assert.equal(nonsense.counts.draftKeys, 0);
  assert.equal(nonsense.score, 100);
});

test("an empty project scores zero instead of NaN or a hollow 100", () => {
  const empty = scoreReadiness({ locale: "km", totalKeys: 0, translatedKeys: 0 });
  assert.equal(empty.score, 0);
  assert.equal(empty.grade, "F");
  assert.ok(Number.isFinite(empty.score));
});

test("topDrag names the facet costing the most points", () => {
  const result = scoreReadiness({
    locale: "my",
    totalKeys: 100,
    translatedKeys: 50, // -17.5 points
    filledRegisterSlots: 150, // half depth, -12.5 points
    issues: [],
    draftKeys: 0,
  });

  assert.equal(result.topDrag.id, "translated");
  assert.ok(result.topDrag.deficit > facet(result, "registerDepth").deficit);
});

test("grade bands are inclusive at the boundary", () => {
  assert.equal(gradeFor(90), "A");
  assert.equal(gradeFor(89.9), "B");
  assert.equal(gradeFor(75), "B");
  assert.equal(gradeFor(60), "C");
  assert.equal(gradeFor(40), "D");
  assert.equal(gradeFor(39), "F");
  assert.equal(gradeFor(0), "F");
});

test("projectReadiness sorts worst first and flags what blocks release", () => {
  const rollup = projectReadiness(
    [
      scoreReadiness({ locale: "vi", totalKeys: 10, translatedKeys: 10, filledRegisterSlots: 30 }),
      scoreReadiness({ locale: "th", totalKeys: 10, translatedKeys: 2, filledRegisterSlots: 2 }),
      scoreReadiness({ locale: "km", totalKeys: 10, translatedKeys: 7, filledRegisterSlots: 14 }),
    ],
    75,
  );

  assert.deepEqual(
    rollup.locales.map((l) => l.locale),
    ["th", "km", "vi"],
  );
  assert.ok(rollup.blocking.includes("th"));
  assert.ok(!rollup.blocking.includes("vi"));
  assert.equal(rollup.releaseThreshold, 75);
});

test("an empty locale list rolls up to zero rather than NaN", () => {
  const rollup = projectReadiness([]);
  assert.equal(rollup.score, 0);
  assert.equal(rollup.grade, "F");
  assert.deepEqual(rollup.blocking, []);
});

test("readinessFromBundles reads register variants off the JSON", () => {
  const bundles = {
    en: {
      greeting: "Hello",
      farewell: "Goodbye",
    },
    th: {
      // One key written at all three registers, one only at neutral.
      greeting: { formal: "สวัสดีครับ", neutral: "สวัสดี", casual: "หวัดดี" },
      farewell: "ลาก่อน",
    },
  };

  const rollup = readinessFromBundles(bundles, "en");
  const th = rollup.locales.find((l) => l.locale === "th");

  assert.equal(th.counts.totalKeys, 2);
  assert.equal(th.counts.translatedKeys, 2);
  assert.equal(th.counts.registerSlots.expected, 6);
  assert.equal(th.counts.registerSlots.filled, 4); // 3 + 1
  assert.equal(facet(th, "translated").score, 1);
});

test("readinessFromBundles counts a missing key as untranslated", () => {
  const rollup = readinessFromBundles(
    {
      en: { a: "A", b: "B", c: "C", d: "D" },
      lo: { a: "ກ" },
    },
    "en",
  );
  const lo = rollup.locales.find((l) => l.locale === "lo");

  assert.equal(lo.counts.totalKeys, 4);
  assert.equal(lo.counts.translatedKeys, 1);
  assert.equal(facet(lo, "translated").score, 0.25);
});

test("readinessFromBundles folds real lint findings into the score", () => {
  // Vietnamese stored in decomposed form is a lint error: it will not compare
  // or sort correctly. The key is present and looks translated, so plain
  // coverage reports it as done -- readiness must not.
  const nfc = "Xin ch\u00e0o".normalize("NFC");
  const nfd = nfc.normalize("NFD");
  assert.notEqual(nfc, nfd); // guard against an editor normalising this file

  const clean = readinessFromBundles({ en: { hi: "Hello" }, vi: { hi: nfc } }, "en").locales[0];
  const broken = readinessFromBundles({ en: { hi: "Hello" }, vi: { hi: nfd } }, "en").locales[0];

  assert.equal(clean.counts.issues.errors, 0);
  assert.equal(broken.counts.issues.errors, 1);
  assert.ok(facet(broken, "lintClean").score < facet(clean, "lintClean").score);
  assert.ok(broken.score < clean.score);

  // Both are fully "translated" by the old metric -- that is the point.
  assert.equal(facet(clean, "translated").score, 1);
  assert.equal(facet(broken, "translated").score, 1);
});

test("bundles carry no draft state, so review scores as approved", () => {
  const rollup = readinessFromBundles({ en: { a: "A" }, vi: { a: "Ạ" } }, "en");
  assert.equal(facet(rollup.locales[0], "reviewed").score, 1);
  assert.equal(rollup.locales[0].counts.draftKeys, 0);
});

test("the reference locale is not scored against itself", () => {
  const rollup = readinessFromBundles({ en: { a: "A" }, th: { a: "ก" } }, "en");
  assert.deepEqual(
    rollup.locales.map((l) => l.locale),
    ["th"],
  );
});

test("contributions add up to the reported score", () => {
  const result = scoreReadiness({
    locale: "km",
    totalKeys: 37,
    translatedKeys: 21,
    filledRegisterSlots: 44,
    issues: [{ severity: "error" }, { severity: "warning" }, { severity: "warning" }],
    draftKeys: 9,
  });

  const summed = result.facets.reduce((total, f) => total + f.contribution, 0);
  assert.equal(Math.round(summed), result.score);

  // And each facet's deficit is the rest of its weight.
  for (const f of result.facets) {
    assert.equal(Math.round((f.contribution + f.deficit) * 100) / 100, f.weight * 100);
  }
});

test("coverage-shaped lint rules are not charged twice", () => {
  // missing-key and untranslated are gaps the translated facet already docked
  // points for. Charging them again in lintClean would penalise one defect
  // twice and let an unfinished project floor a facet that measures quality.
  const base = {
    locale: "th",
    totalKeys: 10,
    translatedKeys: 4,
    filledRegisterSlots: 12,
    draftKeys: 0,
  };

  const withoutDupes = scoreReadiness({ ...base, issues: [] });
  const withDupes = scoreReadiness({
    ...base,
    issues: [
      ...Array.from({ length: 6 }, () => ({ severity: "error", rule: "missing-key" })),
      ...Array.from({ length: 6 }, () => ({ severity: "warning", rule: "untranslated" })),
    ],
  });

  assert.equal(withDupes.score, withoutDupes.score);
  assert.equal(withDupes.counts.issues.errors, 0);
  assert.equal(facet(withDupes, "lintClean").score, 1);

  // A genuine quality rule still costs.
  const real = scoreReadiness({
    ...base,
    issues: [{ severity: "error", rule: "zawgyi-encoding" }],
  });
  assert.ok(real.score < withoutDupes.score);
});

test("issues with no rule are still counted, so raw severity input works", () => {
  const result = scoreReadiness({
    locale: "th",
    totalKeys: 10,
    translatedKeys: 10,
    issues: [{ severity: "error" }, { severity: "error" }],
  });
  assert.equal(result.counts.issues.errors, 2);
  assert.equal(facet(result, "lintClean").score, 0.8);
});

test("COVERAGE_RULES names rules the linter actually emits", () => {
  // Guards against the set drifting out of sync with lint.ts rule names.
  const emitted = new Set(
    readinessFromBundlesRuleNames({
      en: { a: "Hello there", b: "Goodbye" },
      th: { a: "Hello there" },
    }),
  );
  for (const rule of COVERAGE_RULES) {
    assert.ok(emitted.has(rule), `linter never emits "${rule}"`);
  }
});

test("the linter reads flat dotted keys, not just nested bundles", () => {
  // The API stores "cart.title" as a single flat key. Walking the path alone
  // found nothing there, so every rule silently passed on real project data
  // and the untranslated check crashed on the empty result.
  const flat = {
    en: { "app.title": "Storefront", "cart.items": "{count} items" },
    th: { "app.title": "ร้านค้า", "cart.items": "{count} ชิ้น" },
  };
  const nested = {
    en: { app: { title: "Storefront" }, cart: { items: "{count} items" } },
    th: { app: { title: "ร้านค้า" }, cart: { items: "{count} ชิ้น" } },
  };

  const flatIssues = lintBundle("th", flat.th, flat.en);
  const nestedIssues = lintBundle("th", nested.th, nested.en);

  // Thai needs a classifier between the count and the noun; both shapes catch it.
  assert.ok(flatIssues.some((i) => i.rule === "missing-classifier"));
  assert.deepEqual(
    flatIssues.map((i) => i.rule).sort(),
    nestedIssues.map((i) => i.rule).sort(),
  );
});

test("linting a bundle with a non-string node does not throw", () => {
  // Regression: values[0] was undefined and === refValues[0], then .length threw.
  assert.doesNotThrow(() =>
    lintBundle("th", { a: {} }, { a: {} }),
  );
  assert.doesNotThrow(() => lintBundle("th", {}, { "a.b": "Hello there" }));
});

test("readiness scores flat dotted bundles the same as nested ones", () => {
  const flat = readinessFromBundles(
    {
      en: { "app.title": "Storefront", "cart.empty": "Your cart is empty" },
      vi: { "app.title": "Cửa hàng", "cart.empty": "Giỏ hàng trống" },
    },
    "en",
  );
  const nested = readinessFromBundles(
    {
      en: { app: { title: "Storefront" }, cart: { empty: "Your cart is empty" } },
      vi: { app: { title: "Cửa hàng" }, cart: { empty: "Giỏ hàng trống" } },
    },
    "en",
  );

  assert.equal(flat.score, nested.score);
  assert.equal(flat.locales[0].counts.translatedKeys, 2);
});
