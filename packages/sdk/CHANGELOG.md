# Changelog

All notable changes to `selakata` are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-08-19

### Changed

- Made the GitHub and npm READMEs easier for non-technical readers to
  understand.
- Removed all em dashes from the README text.

## [0.1.1] - 2026-08-19

### Changed

- Rewrote the npm README in plain language so non-technical readers can quickly
  understand the problem selakata solves and the value it provides.

## [0.1.0] - 2026-08-18

Initial release.

### Added

- `createI18n()` with register-aware translation, pronouns, and gendered Thai
  politeness particles.
- 12 countries and 29 locales, exposed as `LOCALES`, `COUNTRIES`,
  `localesForCountry()`, `negotiateLocale()`, and `resolveLocale()`.
- Numeral classifiers via `formatCount()` for Vietnamese, Thai, Khmer, Burmese,
  Lao, Indonesian, Malay, and Filipino.
- Buddhist Era dates by default for `th`, plus locale-aware number, currency,
  and native-digit formatting.
- Line breaking for unspaced scripts: `insertLineBreakOpportunities()`,
  `truncate()`, `segmentWords()`, and `segmentSentences()`, with a rule-based
  fallback for runtimes without `Intl.Segmenter`.
- Zawgyi detection and conversion (`detectMyanmarEncoding()`), Vietnamese
  normalization (`normalizeVietnamese()`, `toSearchKey()`), and Jawi/RTL
  metadata on every locale.
- `nameFields()` for locales where a person has no surname.
- React bindings at `selakata/react` and a Node entry at `selakata/server`.
- `sela` CLI: `init`, `lint`, and `readiness`.

[0.1.2]: https://github.com/kacytran1122/npm_package-main/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kacytran1122/npm_package-main/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kacytran1122/npm_package-main/releases/tag/v0.1.0
