import { useEffect, useState } from "react";
import { api, type Key, type LintIssue, type LocaleMeta, type Project } from "./api";
import { cellFont, leadingFor } from "./App";

interface Props {
  projectKey: Key;
  project: Project;
  locales: Record<string, LocaleMeta>;
  register: string;
  issues: LintIssue[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Edit every locale for one key side by side.
 *
 * Each field renders in its own script's font, direction, and line height, so
 * a reviewer sees the text as a user will see it rather than as mono-spaced
 * boxes of unfamiliar glyphs.
 */
export function KeyEditor({
  projectKey,
  project,
  locales,
  register,
  issues,
  onClose,
  onSaved,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset local edits whenever a different key or register is opened.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const code of project.locales) {
      next[code] = projectKey.values[code]?.[register] ?? "";
    }
    setValues(next);
    setError(null);
  }, [projectKey, register, project.locales]);

  async function save(locale: string) {
    setBusy(locale);
    setError(null);
    try {
      await api.setValue(project.id, projectKey.id, locale, register, values[locale] ?? "");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function draft(locale: string) {
    setBusy(locale);
    setError(null);
    try {
      const result = await api.draft(project.id, projectKey.id, locale, register);
      setValues((v) => ({ ...v, [locale]: result.text }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="editor">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <h2 className="key-name" style={{ fontSize: 14 }}>
          {projectKey.name}
        </h2>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="hint" style={{ marginTop: 0 }}>
        Editing the <strong>{register}</strong> register.
        {projectKey.regulated &&
          " This key is regulated, so AI drafts are held until a human approves them."}
      </p>

      {error && <div className="banner">{error}</div>}

      {issues.length > 0 && (
        <div style={{ margin: "12px 0" }}>
          {issues.map((issue, i) => (
            <div key={i} className={`issue ${issue.severity === "error" ? "error" : ""}`}>
              <div className="issue-head">
                {issue.locale} · {issue.rule}
              </div>
              <div>{issue.message}</div>
            </div>
          ))}
        </div>
      )}

      <div className="editor-grid">
        {project.locales.map((code) => {
          const meta = locales[code];
          const isSource = code === project.sourceLocale;

          return (
            <div
              key={code}
              className="editor-row"
              style={
                {
                  "--cell-font": cellFont(meta?.script),
                  "--cell-dir": meta?.dir ?? "ltr",
                  "--cell-leading": leadingFor(meta?.script),
                } as React.CSSProperties
              }
            >
              <label htmlFor={`f-${code}`}>
                <span>
                  {meta?.name ?? code}{" "}
                  <span className="locale-code">
                    {code}
                    {meta?.dir === "rtl" && " · rtl"}
                    {meta?.wordSpaced === false && " · unspaced"}
                  </span>
                </span>
                <span>
                  {isSource && <span className="tag tag-regulated">source</span>}
                  {projectKey.draft.includes(code) && (
                    <span className="tag tag-draft">draft</span>
                  )}
                </span>
              </label>

              <textarea
                id={`f-${code}`}
                className="field"
                value={values[code] ?? ""}
                dir={meta?.dir ?? "ltr"}
                onChange={(e) => setValues((v) => ({ ...v, [code]: e.target.value }))}
              />

              <div className="btn-row" style={{ marginTop: 6 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => save(code)}
                  disabled={busy === code}
                >
                  {busy === code ? "Saving" : "Save"}
                </button>
                {!isSource && (
                  <button
                    className="btn"
                    onClick={() => draft(code)}
                    disabled={busy === code}
                  >
                    Draft with AI
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
