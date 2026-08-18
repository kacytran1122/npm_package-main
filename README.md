# selakata

**The first i18n developer tool purpose-built for Southeast Asian languages.**

Selakata is an open-source internationalization platform that provides AI-powered translations, a management dashboard, and a React SDK, all designed specifically for Vietnamese, Thai, Indonesian, Javanese, Malay, Jawi, Filipino, Cebuano, Burmese, Shan, Khmer, Lao, Tetum, and Tok Pisin.

It covers **12 countries** and **29 locales**, including the code-mixed varieties people actually type in: Singlish, Manglish, Taglish, and bahasa gaul.

## Why this exists

Most i18n libraries were designed around European grammar. They give you plural rules and date formats, then assume the rest is a lookup table. Southeast Asia breaks that assumption in ways that are not cosmetic.

| Problem | What goes wrong | What this does |
| --- | --- | --- |
| Thai, Lao, Khmer, and Burmese have no spaces | Text overflows its container because the browser finds nowhere to wrap | `insertLineBreakOpportunities()` |
| Counting requires a classifier | "2 mèo" is broken Vietnamese | `formatCount()` |
| Thai politeness marks the speaker's gender | Hardcoding ครับ makes your product speak as a man, forever | `politeParticle()` |
| Myanmar has two incompatible encodings | Zawgyi text renders as noise for Unicode readers | `detectMyanmarEncoding()` |
| Thailand uses the Buddhist Era | Your date says 2026, every Thai form says 2569 | Buddhist calendar by default for `th` |
| Vietnamese has two Unicode spellings per word | Search and sort silently fail | `normalizeVietnamese()` |
| Burmese names have no surname | Your signup form rejects a valid legal name | `nameFields()` |
| Jawi is right to left | A Malay app supporting Jawi needs real RTL | `dir` on every locale |

## Features

- **React SDK** (`selakata`) — `<I18nProvider>`, `useTranslation()`, `<LanguageSwitcher>`, `<Trans>`
- **Register-aware translations** — one key produces formal, neutral, and casual variants per language; pick at render time
- **Speech levels** — Javanese ngoko, madya, and krama, and Sundanese loma and lemes, mapped onto a portable ladder
- **Speaker-aware politeness** — sentence particles and pronouns resolved from register plus speaker gender
- **Numeral classifiers** — grammatical counted phrases, with the correct word order per language
- **Code-mixed locales as first-class** — Singlish (`en-SG-x-singlish`), Manglish (`ms-x-manglish`), Taglish (`fil-x-taglish`), bahasa gaul (`id-x-gaul`) are proper locales, not "broken" English or Indonesian
- **Compliance lock** — keys marked `regulated` only ever serve human-approved values; AI drafts are held until reviewed
- **Zawgyi detection and conversion** — guard your imports and repair legacy Burmese
- **Southeast Asian formatting** — whole-unit currencies (VND, IDR, KHR, LAK, MMK) never show phantom decimals
- **RTL support** — automatic layout flipping for Jawi
- **Script-aware fonts** — the right face and line height per script, because Khmer and Burmese clip at Latin line heights
- **Fallback chains** — Javanese falls back to Indonesian, Lao to Thai, Cebuano to Filipino, before ever reaching English
- **AI translations** — Gemini-powered, register and classifier aware, with translation memory and glossary enforcement
- **A linter for regional bugs** — catches missing classifiers, hardcoded gendered particles, English plural hacks, and placeholder drift
- **Release readiness scoring** — one number out of 100 per locale, weighing coverage, register depth, lint cleanliness, and human review, because "100% translated" does not mean shippable
- **Dashboard** — manage keys, invite translators, review AI drafts, export to CSV, Android XML, and iOS `.strings`
- **Team collaboration** — owner, translator, and viewer roles with per-language assignment
- **Version history** — a full audit trail of every translation change
- **API key auth** — apps get a project API key, no JWT needed in client code

## Architecture

```
packages/
  sdk/         — React SDK and core library (npm: selakata)
  server/      — Express + MongoDB API
  dashboard/   — React + Vite admin UI
```

The SDK is standalone and has no runtime dependencies. The server and dashboard are optional; you can use the SDK with plain JSON files and never run either.

## Quick start (development)

```bash
# Prerequisites: Node 20+, MongoDB running locally (or use Docker)

# 1. Clone
git clone https://github.com/kacytran1122/selakata.git
cd selakata

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env, add JWT_SECRET and GEMINI_API_KEY

# 4. Start MongoDB
docker compose up -d mongo
# Or skip it entirely: with no MONGO_CONNECTION_URL the API uses an
# in-memory store, which is fine for local work and loses data on restart.

# 5. Run
npm run dev:server      # API on :5000
npm run dev:dashboard   # Dashboard on :5173
```

## Quick start (Docker, production)

```bash
cp .env.example .env
# Fill in real values. JWT_SECRET must be 32+ chars and
# MONGO_ROOT_PASSWORD must not be left as changeme.

chmod +x deploy.sh
./deploy.sh
# Dashboard: http://localhost
# API:       http://localhost/api/v1
```

See [DEPLOY.md](DEPLOY.md) for TLS, backups, and upgrades.

## SDK usage

```bash
npm install selakata
```

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

Core functions work without React:

```ts
import { formatCount, formatCurrency, formatDate, withPoliteness } from "selakata";

formatCount(2, "mèo", { locale: "vi", category: "animal" });  // "2 con mèo"
formatCount(2, "แมว", { locale: "th", category: "animal" });  // "แมว 2 ตัว"
formatCurrency(1500000, "vi");                                // "1.500.000 ₫"
formatDate(new Date(), "th", { dateStyle: "long" });          // Buddhist Era
withPoliteness("ขอบคุณ", "th", { speakerGender: "female" });  // "ขอบคุณ ค่ะ"
```

Full SDK documentation lives in [`packages/sdk/README.md`](packages/sdk/README.md).

### Next.js and RSC

Import from `selakata/server` in server components. It excludes React context and every browser-only path.

```ts
import { localeFromRequest, htmlAttributes } from "selakata/server";

const locale = localeFromRequest({
  acceptLanguage: headers.get("accept-language"),
  country: headers.get("cf-ipcountry"),
});

<html {...htmlAttributes(locale)}>  // { lang: "ms-Arab", dir: "rtl" }
```

Country beats `Accept-Language` on purpose. A phone bought in Cambodia often reports `en-US` while its owner reads Khmer.

### React Native

The SDK works out of the box. DOM and font calls are no-ops when `document` is unavailable.

## CLI

| Command | Purpose |
| --- | --- |
| `npx sela init` | Scaffold `sela.config.json` and `locales/` |
| `npx sela lint locales/` | Run the regional linter |
| `npx sela readiness locales/` | Score release readiness per locale |
| `npx sela info th` | Inspect what the package knows about a locale or country |

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Create an account |
| `POST` | `/api/v1/auth/login` | Exchange credentials for a JWT |
| `GET` | `/api/v1/locales` | Locale metadata, direction, and fallback chains |
| `GET` | `/api/v1/projects` | Projects you belong to |
| `POST` | `/api/v1/projects` | Create a project |
| `POST` | `/api/v1/projects/:id/rotate-key` | Rotate the API key, owner only |
| `POST` | `/api/v1/projects/:id/members` | Invite a translator or viewer |
| `GET` `POST` | `/api/v1/projects/:id/keys` | List or create keys |
| `PUT` | `/api/v1/projects/:id/keys/:keyId` | Set one translation, recorded as a revision |
| `POST` | `/api/v1/projects/:id/keys/:keyId/draft` | Draft with AI |
| `POST` | `/api/v1/projects/:id/import` | Bulk import nested locale JSON |
| `GET` | `/api/v1/projects/:id/lint` | Run the regional linter |
| `GET` | `/api/v1/projects/:id/readiness` | Release readiness score per locale |
| `GET` | `/api/v1/projects/:id/revisions` | Audit trail |
| `GET` | `/api/v1/projects/:id/export` | Export as `json`, `csv`, `android`, or `ios` |
| `GET` | `/api/v1/bundle` | What the SDK fetches; API key auth |

## Release readiness

Percent-translated is the metric every i18n tool reports, and it is the one
that lies. A locale can sit at 100% and still be unshippable: every string
machine-drafted and unreviewed, every Thai key written only in the neutral
register so the formal screens read as blunt, half the Burmese still in Zawgyi.
Coverage says done. The build says otherwise.

So readiness is a weighted composite of four facets that fail independently:

| Facet | Weight | What it measures |
| --- | --- | --- |
| `translated` | 35% | The keys exist at all |
| `registerDepth` | 25% | They exist at every politeness level the language distinguishes |
| `lintClean` | 25% | They survive the regional linter |
| `reviewed` | 15% | A human signed off, not just the model |

Coverage still leads, because a missing string is the worst failure and the
most visible. Register depth and lint cleanliness are weighted equally behind
it and together outweigh coverage, because in this region that is where the
real defects hide. Review is smallest, not because it matters least, but
because it is the facet that recovers fastest once someone works the queue.

Two details that keep the number honest:

- **Register depth is measured against the language, not a fixed three.**
  Javanese is held to all of ngoko, madya, and krama; bahasa gaul, which has no
  formal register at all, is held to neutral and casual and is not penalised
  for the one it does not have.
- **Lint density is per translated key, and coverage-shaped lint rules are
  dropped.** `missing-key` and `untranslated` are already priced into
  `translated`; charging them again in `lintClean` would bill one defect twice
  and floor the quality facet on a project whose only problem is being
  unfinished.

```bash
npx sela readiness --verbose
```

```
km                 ភាសាខ្មែរ          #########...........  46  D
                                       Translated: 6 keys still untranslated.
th                 ไทย                ############........  60  C
                                       Register depth: 17 register slots empty across formal, neutral, casual.
vi                 Tiếng Việt         #################...  84  B
                                       Register depth: 12 register slots empty across formal, neutral, casual.

Project 63/100 (C) across 3 locale(s), threshold 75.
Below threshold: km, th
```

`--strict` exits non-zero when any locale falls below `--threshold` (default
75), so this drops straight into CI. The same scoring is on the API at
`GET /projects/:id/readiness` and in the SDK as `scoreReadiness()` and
`readinessFromBundles()`, so a dashboard, a CI job, and a script all read the
same scale.

## Supported locales

| Code | Language | Script | Direction | Countries |
| --- | --- | --- | --- | --- |
| `en` | English | Latin | LTR | SG MY PH BN PG |
| `vi` | Vietnamese | Latin | LTR | VN |
| `th` | Thai | Thai | LTR | TH |
| `id` | Indonesian | Latin | LTR | ID |
| `jv` | Javanese | Latin | LTR | ID |
| `jv-Java` | Javanese | Javanese | LTR | ID |
| `su` | Sundanese | Latin | LTR | ID |
| `ms` | Malay | Latin | LTR | MY BN SG |
| `ms-Arab` | Malay (Jawi) | Arabic | **RTL** | MY BN |
| `ms-BN` | Malay (Brunei) | Latin | LTR | BN |
| `ms-Arab-BN` | Malay (Brunei, Jawi) | Arabic | **RTL** | BN |
| `fil` | Filipino | Latin | LTR | PH |
| `ceb` | Cebuano | Latin | LTR | PH |
| `my` | Burmese | Myanmar | LTR | MM |
| `shn` | Shan | Myanmar | LTR | MM |
| `km` | Khmer | Khmer | LTR | KH |
| `lo` | Lao | Lao | LTR | LA |
| `tet` | Tetum | Latin | LTR | TL |
| `pt-TL` | Portuguese | Latin | LTR | TL |
| `en-SG` | English (Singapore) | Latin | LTR | SG |
| `zh-Hans-SG` | Chinese (Singapore) | Han | LTR | SG |
| `ta-SG` | Tamil (Singapore) | Tamil | LTR | SG |
| `ms-SG` | Malay (Singapore) | Latin | LTR | SG |
| `tpi` | Tok Pisin | Latin | LTR | PG |
| `en-PG` | English (PNG) | Latin | LTR | PG |
| `fil-x-taglish` | Taglish | Latin | LTR | PH |
| `en-SG-x-singlish` | Singlish | Latin | LTR | SG |
| `id-x-gaul` | Bahasa gaul | Latin | LTR | ID |
| `ms-x-manglish` | Manglish | Latin | LTR | MY |

Southeast Asia is usually counted as eleven sovereign states. Papua New Guinea is the twelfth here because it shares a land border with Indonesia and holds ASEAN observer status. If your definition excludes it, ignore the `PG` entries.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `JWT_SECRET` | Yes | — | Secret for signing tokens. **Must be 32+ chars**; the server refuses to boot on a short value. Generate with `openssl rand -hex 32` |
| `MONGO_CONNECTION_URL` | In production | — | MongoDB connection string. Without it the API uses an in-memory store and refuses to start in production |
| `GEMINI_API_KEY` | No* | — | Google AI Studio key. *Required unless `GEMINI_USE_VERTEX=true` |
| `GEMINI_USE_VERTEX` | No | `false` | Use Vertex AI instead. Bills to your GCP project; `GEMINI_API_KEY` is ignored |
| `GOOGLE_CLOUD_PROJECT` | No | — | GCP project id, required when `GEMINI_USE_VERTEX=true` |
| `GOOGLE_CLOUD_LOCATION` | No | `us-central1` | Vertex AI region |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Model used for drafts |
| `JWT_EXPIRY` | No | `7d` | Token lifetime |
| `CORS_ORIGIN` | No | `*` | Allowed origins, comma-separated |
| `MAX_KEYS_PER_PROJECT` | No | `20000` | Key cap per project. `0` disables it |
| `MONGO_ROOT_PASSWORD` | No | `changeme` | MongoDB root password, Docker only. `deploy.sh` refuses the default |
| `AI_PROVIDER` | No | `gemini` | Translation provider |

## Roadmap

- **Script-variant round-tripping** — edit Malay in Rumi, publish in Jawi, keeping both in sync from one source
- **Classifier inference** — infer the right classifier from the noun instead of asking for a category
- **WhatsApp translator CMS** — approvals over WhatsApp, which is where translator pools in this region actually are
- **Conversion-tied register selection** — report which register users complete flows with, and surface the best performer per locale
- **Community classifier tables** — the tables are curated by hand today; open them to native-speaker contribution with review

## Scope and honesty

Some of this is exact and some is best effort, and the difference matters.

**Exact.** Locale metadata, currencies, calendars, plural rules, segmentation, and Vietnamese normalization sit on CLDR and `Intl`, which ship with every current runtime.

**Curated.** Classifier tables, pronouns, and politeness particles are compiled by hand. They cover common usage. They are not a full grammar, and a native reviewer should still check your final copy.

**Best effort.** Zawgyi conversion and Jawi transliteration are approximate by nature, and both say so at the call site. Jawi orthography in particular varies by publisher and drops vowels in ways no character map can capture.

Corrections in any of the 29 locales are welcome and are treated as bugs.

## Prior art

The shape of this project is borrowed from [BhashaJS](https://github.com/thesantoshpant/bhashajs), which does the same job for South Asia. The linguistic problems are entirely different, so the implementation shares no code.

The name is Malay and Indonesian: *sela*, a gap or interval, and *kata*, a word. **Selakata** is the space between words — the thing Thai, Khmer, Lao, and Burmese never write down, and the thing this package has to infer before it can wrap a line, count a noun, or search a string.

## License

MIT
