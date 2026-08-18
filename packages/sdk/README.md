# selakata

Internationalization built for Southeast Asia.

`selakata` covers 12 countries and 29 locales. It handles the things general
i18n libraries leave to your application: numeral classifiers, politeness that
changes with the speaker, Buddhist Era dates, Zawgyi detection, line breaking
for scripts without spaces, and names that have no surname.

It has no runtime dependencies. React is optional.

```bash
npm install selakata
```

## Why this exists

Most i18n libraries were designed around European languages. They assume words
are separated by spaces, that plural means "add an s", and that every person
has a first name and a last name. None of that holds across this region.

Here is what breaks in practice.

| Problem | What goes wrong | What this package does |
| --- | --- | --- |
| Thai, Lao, Khmer, and Burmese have no spaces | Text overflows its container because the browser finds no place to wrap | `insertLineBreakOpportunities()` |
| Counting needs a classifier | "2 mèo" reads as broken Vietnamese | `formatCount()` |
| Thai politeness marks the speaker's gender | Hardcoding ครับ makes your product speak as a man | `politeParticle()` |
| Myanmar has two incompatible encodings | Zawgyi text renders as noise for Unicode readers | `detectMyanmarEncoding()` |
| Thailand uses Buddhist Era | Your date says 2026, every Thai form says 2569 | Buddhist calendar by default for `th` |
| Vietnamese has two Unicode spellings per word | Search and sort silently fail | `normalizeVietnamese()`, `toSearchKey()` |
| Burmese names have no surname | Your form rejects a valid legal name | `nameFields()` |
| Jawi is right to left | A Malay app supporting Jawi needs real RTL | `dir` on every locale |

## Quick start

```ts
import { createI18n } from "selakata";

const i18n = createI18n({
  locale: "vi",
  register: "formal",
  bundles: {
    vi: {
      greeting: { formal: "Chào quý khách", casual: "Chào cậu" },
      cart: "Giỏ hàng của bạn",
    },
    en: { greeting: "Hello", cart: "Your cart" },
  },
});

i18n.t("greeting");                                  // "Chào quý khách"
i18n.currency(1500000);                              // "1.500.000 ₫"
i18n.count(2, "mèo", { category: "animal" });        // "2 con mèo"
i18n.pronoun("you");                                 // "quý khách"
```

## Coverage

Twelve countries. The eleven sovereign states of Southeast Asia, plus Papua New
Guinea on the eastern edge, which holds ASEAN observer status. If your
definition of the region excludes it, ignore the `PG` entry.

| Country | Currency | Locales |
| --- | --- | --- |
| Brunei | BND | `ms-BN`, `ms-Arab-BN`, `en` |
| Cambodia | KHR | `km`, `en` |
| Indonesia | IDR | `id`, `jv`, `jv-Java`, `su`, `id-x-gaul`, `en` |
| Laos | LAK | `lo`, `en` |
| Malaysia | MYR | `ms`, `ms-Arab`, `ms-x-manglish`, `en` |
| Myanmar | MMK | `my`, `shn`, `en` |
| Philippines | PHP | `fil`, `ceb`, `fil-x-taglish`, `en` |
| Singapore | SGD | `en-SG`, `zh-Hans-SG`, `ms-SG`, `ta-SG`, `en-SG-x-singlish` |
| Thailand | THB | `th`, `en` |
| Timor-Leste | USD | `tet`, `pt-TL`, `en` |
| Vietnam | VND | `vi`, `en` |
| Papua New Guinea | PGK | `tpi`, `en-PG`, `en` |

Code-mixed locales are first class. Taglish, Singlish, Manglish, and bahasa
gaul are how people actually write. They are proper locales here, not broken
versions of something else, and each falls back to its base language.

## Fallback chains

A missing key does not jump straight to English. It walks a chain that reflects
what people in the region actually read.

```
jv  -> id  -> en      Javanese speakers all read Indonesian
su  -> id  -> en
lo  -> th  -> en      Lao and Thai are close, and Thai media is everywhere
shn -> my  -> en
ceb -> fil -> en
tet -> pt-TL -> en    Portuguese is co-official in Timor-Leste
ms-Arab -> ms -> en   Same language, different script
```

```ts
import { negotiateLocale, fallbackChain } from "selakata";

fallbackChain("lo");                      // ["lo", "th", "en"]
negotiateLocale(["jv"], ["id", "en"]);    // "id"
```

## Numeral classifiers

You cannot say "2 cats" in Vietnamese, Thai, Khmer, Lao, or Burmese. You say
the equivalent of "2 CLF cat" or "cat 2 CLF". The classifier depends on what
kind of thing the noun is, and the word order depends on the language.

```ts
import { formatCount } from "selakata";

formatCount(2, "mèo", { locale: "vi", category: "animal" });   // "2 con mèo"
formatCount(2, "แมว", { locale: "th", category: "animal" });   // "แมว 2 ตัว"
formatCount(3, "buku", { locale: "id", category: "book" });    // "3 buah buku"
formatCount(3, "libro", { locale: "fil" });                    // "3 na libro"

formatCount(2, "แมว", { locale: "th", category: "animal", nativeDigits: true });
// "แมว ๒ ตัว"
```

Categories: `person`, `animal`, `thing`, `book`, `vehicle`, `flat`, `long`,
`round`, `building`, `plant`, `pair`, `cloth`.

## Politeness and register

Every message can have `formal`, `neutral`, and `casual` variants. Javanese
speech levels (krama, madya, ngoko) map onto the same scale.

```ts
import { pronoun, politeParticle, withPoliteness } from "selakata";

pronoun("vi", "you", { register: "formal" });   // "quý khách"
pronoun("jv", "you", { register: "formal" });   // "panjenengan"
pronoun("th", "i", { speakerGender: "female" }); // "ดิฉัน"
```

In Thai, Burmese, and Khmer the polite sentence-final particle marks the
gender of the **speaker**, not the listener. An app speaking in its own voice
has to make a choice.

```ts
politeParticle("th", { speakerGender: "male" });                        // "ครับ"
politeParticle("th", { speakerGender: "female" });                      // "ค่ะ"
politeParticle("th", { speakerGender: "female", sentenceType: "question" }); // "คะ"
politeParticle("th", { speakerGender: "neutral" });                     // null
```

That last one returns `null` on purpose. Thai has no neutral polite particle.
The API says so instead of guessing for you.

## Numbers, money, and dates

```ts
import { formatCurrency, formatDate, toNativeDigits } from "selakata";

formatCurrency(1500000, "vi");   // "1.500.000 ₫"   no decimals
formatCurrency(50000, "id");     // "Rp 50.000"     no decimals
formatCurrency(2500, "th");      // "฿2,500.00"

toNativeDigits("2569", "th");    // "๒๕๖๙"
toNativeDigits("2026", "my");    // "၂၀၂၆"

formatDate(new Date(), "th", { dateStyle: "long" });
// "18 สิงหาคม 2569"   Buddhist Era, the default for Thai

formatDate(new Date(), "th", { dateStyle: "long", calendar: "gregory" });
// "18 สิงหาคม 2026"
```

The dong, rupiah, riel, kip, and kyat are quoted whole. Nobody writes
`1.500.000,00 ₫` on a receipt.

## Text without spaces

```ts
import { words, wordCount, truncate, insertLineBreakOpportunities } from "selakata";

words("ฉันรักภาษาไทย", "th");     // ["ฉัน", "รัก", "ภาษา", "ไทย"]
wordCount("ฉันรักภาษาไทย", "th"); // 4
truncate("ฉันรักภาษาไทยมาก", "th", 8);
insertLineBreakOpportunities("ฉันรักภาษาไทย", "th"); // adds zero-width spaces
```

Prefer CSS `word-break: auto-phrase` where you can. Use
`insertLineBreakOpportunities()` for the places you cannot, such as SVG text,
canvas, and PDF generation.

## Myanmar encoding

Zawgyi and Unicode use the same Unicode block with different meanings. They
look identical in the wrong font and turn to noise in the right one. A large
share of Burmese text on the open web is still Zawgyi.

```ts
import { detectMyanmarEncoding, normalizeMyanmar } from "selakata";

detectMyanmarEncoding(input);
// { encoding: "zawgyi", confidence: 0.75, signals: ["medial stored before its consonant"] }

normalizeMyanmar(input); // converts only if it looks like Zawgyi
```

Conversion is best effort. It handles ordinary Burmese prose including medials,
stacked consonants, kinzi, and the reordered e-vowel. For archival work where
losses are unacceptable, use Google's `myanmar-tools`.

## Vietnamese text

```ts
import { normalizeVietnamese, foldVietnamese, slugifyVietnamese, fromTelex } from "selakata";

normalizeVietnamese(input);          // NFC, so comparisons work
foldVietnamese("Đà Nẵng");           // "Da Nang"
slugifyVietnamese("Hồ Chí Minh");    // "ho-chi-minh"
fromTelex("Vieejt");                 // "Việt"
```

## Names

```ts
import { nameFields, formatName } from "selakata";

nameFields("MM");
// one required field, labelled "Name". Burmese names have no family name.

nameFields("ID");
// family name present but not required. Many Indonesians are legally mononymous.

formatName({ family: "Nguyễn", middle: "Văn", given: "An" }, "VN");
// "Nguyễn Văn An"

formatName({ given: "Ahmad", patronymic: "bin", family: "Ismail" }, "MY");
// "Ahmad bin Ismail"
```

## React

```tsx
import { I18nProvider, useTranslation, Trans, LanguageSwitcher } from "selakata/react";

function App() {
  const [locale, setLocale] = useState("th");

  return (
    <I18nProvider locale={locale} bundles={bundles} register="formal">
      <LanguageSwitcher onChange={setLocale} />
      <Content />
    </I18nProvider>
  );
}

function Content() {
  const { t, currency, count } = useTranslation();

  return (
    <div>
      <Trans id="hero.title" />
      <p>{currency(2500)}</p>
      <p>{count(3, "หนังสือ", { category: "book" })}</p>
    </div>
  );
}
```

The provider sets `lang` and `dir` on the document, loads the right Google Font
for the script, and `<Trans>` adds break opportunities for unspaced scripts.

## Server and SSR

`selakata/server` has no React and no DOM, so it is safe in React Server
Components, middleware, and edge runtimes.

```ts
import { localeFromRequest, htmlAttributes } from "selakata/server";

const locale = localeFromRequest({
  cookie: cookies.get("locale"),
  country: headers.get("cf-ipcountry"),
  acceptLanguage: headers.get("accept-language"),
  available: ["th", "vi", "id", "en"],
});

const { lang, dir } = htmlAttributes(locale);
```

Country beats `Accept-Language` on purpose. A phone bought in Cambodia often
reports `en-US` while its owner reads Khmer.

## Fonts

The default system font on most devices has no glyphs for Khmer, Burmese, Lao,
or Javanese, and clips Thai and Vietnamese diacritics at normal line heights.

```ts
import { fontLinkHref, fontFaceCss } from "selakata";

fontLinkHref(["th", "km", "my"]);  // one Google Fonts URL
fontFaceCss(["th", "km", "my"]);   // per-language stack, line height, and direction
```

## CLI

```bash
npx sela init --country VN     # scaffold locale files and a config
npx sela lint --strict         # check bundles for regional mistakes
npx sela readiness             # release readiness score per locale
npx sela info TH               # what this package knows about a country
```

`lint` catches the errors that survive review because the reviewer cannot read
the script:

```
th (Thai)
  warn   app.tagline  [gendered-particle]
         Hardcoded Thai polite particle. This makes your product speak as a
         specific gender. Use withPoliteness() so it stays configurable.
  warn   cart  [missing-classifier]
         Thai needs a numeral classifier between the count and the noun.
```

Rules: `zawgyi-encoding`, `vietnamese-nfc`, `gendered-particle`,
`hardcoded-plural`, `missing-classifier`, `no-break-opportunity`,
`hardcoded-currency`, `missing-placeholder`, `unknown-placeholder`,
`missing-key`, `untranslated`, `empty-value`.

## Release readiness

`readiness` answers the question coverage cannot: is this locale shippable? It
scores four facets that fail independently and weights them into one number out
of 100.

| Facet | Weight | What it measures |
| --- | --- | --- |
| `translated` | 35% | The keys exist at all |
| `registerDepth` | 25% | They exist at every register the language distinguishes |
| `lintClean` | 25% | They survive the rules above |
| `reviewed` | 15% | A human signed off, not just the model |

A locale that is 100% translated but entirely machine-drafted scores 85, not
100. A locale whose Thai exists only in the neutral register loses two thirds
of the register facet, because the formal screens have nothing to render.

Register depth is measured against the language rather than a fixed three, so
bahasa gaul is held to neutral and casual and is not penalised for having no
formal register. Lint density is per translated key, and `missing-key` and
`untranslated` are excluded from the lint facet because `translated` has
already priced them in.

```ts
import { readinessFromBundles, scoreReadiness } from "selakata";

// From JSON bundles, for CI.
const report = readinessFromBundles({ en, vi, th, km }, "en", 75);
report.score;             // 63
report.grade;             // "C"
report.blocking;          // ["km", "th"]
report.locales[0].topDrag // the facet costing the most points, with a reason

// Or from your own counts, if translations live somewhere else.
scoreReadiness({
  locale: "th",
  totalKeys: 200,
  translatedKeys: 200,
  filledRegisterSlots: 600,
  issues: [],
  draftKeys: 200,
}).score; // 85 -- fully translated, wholly unreviewed
```

Everything is pure arithmetic over counts. Nothing reads the network, a
database, or the clock, so the same project always scores the same.

## Scope and honesty

Some things here are exact and some are best effort. The difference matters, so
it is stated plainly.

**Exact.** Locale metadata, currency handling, calendars, plural rules,
segmentation, and Vietnamese normalization all sit on CLDR and `Intl`, which
ship with every current runtime.

**Curated.** Classifier tables, pronouns, and politeness particles are compiled
by hand. They cover common usage. They are not a full grammar, and a native
reviewer should still check your final copy.

**Best effort.** Zawgyi conversion and Jawi transliteration are approximate by
nature. Both are documented as such at the call site. Jawi orthography in
particular varies by publisher and drops vowels in ways no character map can
capture.

This package does not translate text. It has no AI, no server, and no
dashboard. It formats, validates, and gets out of the way.

## Prior art

The idea and the shape of the API are borrowed from
[BhashaJS](https://github.com/thesantoshpant/bhashajs), which does this for
South Asia. The linguistic problems are entirely different, so the
implementation shares no code.

The name is Malay and Indonesian: *sela*, a gap or interval, and *kata*, a
word. **Selakata** is the space between words — the thing Thai, Khmer, Lao, and
Burmese never write down, and the thing this package has to infer before it can
wrap a line, count a noun, or search a string.

## License

MIT
