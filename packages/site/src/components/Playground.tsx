import { useMemo, useState } from "react";
import {
  classifierFor,
  detectMyanmarEncoding,
  normalizeMyanmar,
  formatCount,
  formatCurrency,
  formatDate,
  hasSpeechLevels,
  particleIsGendered,
  politeParticle,
  pronoun,
  resolveLocale,
  speechLevel,
  toBuddhistYear,
  usesClassifiers,
  withPoliteness,
  type ClassifierCategory,
  type Register,
  type SpeakerGender,
} from "selakata";

/**
 * Four things generic i18n gets wrong in this region, wired to the real
 * package so the output is whatever the library actually returns.
 */

type Tab = "count" | "polite" | "money" | "encoding";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: "count", label: "Counting", blurb: "You cannot say “2 cats” here." },
  { id: "polite", label: "Politeness", blurb: "The speaker's gender is in the grammar." },
  { id: "money", label: "Money and dates", blurb: "Thailand is in the year 2569." },
  { id: "encoding", label: "Burmese encoding", blurb: "Two encodings, one code block." },
];

const COUNT_LOCALES = ["vi", "th", "km", "lo", "my", "id", "ms", "fil", "zh-Hans-SG"];

const NOUNS: Record<string, Partial<Record<ClassifierCategory, string>>> = {
  vi: { animal: "mèo", book: "sách", person: "bạn", vehicle: "xe" },
  th: { animal: "แมว", book: "หนังสือ", person: "คน", vehicle: "รถ" },
  km: { animal: "ឆ្មា", book: "សៀវភៅ", person: "អ្នក", vehicle: "ឡាន" },
  lo: { animal: "ແມວ", book: "ປຶ້ມ", person: "ຄົນ", vehicle: "ລົດ" },
  my: { animal: "ကြောင်", book: "စာအုပ်", person: "လူ", vehicle: "ကား" },
  id: { animal: "kucing", book: "buku", person: "orang", vehicle: "mobil" },
  ms: { animal: "kucing", book: "buku", person: "orang", vehicle: "kereta" },
  fil: { animal: "pusa", book: "libro", person: "tao", vehicle: "sasakyan" },
  "zh-Hans-SG": { animal: "猫", book: "书", person: "人", vehicle: "车" },
};

const CATEGORIES: ClassifierCategory[] = ["animal", "book", "person", "vehicle"];

const POLITE_LOCALES = ["th", "km", "my", "jv", "vi", "id"];
const MONEY_LOCALES = ["vi", "th", "id", "km", "lo", "my", "ms", "fil", "en-SG"];

const ZAWGYI_SAMPLE = "ျမန္မာစာ";

export default function Playground() {
  const [tab, setTab] = useState<Tab>("count");

  return (
    <div className="pg">
      <div className="pg__tabs" role="tablist" aria-label="Demo">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`pg-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="pg-panel"
            className={tab === t.id ? "pg__tab pg__tab--on" : "pg__tab"}
            onClick={() => setTab(t.id)}
          >
            <span className="pg__tabLabel">{t.label}</span>
            <span className="pg__tabBlurb">{t.blurb}</span>
          </button>
        ))}
      </div>

      <div
        className="pg__body"
        id="pg-panel"
        role="tabpanel"
        aria-labelledby={`pg-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "count" && <CountDemo />}
        {tab === "polite" && <PoliteDemo />}
        {tab === "money" && <MoneyDemo />}
        {tab === "encoding" && <EncodingDemo />}
      </div>

      <style>{`
        .pg {
          border: 1px solid var(--seam);
          border-radius: 14px;
          background: var(--raised);
          overflow: hidden;
        }

        .pg__tabs {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
          border-bottom: 1px solid var(--seam);
        }

        .pg__tab {
          text-align: left;
          padding: 16px 18px;
          background: transparent;
          border: 0;
          border-left: 1px solid var(--seam);
          color: var(--muted);
          font: inherit;
          cursor: pointer;
          transition: background-color .18s var(--step), color .18s var(--step);
        }

        .pg__tab:first-child { border-left: 0; }
        .pg__tab:hover { background: var(--raised-2); color: var(--text); }

        .pg__tab--on {
          color: var(--text);
          background: var(--raised-2);
          box-shadow: inset 0 -2px 0 var(--jade);
        }

        .pg__tabLabel { display: block; font-weight: 550; font-size: .95rem; }
        .pg__tabBlurb {
          display: block; margin-top: 3px;
          font-size: .8rem; color: var(--faint); line-height: 1.4;
        }

        .pg__body { padding: 26px 24px; }

        .pg__controls {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          margin-bottom: 24px;
        }

        .field { display: flex; flex-direction: column; gap: 7px; }

        .field > span {
          font-family: var(--mono);
          font-size: .66rem;
          letter-spacing: .11em;
          text-transform: uppercase;
          color: var(--faint);
        }

        .field select, .field input[type="range"], .field textarea {
          font: inherit;
          font-size: .92rem;
          color: var(--text);
          background: var(--void);
          border: 1px solid var(--seam-strong);
          border-radius: 8px;
          padding: 8px 11px;
          min-width: 150px;
        }

        .field textarea { min-width: 260px; resize: vertical; }

        .seg { display: flex; border: 1px solid var(--seam-strong); border-radius: 8px; overflow: hidden; }

        .seg button {
          font: inherit;
          font-size: .88rem;
          padding: 8px 14px;
          background: transparent;
          border: 0;
          border-left: 1px solid var(--seam-strong);
          color: var(--muted);
          cursor: pointer;
          transition: background-color .18s var(--step), color .18s var(--step);
        }

        .seg button:first-child { border-left: 0; }
        .seg button:hover { color: var(--text); }
        .seg button[aria-pressed="true"] { background: var(--jade); color: #04120f; }

        .out {
          border-top: 1px solid var(--seam);
          padding-top: 22px;
        }

        .out__row {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 12px 18px;
          padding: 13px 0;
          border-bottom: 1px solid var(--seam);
        }

        .out__row:last-child { border-bottom: 0; }

        .out__label {
          flex: none;
          width: 170px;
          font-family: var(--mono);
          font-size: .72rem;
          letter-spacing: .06em;
          color: var(--faint);
        }

        .out__value { font-size: 1.3rem; font-weight: 550; letter-spacing: -.02em; }
        .out__value--sm { font-size: 1.02rem; font-weight: 500; }
        .out__note { color: var(--muted); font-size: .88rem; }
        .out__bad { color: var(--ember); }
        .out__good { color: var(--jade); }

        .callout {
          margin-top: 20px;
          padding: 13px 16px;
          border: 1px solid var(--seam);
          border-left: 2px solid var(--ember);
          border-radius: 0 8px 8px 0;
          background: var(--void);
          color: var(--muted);
          font-size: .88rem;
        }

        @media (max-width: 560px) {
          .pg__body { padding: 20px 16px; }
          .out__label { width: 100%; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ count */

function CountDemo() {
  const [locale, setLocale] = useState("vi");
  const [category, setCategory] = useState<ClassifierCategory>("animal");
  const [count, setCount] = useState(2);

  const noun = NOUNS[locale]?.[category] ?? "";
  const def = resolveLocale(locale);
  const classifier = classifierFor(locale, category);
  const needed = usesClassifiers(locale);

  return (
    <>
      <div className="pg__controls">
        <label className="field">
          <span>Language</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value)}>
            {COUNT_LOCALES.map((l) => (
              <option key={l} value={l}>
                {resolveLocale(l)?.name ?? l}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Noun</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ClassifierCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {NOUNS[locale]?.[c]} · {c}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Count — {count}</span>
          <input
            type="range"
            min={1}
            max={12}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="out">
        <div className="out__row">
          <span className="out__label">Interpolated</span>
          <span className="out__value out__bad" lang={locale}>
            {count} {noun}
          </span>
          <span className="out__note">
            {needed ? "Ungrammatical. This is what `${count} ${noun}` produces." : "Fine here."}
          </span>
        </div>
        <div className="out__row">
          <span className="out__label">formatCount()</span>
          <span className="out__value out__good" lang={locale}>
            {formatCount(count, noun, { locale, category })}
          </span>
        </div>
        <div className="out__row">
          <span className="out__label">Classifier</span>
          <span className="out__value--sm" lang={locale}>
            {classifier ?? "—"}
          </span>
          <span className="out__note">
            {needed
              ? `Word order: ${def?.countOrder}`
              : "This language counts without a classifier."}
          </span>
        </div>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- polite */

function PoliteDemo() {
  const [locale, setLocale] = useState("th");
  const [gender, setGender] = useState<SpeakerGender>("female");
  const [register, setRegister] = useState<Register>("formal");

  const SENTENCE: Record<string, string> = {
    th: "ขอบคุณ",
    km: "អរគុណ",
    my: "ကျေးဇူးတင်ပါတယ်",
    jv: "matur nuwun",
    vi: "cảm ơn",
    id: "terima kasih",
  };

  const sentence = SENTENCE[locale] ?? "thank you";
  const gendered = particleIsGendered(locale);
  const level = hasSpeechLevels(locale) ? speechLevel(locale, register) : undefined;

  return (
    <>
      <div className="pg__controls">
        <label className="field">
          <span>Language</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value)}>
            {POLITE_LOCALES.map((l) => (
              <option key={l} value={l}>
                {resolveLocale(l)?.name ?? l}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Speaker</span>
          <div className="seg">
            {(["female", "male", "neutral"] as SpeakerGender[]).map((g) => (
              <button key={g} type="button" aria-pressed={gender === g} onClick={() => setGender(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Register</span>
          <div className="seg">
            {(["formal", "neutral", "casual"] as Register[]).map((r) => (
              <button key={r} type="button" aria-pressed={register === r} onClick={() => setRegister(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="out">
        <div className="out__row">
          <span className="out__label">withPoliteness()</span>
          <span className="out__value out__good" lang={locale}>
            {withPoliteness(sentence, locale, { speakerGender: gender })}
          </span>
        </div>
        <div className="out__row">
          <span className="out__label">Particle</span>
          <span className="out__value--sm" lang={locale}>
            {politeParticle(locale, { speakerGender: gender }) ?? "—"}
          </span>
          <span className="out__note">
            {gendered
              ? "Changes with the speaker's gender."
              : "Not gendered in this language."}
          </span>
        </div>
        <div className="out__row">
          <span className="out__label">pronoun(“I”)</span>
          <span className="out__value--sm" lang={locale}>
            {pronoun(locale, "i", { register, speakerGender: gender }) ?? "—"}
          </span>
        </div>
        <div className="out__row">
          <span className="out__label">pronoun(“you”)</span>
          <span className="out__value--sm" lang={locale}>
            {pronoun(locale, "you", { register, speakerGender: gender }) ?? "—"}
          </span>
          {level && <span className="out__note">Speech level: {level}</span>}
        </div>
      </div>

      {gendered && (
        <p className="callout">
          Hardcode <code>ครับ</code> and your product speaks as a man to every user
          forever. It is the single most common giveaway that Thai copy was written
          by someone who does not speak Thai.
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ money */

function MoneyDemo() {
  const [locale, setLocale] = useState("vi");
  const [amount, setAmount] = useState(1500000);
  const def = resolveLocale(locale);
  const now = useMemo(() => new Date("2026-08-18T00:00:00Z"), []);

  const naive = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: def?.defaultCurrency ?? "USD",
  }).format(amount);

  return (
    <>
      <div className="pg__controls">
        <label className="field">
          <span>Locale</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value)}>
            {MONEY_LOCALES.map((l) => (
              <option key={l} value={l}>
                {resolveLocale(l)?.name ?? l} · {resolveLocale(l)?.defaultCurrency}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Amount</span>
          <select value={amount} onChange={(e) => setAmount(Number(e.target.value))}>
            {[1500, 25000, 1500000, 99000000].map((v) => (
              <option key={v} value={v}>
                {v.toLocaleString("en-US")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="out">
        <div className="out__row">
          <span className="out__label">en-US formatting</span>
          <span className="out__value out__bad">{naive}</span>
          <span className="out__note">Phantom decimals on a whole-unit currency.</span>
        </div>
        <div className="out__row">
          <span className="out__label">formatCurrency()</span>
          <span className="out__value out__good" lang={locale}>
            {formatCurrency(amount, locale)}
          </span>
        </div>
        <div className="out__row">
          <span className="out__label">formatDate()</span>
          <span className="out__value--sm" lang={locale}>
            {formatDate(now, locale, { dateStyle: "long" })}
          </span>
          <span className="out__note">
            {def?.calendar === "buddhist"
              ? `Buddhist Era — ${toBuddhistYear(2026)}, not 2026`
              : "Gregorian"}
          </span>
        </div>
        <div className="out__row">
          <span className="out__label">Native digits</span>
          <span className="out__value--sm" lang={locale}>
            {formatDate(now, locale, { dateStyle: "long", nativeDigits: true })}
          </span>
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- encoding */

function EncodingDemo() {
  const [text, setText] = useState(ZAWGYI_SAMPLE);

  const detect = useMemo(() => detectMyanmarEncoding(text), [text]);
  const converted = useMemo(() => normalizeMyanmar(text), [text]);

  return (
    <>
      <div className="pg__controls">
        <label className="field">
          <span>Burmese input</span>
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            lang="my"
            style={{ fontFamily: "var(--myanmar)" }}
          />
        </label>
      </div>

      <div className="out">
        <div className="out__row">
          <span className="out__label">Detected</span>
          <span
            className={
              detect.encoding === "zawgyi"
                ? "out__value out__bad"
                : "out__value out__good"
            }
          >
            {detect.encoding}
          </span>
          <span className="out__note">
            confidence {Math.round(detect.confidence * 100)}%
          </span>
        </div>
        <div className="out__row">
          <span className="out__label">Signals</span>
          <span className="out__note">
            {detect.signals.length > 0 ? detect.signals.join(" · ") : "none"}
          </span>
        </div>
        <div className="out__row">
          <span className="out__label">normalizeMyanmar()</span>
          <span className="out__value--sm" lang="my" style={{ fontFamily: "var(--myanmar)" }}>
            {converted}
          </span>
        </div>
      </div>

      <p className="callout">
        Zawgyi and Unicode share the same code block and disagree about what the
        code points mean. In the wrong font they look identical; in the right one
        they are noise. A large share of Burmese text on the open web is still
        Zawgyi, so imports have to be guarded.
      </p>
    </>
  );
}
