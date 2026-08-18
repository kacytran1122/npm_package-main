import { useEffect, useMemo, useState } from "react";
import { words, graphemeLength, resolveLocale } from "selakata";

/**
 * The hero.
 *
 * Thai, Khmer, Burmese, Lao, and Chinese put no space between words, so the
 * boundary the whole library turns on is one you cannot see. This draws it:
 * the sentence renders in its own script at display size, and the seams the
 * segmenter found light up between the words, left to right.
 *
 * It runs the real package. The words below are `words()` from the built SDK,
 * not a fixture, so the hero is wrong the moment the segmenter is.
 */

interface Sample {
  locale: string;
  chip: string;
  label: string;
  text: string;
  gloss: string;
  font: string;
}

const SAMPLES: Sample[] = [
  {
    locale: "th",
    chip: "ไทย",
    label: "Thai",
    text: "ระบบนี้รองรับการแปลภาษาอัตโนมัติ",
    gloss: "This system supports automatic translation.",
    font: "var(--thai)",
  },
  {
    locale: "km",
    chip: "ខ្មែរ",
    label: "Khmer",
    text: "សូមបញ្ចូលពាក្យសម្ងាត់របស់អ្នក",
    gloss: "Please enter your password.",
    font: "var(--khmer)",
  },
  {
    locale: "my",
    chip: "မြန်မာ",
    label: "Burmese",
    text: "သင်၏အကောင့်ကိုယာယီပိတ်ထားသည်",
    gloss: "Your account is temporarily suspended.",
    font: "var(--myanmar)",
  },
  {
    locale: "lo",
    chip: "ລາວ",
    label: "Lao",
    text: "ກະລຸນາໃສ່ລະຫັດຜ່ານຂອງທ່ານ",
    gloss: "Please enter your password.",
    font: "var(--lao)",
  },
  {
    locale: "zh-Hans-SG",
    chip: "中文",
    label: "Chinese (SG)",
    text: "请输入您的密码",
    gloss: "Please enter your password.",
    font: "var(--sans)",
  },
];

export default function SeamInspector() {
  const [index, setIndex] = useState(0);
  const [armed, setArmed] = useState(false);
  const sample = SAMPLES[index];

  const parts = useMemo(() => words(sample.text, sample.locale), [sample]);

  // Re-run the seam reveal whenever the language changes.
  useEffect(() => {
    setArmed(false);
    const id = window.setTimeout(() => setArmed(true), 90);
    return () => window.clearTimeout(id);
  }, [index]);

  const dir = resolveLocale(sample.locale)?.dir ?? "ltr";
  const chars = graphemeLength(sample.text, sample.locale);

  return (
    <div className="inspector">
      <div className="inspector__chips" role="group" aria-label="Sample language">
        {SAMPLES.map((s, i) => (
          <button
            key={s.locale}
            type="button"
            aria-pressed={i === index}
            className={i === index ? "chip chip--on" : "chip"}
            onClick={() => setIndex(i)}
          >
            <span lang={s.locale}>{s.chip}</span>
            <span className="sr-only"> — {s.label}</span>
          </button>
        ))}
      </div>

      <div
        className={armed ? "inspector__line is-armed" : "inspector__line"}
        style={{ fontFamily: sample.font }}
        lang={sample.locale}
        dir={dir}
        aria-live="polite"
      >
        {parts.map((word, i) => (
          <span className="word" key={`${index}-${i}`}>
            {i > 0 && (
              <i
                className="seam"
                aria-hidden="true"
                style={{ ["--i" as string]: String(i) }}
              />
            )}
            <span className="word__text">{word}</span>
          </span>
        ))}
      </div>

      <p className="inspector__gloss">{sample.gloss}</p>

      <dl className="readout">
        <div>
          <dt>Words</dt>
          <dd>{parts.length}</dd>
        </div>
        <div>
          <dt>Characters</dt>
          <dd>{chars}</dd>
        </div>
        <div>
          <dt>Spaces in the source</dt>
          <dd className="readout__zero">0</dd>
        </div>
      </dl>

      <style>{`
        .inspector {
          border: 1px solid var(--seam);
          border-radius: 14px;
          background:
            radial-gradient(120% 100% at 0% 0%, rgb(47 211 180 / 7%), transparent 62%),
            var(--raised);
          padding: 22px 24px 20px;
        }

        .sr-only {
          position: absolute;
          width: 1px; height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }

        .inspector__chips {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-bottom: 26px;
        }

        .chip {
          padding: 6px 13px;
          border-radius: 999px;
          border: 1px solid var(--seam-strong);
          background: transparent;
          color: var(--muted);
          font: inherit;
          font-size: 0.86rem;
          line-height: 1.4;
          cursor: pointer;
          transition: color .18s var(--step), border-color .18s var(--step),
                      background-color .18s var(--step);
        }

        .chip:hover { color: var(--text); border-color: var(--jade-dim); }

        .chip--on {
          color: #04120f;
          background: var(--jade);
          border-color: var(--jade);
        }

        /*
         * The line is display type. Line height comes from the script, not from
         * the Latin default, because Khmer and Burmese clip at 1.2.
         */
        .inspector__line {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          font-size: clamp(1.6rem, 1rem + 2.6vw, 2.9rem);
          line-height: 1.85;
          letter-spacing: -0.01em;
          min-height: 2.2em;
        }

        .word { display: inline-flex; align-items: stretch; }

        /* The seam. One pixel, the width of nothing, drawn where the language
           writes nothing. */
        .seam {
          width: 1px;
          margin-inline: 0.34em;
          align-self: stretch;
          background: linear-gradient(
            to bottom, transparent, var(--jade) 18%, var(--jade) 82%, transparent
          );
          box-shadow: 0 0 10px var(--jade-glow);
          transform: scaleY(0);
          transform-origin: 50% 50%;
          opacity: 0;
        }

        .is-armed .seam {
          animation: seam-in .5s var(--step) forwards;
          animation-delay: calc(var(--i) * 90ms);
        }

        @keyframes seam-in {
          from { transform: scaleY(0); opacity: 0; }
          to   { transform: scaleY(1); opacity: 1; }
        }

        .word__text {
          transition: color .5s var(--step);
        }

        .inspector__gloss {
          margin-top: 14px;
          color: var(--faint);
          font-size: 0.92rem;
        }

        .readout {
          display: flex;
          flex-wrap: wrap;
          gap: 0;
          margin: 24px 0 0;
          border-top: 1px solid var(--seam);
          padding-top: 16px;
        }

        .readout > div {
          padding-inline: 20px;
          border-left: 1px solid var(--seam);
        }

        .readout > div:first-child { padding-inline-start: 0; border-left: 0; }

        .readout dt {
          font-family: var(--mono);
          font-size: 0.66rem;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: var(--faint);
        }

        .readout dd {
          margin: 5px 0 0;
          font-size: 1.32rem;
          font-weight: 600;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }

        .readout__zero { color: var(--ember); }

        @media (prefers-reduced-motion: reduce) {
          .seam { transform: scaleY(1); opacity: 1; }
          .is-armed .seam { animation: none; }
        }

        @media (max-width: 560px) {
          .readout > div { padding-inline: 14px; }
          .inspector { padding: 18px 16px 16px; }
        }
      `}</style>
    </div>
  );
}
