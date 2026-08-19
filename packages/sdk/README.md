# selakata

[![npm version](https://img.shields.io/npm/v/selakata.svg)](https://www.npmjs.com/package/selakata)
[![CI](https://github.com/kacytran1122/npm_package-main/actions/workflows/ci.yml/badge.svg)](https://github.com/kacytran1122/npm_package-main/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen.svg)](https://github.com/kacytran1122/npm_package-main/blob/main/packages/sdk/LICENSE)

**Help your app feel natural in Southeast Asia.**

Translation is more than replacing English words with words from another
language. An app can use the correct words and still feel wrong to the people
reading them.

- A Thai date may show the year 2026 when people expect 2569.
- A Vietnamese count may say “2 mèo” instead of the natural “2 con mèo.”
- A Burmese person may be forced to enter a surname they do not have.
- Thai, Lao, Khmer, or Burmese text may run off the screen because there are no
  spaces between words.
- Jawi text may flow in the wrong direction.

Selakata handles these local details for your app.

It supports **12 countries** and **29 language or regional variants**, including
everyday mixed language such as Singlish, Taglish, Manglish, and bahasa gaul.

## See the difference

| What can go wrong                                 | What selakata does                           |
| ------------------------------------------------- | -------------------------------------------- |
| Thai dates use the wrong year                     | Uses the Buddhist calendar when appropriate  |
| Counting sounds unnatural                         | Adds the counting word people expect         |
| A name form requires a surname                    | Returns name fields that fit the culture     |
| Text without spaces cannot wrap                   | Finds safe places to break the line          |
| Old Burmese text looks broken                     | Detects and converts Zawgyi text             |
| Jawi reads from the wrong side                    | Returns the correct right-to-left direction  |
| An app always sounds too formal or too casual     | Supports formal, normal, and casual language |
| A Thai message speaks as the wrong speaker gender | Handles the correct politeness ending        |

Selakata does **not** write translations for you. It helps the translations you
already have behave naturally inside a real product.

## Try it

Install the library:

```bash
npm install selakata
```

Then use only the helpers you need:

```js
import {
  formatCount,
  formatCurrency,
  formatDate,
  withPoliteness,
} from "selakata";

formatCount(2, "mèo", { locale: "vi", category: "animal" });
// "2 con mèo"

formatCurrency(1500000, "vi");
// "1.500.000 ₫"

formatDate(new Date(), "th", { dateStyle: "long" });
// Thai date with the Buddhist year

withPoliteness("ขอบคุณ", "th", { speakerGender: "female" });
// "ขอบคุณ ค่ะ"
```

The library has no required runtime dependencies. React support is optional.

## What you get

- Local dates, money, numbers, and number symbols.
- Natural counting words for Vietnamese, Thai, Khmer, Burmese, Lao,
  Indonesian, Malay, and Filipino.
- Formal, normal, and casual ways of speaking.
- Thai politeness that follows the speaker.
- Safe line wrapping for writing systems that do not use spaces.
- Vietnamese text cleanup for search, sorting, and URLs.
- Burmese Zawgyi detection and conversion.
- Right-to-left support for Jawi.
- Name forms that do not assume everyone has a first and last name.
- Sensible language fallbacks based on what people in the region can read.
- A command-line checker that catches common mistakes before release.

## Use it with React

```tsx
import { I18nProvider, useTranslation } from "selakata/react";

function App() {
  return (
    <I18nProvider locale="th" bundles={bundles} speakerGender="female">
      <Checkout />
    </I18nProvider>
  );
}

function Checkout() {
  const { t, currency, count } = useTranslation();

  return (
    <>
      <h1>{t("checkout.title")}</h1>
      <p>{currency(2500)}</p>
      <p>{count(3, "หนังสือ", { category: "book" })}</p>
    </>
  );
}
```

The provider updates the page language and reading direction. It also adds safe
line-break opportunities for writing systems without spaces.

For server components, middleware, and other code without a browser, use
`selakata/server`:

```ts
import { htmlAttributes, localeFromRequest } from "selakata/server";

const locale = localeFromRequest({
  acceptLanguage: request.headers.get("accept-language"),
  country: request.headers.get("cf-ipcountry"),
});

htmlAttributes(locale); // for example: { lang: "ms-Arab", dir: "rtl" }
```

React Native is supported too. Browser-only behaviour quietly does nothing
instead of crashing.

## Check your translations before launch

The package includes a command named `sela`.

| Command                            | What it means                               |
| ---------------------------------- | ------------------------------------------- |
| `npx sela init --country VN`       | Start a translation folder for one country  |
| `npx sela lint --dir locales`      | Find common language mistakes               |
| `npx sela readiness --dir locales` | See which languages are ready for customers |
| `npx sela info th`                 | Show what selakata knows about Thai         |

“100% translated” does not always mean “ready.” Text may still be unreviewed,
sound too casual, or contain an old Burmese encoding.

The readiness score asks four simple questions:

| Question                                  | Weight |
| ----------------------------------------- | -----: |
| Is every message translated?              |    35% |
| Are the needed politeness levels present? |    25% |
| Does the mistake checker pass?            |    25% |
| Did a person review the text?             |    15% |

```bash
npx sela readiness --dir locales --verbose --strict
```

With `--strict`, the command fails when a language is not ready. This lets your
automatic release process stop before customers see unfinished text.

## Countries and languages

| Country          | Included language and regional variants                                |
| ---------------- | ---------------------------------------------------------------------- |
| Brunei           | Malay, Jawi Malay, English                                             |
| Cambodia         | Khmer, English                                                         |
| Indonesia        | Indonesian, Javanese, Javanese script, Sundanese, bahasa gaul, English |
| Laos             | Lao, English                                                           |
| Malaysia         | Malay, Jawi Malay, Manglish, English                                   |
| Myanmar          | Burmese, Shan, English                                                 |
| Philippines      | Filipino, Cebuano, Taglish, English                                    |
| Singapore        | English, Chinese, Malay, Tamil, Singlish                               |
| Thailand         | Thai, English                                                          |
| Timor-Leste      | Tetum, Portuguese, English                                             |
| Vietnam          | Vietnamese, English                                                    |
| Papua New Guinea | Tok Pisin, English                                                     |

Papua New Guinea is included as an additional regional entry. If it is outside
your definition of Southeast Asia, simply ignore the `PG` entries.

## Helpful language fallbacks

When a translation is missing, selakata does not always jump straight to
English. It first tries a language the reader is more likely to understand.

```text
Javanese  → Indonesian → English
Lao       → Thai       → English
Cebuano   → Filipino   → English
Shan      → Burmese    → English
Jawi      → Malay      → English
```

You can inspect or change these choices through the public API.

## What to double-check

Selakata contains rules and common language patterns, but language is shaped by
people, place, age, and context.

- Counting words, pronouns, and politeness cover common use, not every dialect.
- Zawgyi conversion and automatic Jawi spelling cannot be perfect in every
  document.
- The built-in word splitter is measured on test sentences, but unusual names
  and new words can still need help.

Have a native speaker review important customer-facing text. If you find a
mistake, please [open an issue](https://github.com/kacytran1122/npm_package-main/issues).

## More information

- [GitHub project](https://github.com/kacytran1122/npm_package-main)
- [Complete word-splitting evaluation](https://github.com/kacytran1122/npm_package-main/blob/main/packages/sdk/docs/segmentation.md)
- [Changes in each version](https://github.com/kacytran1122/npm_package-main/blob/main/packages/sdk/CHANGELOG.md)

## Why the name?

In Malay and Indonesian, _sela_ means a gap and _kata_ means a word.
**Selakata** is the space between words. Thai, Khmer, Lao, and Burmese often do
not write that space, but software still needs to understand it.

## Licence

MIT. Use it for personal or commercial projects.
