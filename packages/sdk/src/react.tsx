import * as React from "react";
import type { Register, SpeakerGender } from "./types.js";
import { createI18n, type Bundle, type I18n, type Params, type TranslateOptions } from "./core.js";
import { LOCALES, resolveLocale } from "./locales/index.js";
import { fontLinkHref } from "./fonts.js";
import { insertLineBreakOpportunities, needsSegmentation } from "./text/segment.js";

const Ctx = React.createContext<I18n | null>(null);

export interface I18nProviderProps {
  locale: string;
  bundles: Record<string, Bundle>;
  register?: Register;
  speakerGender?: SpeakerGender;
  nativeDigits?: boolean;
  /** Inject a Google Fonts link for the active locale's script. Defaults to true. */
  loadFont?: boolean;
  /** Set dir and lang on <html>. Defaults to true. */
  applyDocumentAttributes?: boolean;
  onMissing?: (key: string, locale: string) => void;
  children: React.ReactNode;
}

export function I18nProvider({
  locale,
  bundles,
  register,
  speakerGender,
  nativeDigits,
  loadFont = true,
  applyDocumentAttributes = true,
  onMissing,
  children,
}: I18nProviderProps): React.ReactElement {
  const i18n = React.useMemo(
    () => createI18n({ locale, bundles, register, speakerGender, nativeDigits, onMissing }),
    [locale, bundles, register, speakerGender, nativeDigits, onMissing],
  );

  // Jawi is right-to-left, so the whole layout has to flip.
  React.useEffect(() => {
    if (!applyDocumentAttributes || typeof document === "undefined") return;
    const root = document.documentElement;
    const prevLang = root.lang;
    const prevDir = root.dir;
    root.lang = i18n.def.code;
    root.dir = i18n.dir;
    return () => {
      root.lang = prevLang;
      root.dir = prevDir;
    };
  }, [i18n, applyDocumentAttributes]);

  React.useEffect(() => {
    if (!loadFont || typeof document === "undefined") return;
    if (!i18n.def.font.googleFont) return;
    const id = `selakata-font-${i18n.def.code}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = fontLinkHref([i18n.def.code]);
    document.head.appendChild(link);
  }, [i18n, loadFont]);

  return <Ctx.Provider value={i18n}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("selakata: useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** The main hook. Returns t plus every formatter bound to the active locale. */
export function useTranslation(): I18n & {
  t: (key: string, params?: Params, opts?: TranslateOptions) => string;
} {
  return useI18n();
}

/** Direction and font details, for components that need to lay out manually. */
export function useDirection(): { dir: "ltr" | "rtl"; isRtl: boolean; lineHeight: number } {
  const i18n = useI18n();
  return {
    dir: i18n.dir,
    isRtl: i18n.dir === "rtl",
    lineHeight: i18n.def.font.lineHeight,
  };
}

export interface TransProps {
  id: string;
  params?: Params;
  register?: Register;
  count?: number;
  polite?: boolean;
  /** Wrap in an element and add break opportunities for unspaced scripts. */
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
}

/**
 * Render a translated string. For Thai, Lao, Khmer, and Burmese it inserts
 * zero-width spaces so the browser can wrap the text instead of overflowing.
 */
export function Trans({
  id,
  params,
  register,
  count,
  polite,
  as: Tag = "span",
  className,
}: TransProps): React.ReactElement {
  const i18n = useI18n();
  const raw = i18n.t(id, params, { register, count, polite });
  const text = needsSegmentation(i18n.locale)
    ? insertLineBreakOpportunities(raw, i18n.locale)
    : raw;
  return (
    <Tag className={className} lang={i18n.locale} dir={i18n.dir}>
      {text}
    </Tag>
  );
}

export interface LanguageSwitcherProps {
  /** Locale codes to offer. Defaults to every locale in the bundle set. */
  locales?: string[];
  value?: string;
  onChange: (locale: string) => void;
  /** Show the language's own name rather than the English one. Defaults to true. */
  native?: boolean;
  className?: string;
}

/** A plain select. Every option is labelled in its own script. */
export function LanguageSwitcher({
  locales,
  value,
  onChange,
  native = true,
  className,
}: LanguageSwitcherProps): React.ReactElement {
  const i18n = React.useContext(Ctx);
  const list = locales ?? Object.keys(LOCALES);
  const current = value ?? i18n?.locale ?? list[0];

  return (
    <select
      className={className}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Language"
    >
      {list.map((code) => {
        const def = resolveLocale(code);
        if (!def) return null;
        return (
          <option key={code} value={code} lang={def.code}>
            {native ? def.nativeName : def.name}
          </option>
        );
      })}
    </select>
  );
}
