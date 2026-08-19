# selakata

[![npm version](https://img.shields.io/npm/v/selakata.svg)](https://www.npmjs.com/package/selakata)
[![CI](https://github.com/kacytran1122/npm_package-main/actions/workflows/ci.yml/badge.svg)](https://github.com/kacytran1122/npm_package-main/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](package.json)
[![Locales](https://img.shields.io/badge/locales-29-2fd3b4.svg)](#every-language-we-support)
[![Countries](https://img.shields.io/badge/countries-12-2fd3b4.svg)](#every-language-we-support)

**Make your app feel at home in Southeast Asia.**

Most translation tools can replace English words with Thai, Vietnamese, Malay,
or Burmese words. That is only the first step.

A sentence can be translated correctly and still feel wrong. The date may use
the wrong calendar. A number may be missing the small word people expect when
counting. A Burmese name may be rejected because it has no surname. Thai or
Khmer text may run off the screen because there are no spaces between words.

Selakata handles those details for you.

[View selakata on npm](https://www.npmjs.com/package/selakata)

## The idea in one minute

| What a person sees                                | What went wrong                                       | What selakata does                          |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| Thai text shows the year 2026 instead of 2569     | Thailand commonly uses the Buddhist calendar          | Formats the date the local way              |
| A Vietnamese app says “2 mèo”                     | Counting often needs an extra word, such as “con”     | Produces “2 con mèo”                        |
| A Burmese user cannot sign up without a last name | Many Burmese names do not have a surname              | Gives you the right name fields             |
| Thai, Lao, Khmer, or Burmese text overflows       | These languages often do not put spaces between words | Finds safe places to wrap the line          |
| Jawi text flows left to right                     | Jawi uses Arabic writing                              | Returns the correct right-to-left direction |
| Old Burmese text looks broken                     | It may use the older Zawgyi format                    | Detects and converts it                     |

The package covers **12 countries** and **29 language or regional variants**,
including everyday mixed language such as Singlish, Taglish, Manglish, and
bahasa gaul.

## Try it

```bash
npm install selakata
```

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

There are no required runtime dependencies. React support is optional.

## What you get

- Dates, money, numbers, and local digits formatted the way people expect.
- Counting words for languages where “two cats” needs more than a number and a noun.
- Formal, normal, and casual language choices.
- Thai politeness that follows the speaker.
- Safe line wrapping for writing systems that do not use spaces.
- Vietnamese text cleanup for search, sorting, and URLs.
- Burmese Zawgyi detection and conversion.
- Right-to-left support for Jawi.
- Name forms that do not force every person to have a first and last name.
- Sensible language fallbacks based on what people in the region can read.
- A checker that catches common mistakes before release.

Selakata does not translate your sentences. It helps the translations you
already have behave correctly inside a real product.

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

For Next.js server components, import from `selakata/server`. It contains the
parts that do not need a browser.

```ts
import { htmlAttributes, localeFromRequest } from "selakata/server";

const locale = localeFromRequest({
  acceptLanguage: headers.get("accept-language"),
  country: headers.get("cf-ipcountry"),
});

htmlAttributes(locale); // for example: { lang: "ms-Arab", dir: "rtl" }
```

React Native works too. Browser-only behaviour quietly does nothing instead of
crashing.

## Useful tools from the command line

The package includes a command named `sela`.

| Command                            | Plain-English meaning                      |
| ---------------------------------- | ------------------------------------------ |
| `npx sela init --country VN`       | Start a translation folder for one country |
| `npx sela lint --dir locales`      | Find common language mistakes              |
| `npx sela readiness --dir locales` | See which languages are ready to release   |
| `npx sela info th`                 | Show what selakata knows about Thai        |

### A better “ready to launch” score

“100% translated” does not mean “ready for customers.” Machine-written text
may still be unreviewed, a formal screen may sound casual, or old Burmese text
may still be broken.

The readiness score looks at four things:

| Question                                  | Weight |
| ----------------------------------------- | -----: |
| Is every message translated?              |    35% |
| Are the needed politeness levels present? |    25% |
| Does the mistake checker pass?            |    25% |
| Did a person review the text?             |    15% |

```bash
npx sela readiness --dir locales --verbose --strict
```

With `--strict`, the command fails when a language is below your chosen
threshold. That makes it useful in a release pipeline.

## Every language we support

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

## How language fallback works

When a translation is missing, selakata does not always jump straight to
English. It first tries a language the reader is more likely to understand.

```text
Javanese  → Indonesian → English
Lao       → Thai       → English
Cebuano   → Filipino   → English
Shan      → Burmese    → English
Jawi      → Malay      → English
```

You can inspect or override the choice through the public API.

## The optional translation workspace

The npm package works by itself. This repository also contains an optional
server and dashboard for teams that manage translations together.

It adds:

- translator, viewer, and owner roles;
- a history of every change;
- AI-written drafts that wait for human approval;
- import and export for JSON, CSV, Android XML, and iOS strings;
- the same mistake checker and readiness score used by the command line.

```text
packages/
  sdk/         npm package: selakata
  server/      optional API
  dashboard/   optional translator workspace
  site/        documentation website
```

## Run this repository

You need Node 20 or newer.

```bash
git clone https://github.com/kacytran1122/npm_package-main.git
cd npm_package-main
npm install

npm run dev:site
npm run dev:server
npm run dev:dashboard
```

The library and documentation do not need a database. The optional server can
keep temporary data in memory for local testing. For production deployment,
database setup, environment variables, Docker, HTTPS, backups, and upgrades,
see [DEPLOY.md](DEPLOY.md).

## What to trust—and what to double-check

Some answers are exact:

- country and language settings;
- currencies and calendars;
- plural rules;
- Vietnamese spelling normalisation.

Some answers are measured. The built-in word splitter was tested on
hand-marked sentences and scored **96.9 macro boundary F1**—a score for how
often it found the correct word breaks—compared with **93.5** for the browser
across the same evaluation. The full method and its weak spots are in
[the segmentation report](packages/sdk/docs/segmentation.md).

Some answers are hand-written or approximate:

- counting words, pronouns, and politeness cover common everyday use, not every dialect;
- Zawgyi conversion and automatic Jawi spelling cannot be perfect in every document.

Have a native speaker review important customer-facing text. If you find a
mistake, please open an issue—it is a bug, not something users should work
around.

## Why the name?

In Malay and Indonesian, _sela_ means a gap and _kata_ means a word.
**Selakata** is the space between words—the space that Thai, Khmer, Lao, and
Burmese often do not write, but software still needs to understand.

The project was inspired by
[BhashaJS](https://github.com/thesantoshpant/bhashajs), which solves a similar
problem for South Asia.

## Licence

MIT. Use it for personal or commercial projects.
