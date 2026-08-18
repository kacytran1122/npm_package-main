# Segmentation: why this package does not use `Intl.Segmenter`

Thai, Lao, Khmer, Burmese, and Chinese are written without spaces. Before this
package can wrap a line, count a word, truncate a label, or build a search key,
it has to decide where one unit ends and the next begins. That decision is the
single most load-bearing thing in the library, and until this change it was
delegated wholesale to `Intl.Segmenter`.

Delegating is the obvious move and it is what every JavaScript i18n library
does. It is also wrong here, for reasons that are measurable rather than
aesthetic. This document is the evidence.

Reproduce everything below with:

```bash
npm run build
npm run bench            # accuracy, safety, throughput, availability
npm run bench:footprint  # bytes
```

---

## 1. What was wrong with delegating

### 1.1 It is not available

`Intl.Segmenter` requires the host to ship ICU. React Native on Hermes does
not, and this SDK documents React Native support. Neither do Node builds
configured with `small-icu` or `--without-intl`, nor several embedded and edge
runtimes. There is no feature-detect that helps: the alternative to a working
segmenter was an exception.

Measured, by deleting the global and re-running:

| approach | with `Intl.Segmenter` deleted |
| --- | --- |
| `Intl.Segmenter` | throws |
| orthographic (rules only) | works |
| lexical (shipped default) | works |

### 1.2 Its answer changes with the host's ICU version

This is the one that turns into a production bug rather than a support-matrix
footnote. The same 220 segmentations, run on three Node versions:

```
ICU 76.1 (node v22.14.0)  vs  ICU 78.3 (node v24.18.0)
19 of 220 segmentations differ.
```

All 19 are grapheme boundaries, and 18 of them are Khmer. ICU 76 takes
`ខ្ញុំស្រឡាញ់` apart as `ខ្|ញុំ|ស្|រ|ឡា|ញ់`; ICU 78 gets it right. Same code,
same input, different answer.

For a server-rendered application that means the HTML produced on Node 22 and
the HTML React computes in a browser with a newer engine do not match, and
hydration reports a mismatch on any string that was truncated or measured. It
also means a snapshot test passes on one CI runner and fails on another.

This package's own stack, over the same 220 inputs on all three runtimes,
hashes identically. It has no version-dependent data because it has no external
data.

### 1.3 Its grapheme boundaries are not safe to cut at

`truncate()` and `graphemeLength()` cut at cluster boundaries. UAX #29 is an
encoding-level algorithm and deliberately says nothing about orthography, so
some of the boundaries it offers are places no reader would accept a cut:

- Thai and Lao write `เ แ โ ใ ไ` **before** the consonant they are pronounced
  after. They are letters, not combining marks, so UAX #29 makes each one its
  own cluster and a truncation can end a label on a dangling `เ`.
- The Thai spacing vowels `ะ า ำ ๅ` are also letters, so a line can be started
  with a bare `า`.
- Burmese marks a killed final consonant with asat. `န်` in `ကျွန်` is a
  well-formed cluster and a syllable coda; cutting before it leaves `ကျွ`,
  which is a different syllable.

Judged by `bench/legality.mjs` — written from the Unicode properties and
sharing no code with the implementation, so a bug in the cluster rules cannot
score itself as correct:

| locale | source | offsets offered | illegal | rate | most common reason |
| --- | --- | --- | --- | --- | --- |
| `th` | Intl grapheme | 498 | 99 | **19.9%** | orphaned trailing vowel (62) |
| `th` | orthographic | 399 | 0 | 0.0% | — |
| `lo` | Intl grapheme | 263 | 60 | **22.8%** | orphaned trailing vowel (46) |
| `lo` | orthographic | 203 | 0 | 0.0% | — |
| `km` | Intl grapheme | 205 | 0 | 0.0% | — (see below) |
| `km` | orthographic | 205 | 0 | 0.0% | — |
| `my` | Intl grapheme | 279 | 130 | **46.6%** | coda split from syllable (66) |
| `my` | orthographic | 149 | 0 | 0.0% | — |
| `zh` | Intl grapheme | 122 | 0 | 0.0% | — |
| `zh` | orthographic | 122 | 0 | 0.0% | — |

Khmer reads 0% here because this table was produced on ICU 78. On Node 20 and
Node 22 the same table reports **44 illegal offsets, 17.7%**, all of them
coeng stacks coming apart. The defect rate is a property of the runtime, not of
the input — which is 1.2 restated as a number.

`Intl.Segmenter`'s *word* boundaries, by contrast, are legal everywhere: 0
illegal breaks across the whole corpus. The problem is specific to grapheme
granularity, and grapheme granularity is what truncation uses.

---

## 2. The approaches evaluated

Three implementations of the same interface, measured on the same data.

**A — `intl`.** `Intl.Segmenter`, the previous behaviour and the baseline. It
lives in `bench/`, not in `src/`, because shipping it would put the dependency
back.

**B — `orthographic`.** Rule-based clustering, no data at all. UAX #29 extended
grapheme clusters implemented from the rule set, then tailored per script: Thai
and Lao leading vowels attach rightwards, their spacing vowels attach
leftwards, Khmer coeng pulls the next consonant under the base, Burmese virama
stacks and asat marks a coda. Every cluster boundary is a word boundary.

**C — `lexical`.** A unigram Viterbi search over B's cluster lattice against a
curated per-language lexicon. A run of clusters that spells a known word is
kept together; anything unrecognised falls back to bounded chunks. This is the
shipped default.

### Why a lattice of clusters rather than of characters

The lattice's atoms are orthographic clusters, so no path through it can
produce an illegal cut — safety is structural, not something the cost model has
to be tuned into. It also shortens the search: a Thai sentence has roughly a
third as many cluster boundaries as character offsets.

Clusters slightly finer than a true syllable are harmless, because the lattice
merges them back into words. Clusters *coarser* than a syllable would hide a
real boundary from the search. The rules therefore err fine.

### The cost model

Word cost is `log(rank + 40)`, a Zipf approximation over hand-ordered frequency
bands. Storing ranks rather than frequencies means a contributor adding a word
only decides roughly where it goes.

Unknown runs cost `9.0 + 0.8k + qk²` for `k` clusters. The quadratic term is
the important one. With a flat or linear penalty the cheapest cover of an
unknown run is always the longest chunk the window allows, so an
out-of-vocabulary sentence comes back as one unbreakable block — precisely the
overflow this package exists to prevent. A quadratic term gives cost-per-cluster
an interior minimum at `sqrt(9.0 / q)`, which is where unknown runs get cut.

`q` is set per script so that minimum lands on the language's mean word length,
measured on the dev split:

| script | mean clusters per word | 
| --- | --- |
| Thai | 2.89 |
| Lao | 2.38 |
| Khmer | 2.17 |
| Burmese | 1.46 |
| Han | 1.45 |

One shared constant is not usable across that range. Tuning it to Thai alone
cost Chinese 40 points of recall in an earlier revision — 56.4% against the
96.3% it reaches now.

---

## 3. Results

### 3.1 Accuracy

Boundary precision, recall, and F1 against `bench/data/corpus.json`,
hand-annotated and split in two. The lexicon was written from general frequency
and then checked against **dev** only; no entry was added because of a **test**
sentence and no constant was tuned against one. Quote the test split.

**Held-out test split**

| locale | A `intl` F1 | B `orthographic` F1 | C `lexical` F1 |
| --- | --- | --- | --- |
| `th` | **95.5** | 52.4 | 92.6 |
| `lo` | 93.0 | 58.5 | **100.0** |
| `km` | 93.0 | 55.1 | **97.4** |
| `my` | 97.0 | 82.3 | **98.1** |
| `zh-Hans-SG` | 88.9 | 78.0 | **96.3** |
| **macro** | 93.5 | 65.3 | **96.9** |

**Dev split**, for contrast — and as a caution. C scores 99.8 macro there, which
is what fitting a lexicon to a corpus looks like. The 3.3-point gap between
99.8 and 96.9 is the honest measure of how much of the dev number is real.

Where C loses, it loses to Thai, by 2.9 points, and the losses are compound
boundaries: ICU's Thai dictionary knows tens of thousands of words and this
lexicon knows 264. Where C wins it wins on recall, because ICU's Khmer and
Chinese dictionaries miss words that a small well-chosen lexicon happens to
hold.

That gap will move as the lexicon grows. `registerWords()` closes it for any
specific application immediately.

### 3.2 Line-overflow risk

The longest stretch with no break opportunity, in clusters. This sets the
widest unbreakable box a layout has to accommodate, which is the actual
symptom the feature exists to fix.

| split | A `intl` | B `orthographic` | C `lexical` |
| --- | --- | --- | --- |
| dev | 10 | 2 | 10 |
| test | 6 | 2 | 6 |

A wash against ICU, and both are bounded — which is the point. B's 2 is not a
virtue; it is what over-segmentation looks like.

### 3.3 Throughput

Characters per millisecond, warm, Node 24:

| locale | A `intl` | B `orthographic` | C `lexical` |
| --- | --- | --- | --- |
| `th` | 27,895 | 5,920 | 3,777 |
| `lo` | 26,515 | 6,540 | 4,640 |
| `km` | 31,489 | 7,311 | 4,636 |
| `my` | 27,317 | 7,982 | 6,459 |
| `zh-Hans-SG` | 11,369 | 6,815 | 4,700 |

ICU is C++ and is roughly 5–7× faster. In absolute terms C segments a 60-character
interface string in about 16 microseconds and a 2,000-character paragraph in
about half a millisecond. For the workload this package has — labels, buttons,
paragraphs, at render time — that is not a number anyone can perceive. It would
matter for bulk corpus processing, which is not what an i18n SDK does.

### 3.4 Bytes

Minified and gzipped, over the locale registry the package already ships:

| target | min | gzip | marginal gzip |
| --- | --- | --- | --- |
| locale registry (shared baseline) | 10.0 KB | 2.3 KB | — |
| rules only | 15.3 KB | 4.6 KB | +2.3 KB |
| with lexicon (shipped default) | 46.0 KB | 12.3 KB | +10.0 KB |
| whole package entry point | 82.8 KB | 24.9 KB | — |

The lexicons are 7.7 KB gzipped of that, about 220 entries per language.
Delegating to ICU costs zero bytes, so this is the real price of the change,
and it is the reason `setSegmentationEngine(orthographicEngine)` exists: an
application that only needs line breaking can drop the lexicon and the
Viterbi search and pay 2.3 KB.

---

## 4. The decision

Approach **C** ships, with **B** as a supported opt-out and as the automatic
fallback for any locale with no lexicon.

C is chosen on this reasoning:

- It is **more accurate than the baseline** on held-out data, 96.9 against 93.5
  macro F1, winning four locales of five.
- It is **available**, which the baseline is not on Hermes or on any ICU-less
  runtime.
- It is **deterministic**. Identical output on ICU 76, 77, and 78, where the
  baseline changed its answer on 8.6% of inputs. For a library used in server
  rendering this is a correctness property, not a nicety.
- Its **cuts are always legal**, where the baseline's grapheme boundaries are
  illegal on 20% of Thai offsets, 23% of Lao, 47% of Burmese, and — depending
  on the runtime — 18% of Khmer.
- It costs **10 KB gzipped and roughly 16 microseconds per interface string**,
  both of which are affordable at the size this buys.

B alone is not enough: 65.3 macro F1 makes `wordCount()` and search keys wrong,
even though its breaks are perfectly safe. A is not enough for the reasons
above. C is B plus the data that fixes B's only weakness.

---

## 5. What was deliberately *not* replaced

`Intl.PluralRules`, `Intl.NumberFormat`, `Intl.DateTimeFormat`, and
`Intl.Collator` stay. The reasoning that condemns `Intl.Segmenter` acquits
them:

- They are **CLDR-exact**. Plural categories and currency formats are published
  data with a right answer, not an algorithm with a quality dial. Reimplementing
  them could only introduce drift.
- Their **cross-version instability is a feature**: when a country redenominates
  or CLDR corrects a format, the host updating is how the fix arrives.
- Replacing them means **shipping CLDR**, which is orders of magnitude larger
  than a 7.7 KB lexicon, and going stale between releases.

The distinction is between delegating a *lookup* and delegating a *judgement*.
Segmentation is a judgement, it has no single right answer, it is where the
region's languages are least well served by generic tooling, and it is the one
place where the host's answer both varies and is unavailable. That is why it is
the piece that moved in-house.

## 6. Limitations

- The corpus is 125 sentences across five languages, annotated by the author
  against ordinary orthographic practice rather than a published standard. It
  is large enough to separate these approaches and too small to publish a
  ranking against.
- Word segmentation in these languages has no single correct answer at the
  margins. Thai compounds and Burmese particles are judgement calls, and a
  different annotator would score every approach here a few points differently.
  The *gap* between approaches on identical data is the trustworthy part.
- The lexicons are hand-curated and cover roughly 220 common forms per
  language. They are not a dictionary. Applications with domain vocabulary
  should call `registerWords()`.
- Thai remains the one locale where ICU's much larger dictionary wins. Growing
  the Thai lexicon is the highest-value contribution this module can receive.
