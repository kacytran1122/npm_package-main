# selakata

[![CI](https://github.com/kacytran1122/npm_package-main/actions/workflows/ci.yml/badge.svg)](https://github.com/kacytran1122/npm_package-main/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](package.json)
[![Locales](https://img.shields.io/badge/locales-29-2fd3b4.svg)](#every-language-we-support)
[![Countries](https://img.shields.io/badge/countries-12-2fd3b4.svg)](#every-language-we-support)

**A toolkit for making your app work in Southeast Asian languages.**

If your app needs to speak Vietnamese, Thai, Indonesian, Malay, Filipino,
Khmer, Burmese, or Lao, this handles the parts that other translation libraries
get wrong.

It covers **12 countries** and **29 languages**. That includes the mixed
languages people really type in, like Singlish and Taglish.

---

## Why you need this

Most translation libraries were built for European languages. They give you
two things: rules for plurals ("1 file" vs "2 files") and date formats. Then
they assume the rest is just swapping words from a list.

That works fine for French. It falls apart in Southeast Asia. Here is what
goes wrong, and what fixes it:

| The problem | What breaks | The fix |
| --- | --- | --- |
| Thai, Lao, Khmer, and Burmese don't put spaces between words | Your text runs off the edge of the screen. The browser can't find anywhere to start a new line. | `insertLineBreakOpportunities()` |
| Counting needs a special word | "2 mèo" is broken Vietnamese. You need "2 **con** mèo". | `formatCount()` |
| Thai politeness depends on who is speaking | Hard-code the word ครับ and your app sounds like a man talking, to every user, forever. | `politeParticle()` |
| Burmese text comes in two formats that look the same | Old Burmese text turns into gibberish for modern readers. | `detectMyanmarEncoding()` |
| Thailand uses a different calendar | Your app says 2026. Every Thai form says 2569. | Automatic for `th` |
| Vietnamese can spell the same word two ways | Search stops finding things. Sorting goes wrong. | `normalizeVietnamese()` |
| Burmese names have no last name | Your sign-up form rejects a real, legal name. | `nameFields()` |
| Jawi (Malay in Arabic script) reads right to left | Your layout needs to flip. | Built into every language |

---

## What you get

**The library** (`selakata`)

- Works with React, or on its own with plain JavaScript
- No other packages needed. It never calls the internet.
- **Line breaking** so text wraps instead of overflowing
- **Counting words** so numbers read correctly
- **Politeness levels** — formal, normal, and casual for every language
- **Javanese and Sundanese speech levels** (ngoko, madya, krama)
- **Money and dates** formatted the way each country writes them
- **Burmese text repair** for the old Zawgyi format
- **Right-to-left support** for Jawi
- **The right font** for each writing system, so Khmer and Burmese don't get cut off
- **Sensible fallbacks** — if a Javanese translation is missing, show Indonesian, not English
- **A checker** that finds common mistakes before your users do

**The optional server and dashboard**

- A web dashboard where translators can work
- AI-drafted translations (using Google Gemini) that wait for a human to approve them
- Roles: owner, translator, viewer
- Full history of every change
- Export to CSV, Android XML, or iOS `.strings`
- A **readiness score** out of 100 that tells you if a language is actually ready to ship

You can use the library completely on its own. The server and dashboard are
extra.

---

## What's in this repo

```
packages/
  sdk/         The library itself (published to npm as "selakata")
  server/      Optional API server (Express + MongoDB)
  dashboard/   Optional web dashboard for translators (React + Vite)
  site/        The documentation website (Astro + React)
```

---

## Get started

### Just the library

```bash
npm install selakata
```

With React:

```tsx
import { I18nProvider, useTranslation } from "selakata/react";

function App() {
  return (
    <I18nProvider locale="th" bundles={bundles} speakerGender="female">
      <Content />
    </I18nProvider>
  );
}

function Content() {
  const { t, currency, count } = useTranslation();

  return (
    <div>
      <h1>{t("hero.title")}</h1>
      <p>{t("thanks", {}, { polite: true })}</p>
      <p>{currency(2500)}</p>
      <p>{count(3, "หนังสือ", { category: "book" })}</p>
    </div>
  );
}
```

Without React:

```ts
import { formatCount, formatCurrency, formatDate, withPoliteness } from "selakata";

formatCount(2, "mèo", { locale: "vi", category: "animal" });  // "2 con mèo"
formatCount(2, "แมว", { locale: "th", category: "animal" });  // "แมว 2 ตัว"
formatCurrency(1500000, "vi");                                // "1.500.000 ₫"
formatDate(new Date(), "th", { dateStyle: "long" });          // Thai calendar
withPoliteness("ขอบคุณ", "th", { speakerGender: "female" });  // "ขอบคุณ ค่ะ"
```

More details: [`packages/sdk/README.md`](packages/sdk/README.md).

### Running this repo locally

You need Node 20 or newer.

```bash
# 1. Get the code
git clone https://github.com/kacytran1122/npm_package-main.git
cd npm_package-main

# 2. Install
npm install

# 3. Set up your settings file
cp .env.example .env
# Open .env and fill in JWT_SECRET and GEMINI_API_KEY

# 4. Start the database (optional)
docker compose up -d mongo
# You can skip this. Without a database the API keeps everything in memory,
# which is fine for testing but loses your data when you restart.

# 5. Run whichever part you need
npm run dev:server      # API           → http://localhost:5000
npm run dev:dashboard   # Dashboard     → http://localhost:5173
npm run dev:site        # Docs website  → http://localhost:4321
```

### Running with Docker

```bash
cp .env.example .env
# Fill in real values. JWT_SECRET must be 32 characters or longer,
# and you must change MONGO_ROOT_PASSWORD from "changeme".

chmod +x deploy.sh
./deploy.sh
# Dashboard → http://localhost
# API       → http://localhost/api/v1
```

The docs website is separate and has no backend, so it only starts if you ask
for it:

```bash
docker compose -f docker-compose.prod.yml --profile site up -d site
# Website → http://localhost:8080   (change the port with SITE_PORT)
```

See [DEPLOY.md](DEPLOY.md) for HTTPS, backups, and upgrades.

---

## Using it with other frameworks

### Next.js and server components

Import from `selakata/server`. That version leaves out anything that needs a
browser.

```ts
import { localeFromRequest, htmlAttributes } from "selakata/server";

const locale = localeFromRequest({
  acceptLanguage: headers.get("accept-language"),
  country: headers.get("cf-ipcountry"),
});

<html {...htmlAttributes(locale)}>  // { lang: "ms-Arab", dir: "rtl" }
```

Notice that the visitor's country wins over their browser language setting.
That is on purpose. A phone bought in Cambodia often reports `en-US` even
though its owner reads Khmer.

### React Native

It works as-is. Anything that needs a browser quietly does nothing instead of
crashing.

---

## Command line tools

| Command | What it does |
| --- | --- |
| `npx sela init` | Create a config file and a `locales/` folder |
| `npx sela lint locales/` | Check your translations for common mistakes |
| `npx sela readiness locales/` | Score how ready each language is to ship |
| `npx sela info th` | Show everything the library knows about a language |

---

## The API

Only needed if you run the optional server.

| Method | Route | What it does |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Create an account |
| `POST` | `/api/v1/auth/login` | Log in and get a token |
| `GET` | `/api/v1/locales` | List languages and their settings |
| `GET` | `/api/v1/projects` | List your projects |
| `POST` | `/api/v1/projects` | Create a project |
| `POST` | `/api/v1/projects/:id/rotate-key` | Get a new API key (owner only) |
| `POST` | `/api/v1/projects/:id/members` | Invite a translator or viewer |
| `GET` `POST` | `/api/v1/projects/:id/keys` | List or add text entries |
| `PUT` | `/api/v1/projects/:id/keys/:keyId` | Update one translation |
| `POST` | `/api/v1/projects/:id/keys/:keyId/draft` | Ask the AI for a draft |
| `POST` | `/api/v1/projects/:id/import` | Upload a whole JSON file |
| `GET` | `/api/v1/projects/:id/lint` | Check for mistakes |
| `GET` | `/api/v1/projects/:id/readiness` | Get the readiness score |
| `GET` | `/api/v1/projects/:id/revisions` | See the change history |
| `GET` | `/api/v1/projects/:id/export` | Download as JSON, CSV, Android, or iOS |
| `GET` | `/api/v1/bundle` | What the library downloads (needs an API key) |

---

## The readiness score

Most translation tools show you one number: percent translated. That number
lies to you.

A language can be 100% translated and still be unusable. Maybe a machine wrote
every line and nobody checked. Maybe every Thai sentence is in the casual
style, so your formal screens sound rude. Maybe half the Burmese is in the old
broken format.

So the score combines four things instead of one:

| What it checks | Weight | Meaning |
| --- | --- | --- |
| Translated | 35% | Does the text exist at all? |
| Politeness levels | 25% | Does it exist at each politeness level the language uses? |
| Clean | 25% | Does it pass the mistake checker? |
| Reviewed | 15% | Did a real person approve it? |

Missing text is the worst and most obvious problem, so it counts most.
Politeness and cleanliness come next, and together they outweigh raw coverage,
because that is where the real bugs hide in this region. Review counts least,
not because it matters least, but because it is the easiest to catch up on.

Two things keep this honest:

- **Each language is judged by its own rules.** Javanese is checked for all
  three of its speech levels. Bahasa gaul has no formal level at all, so it is
  never marked down for missing one.
- **Mistakes are only counted once.** Missing text already lowers the first
  score, so it doesn't lower the "clean" score too.

Run it:

```bash
npx sela readiness --verbose
```

```
km                 ភាសាខ្មែរ          #########...........  46  D
                                       6 entries still untranslated.
th                 ไทย                ############........  60  C
                                       17 politeness slots are empty.
vi                 Tiếng Việt         #################...  84  B
                                       12 politeness slots are empty.

Project 63/100 (C) across 3 languages, threshold 75.
Below threshold: km, th
```

Add `--strict` and it fails when any language scores below your threshold
(75 by default), so you can put it in your build pipeline. The same score is
available from the API and from the library, so your dashboard, your build,
and your scripts all agree.

---

## Every language we support

| Code | Language | Writing system | Direction | Countries |
| --- | --- | --- | --- | --- |
| `en` | English | Latin | left to right | SG MY PH BN PG |
| `vi` | Vietnamese | Latin | left to right | VN |
| `th` | Thai | Thai | left to right | TH |
| `id` | Indonesian | Latin | left to right | ID |
| `jv` | Javanese | Latin | left to right | ID |
| `jv-Java` | Javanese | Javanese | left to right | ID |
| `su` | Sundanese | Latin | left to right | ID |
| `ms` | Malay | Latin | left to right | MY BN SG |
| `ms-Arab` | Malay (Jawi) | Arabic | **right to left** | MY BN |
| `ms-BN` | Malay (Brunei) | Latin | left to right | BN |
| `ms-Arab-BN` | Malay (Brunei, Jawi) | Arabic | **right to left** | BN |
| `fil` | Filipino | Latin | left to right | PH |
| `ceb` | Cebuano | Latin | left to right | PH |
| `my` | Burmese | Myanmar | left to right | MM |
| `shn` | Shan | Myanmar | left to right | MM |
| `km` | Khmer | Khmer | left to right | KH |
| `lo` | Lao | Lao | left to right | LA |
| `tet` | Tetum | Latin | left to right | TL |
| `pt-TL` | Portuguese | Latin | left to right | TL |
| `en-SG` | English (Singapore) | Latin | left to right | SG |
| `zh-Hans-SG` | Chinese (Singapore) | Chinese | left to right | SG |
| `ta-SG` | Tamil (Singapore) | Tamil | left to right | SG |
| `ms-SG` | Malay (Singapore) | Latin | left to right | SG |
| `tpi` | Tok Pisin | Latin | left to right | PG |
| `en-PG` | English (PNG) | Latin | left to right | PG |
| `fil-x-taglish` | Taglish | Latin | left to right | PH |
| `en-SG-x-singlish` | Singlish | Latin | left to right | SG |
| `id-x-gaul` | Bahasa gaul | Latin | left to right | ID |
| `ms-x-manglish` | Manglish | Latin | left to right | MY |

Southeast Asia usually means eleven countries. We include Papua New Guinea as
a twelfth because it shares a border with Indonesia and sits in on ASEAN
meetings. If you disagree, ignore the `PG` rows.

---

## Settings

These go in your `.env` file. Only needed for the optional server.

| Name | Required? | Default | What it does |
| --- | --- | --- | --- |
| `JWT_SECRET` | Yes | — | Secret used to sign login tokens. **Must be 32+ characters.** The server won't start with a short one. Make one with `openssl rand -hex 32`. |
| `MONGO_CONNECTION_URL` | In production | — | Where your database lives. Without it, data is kept in memory and lost on restart. |
| `GEMINI_API_KEY` | Only for AI | — | Your Google AI Studio key. Not needed if you use Vertex instead. |
| `GEMINI_USE_VERTEX` | No | `false` | Use Google Vertex AI instead. Bills to your Google Cloud account. |
| `GOOGLE_CLOUD_PROJECT` | Only with Vertex | — | Your Google Cloud project ID. |
| `GOOGLE_CLOUD_LOCATION` | No | `us-central1` | Which Vertex region to use. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Which AI model writes the drafts. |
| `JWT_EXPIRY` | No | `7d` | How long a login lasts. |
| `CORS_ORIGIN` | No | `*` | Which websites may call your API. |
| `MAX_KEYS_PER_PROJECT` | No | `20000` | Limit on entries per project. `0` means no limit. |
| `MONGO_ROOT_PASSWORD` | No | `changeme` | Database password (Docker only). `deploy.sh` refuses to run with the default. |
| `SITE_PORT` | No | `8080` | Which port the docs website uses. |
| `AI_PROVIDER` | No | `gemini` | Which AI service to use. |

---

## What's coming

- Edit Malay in Latin script and publish it in Jawi, kept in sync automatically
- Work out the right counting word from the noun, so you don't have to say
- Approve translations over WhatsApp, since that's where translators in this
  region actually are
- Track which politeness level users respond to best
- Open the counting-word tables to native speakers to contribute

---

## How much you can trust each part

Some of this is exact. Some is a best guess. The difference matters, so here it is.

**Exact.** Language settings, currencies, calendars, plural rules, and
Vietnamese spelling normalisation come from CLDR, the standard data that ships
with every browser and version of Node. These have one correct answer and we
use it.

**Measured.** Splitting text into words is our own code, not the browser's.
We had to write it ourselves for three reasons: the browser's version doesn't
exist on React Native, it gives different answers on different versions, and
it cuts Thai and Burmese text in places that look broken. We tested ours
against hand-marked example sentences: **96.9% accurate versus the browser's
93.5%**, and identical results on every version we tried, where the browser's
changed its answer on 8.6% of sentences. Full details, including where ours is
worse: [`packages/sdk/docs/segmentation.md`](packages/sdk/docs/segmentation.md).

**Hand-made.** The counting words, pronouns, and politeness words were typed
in by hand. They cover normal, everyday usage. They are not a complete grammar.
Have a native speaker read your final text.

**Best guess.** Converting old Burmese text and writing Malay in Arabic script
are approximate by nature. The code says so when you call it. Jawi spelling
in particular varies between publishers in ways no simple conversion can
capture.

Found a mistake in any of the 29 languages? That's a bug. Please report it.

---

## Where this idea came from

The shape of this project comes from
[BhashaJS](https://github.com/thesantoshpant/bhashajs), which does the same job
for South Asia. The language problems are completely different, so none of the
code is shared.

The technical approach is different too, on purpose. BhashaJS leans on the
browser's built-in language tools, which is the right call for South Asian
scripts: they use spaces, so the hard parts are plurals and number formats, and
the browser has those exactly right. Southeast Asia's hard part is the space
that never gets written down, and there the browser's answer is either missing
or inconsistent. So we wrote that part ourselves, and
[measured it](packages/sdk/docs/segmentation.md) to prove it was worth doing.

**What the name means.** In Malay and Indonesian, *sela* is a gap and *kata* is
a word. **Selakata** is the space between words — the thing Thai, Khmer, Lao,
and Burmese never write down, and the thing this library has to work out before
it can wrap a line, count something, or search your text.

---

## Licence

MIT. Use it for anything.
