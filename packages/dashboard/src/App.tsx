import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  getToken,
  setToken,
  type ProjectReadiness,
  type Key,
  type LintIssue,
  type LocaleMeta,
  type Project,
} from "./api";
import { KeyEditor } from "./KeyEditor";

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  return authed ? <Workspace onSignOut={() => setAuthed(false)} /> : <SignIn onDone={() => setAuthed(true)} />;
}

/* -------------------------------------------------------------------- auth */

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "login"
          ? await api.login(email, password)
          : await api.register(email, password);
      setToken(result.token);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <h1 className="wordmark">
          sela<span>kata</span>
        </h1>
        <p className="tagline">Translation management for Southeast Asia</p>

        {error && <div className="banner">{error}</div>}

        <input
          className="field"
          type="email"
          placeholder="Email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="field"
          type="password"
          placeholder="Password"
          value={password}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <div className="btn-row">
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
          <button
            className="btn"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "Create an account" : "I have an account"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- workspace */

function Workspace({ onSignOut }: { onSignOut: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [locales, setLocales] = useState<Record<string, LocaleMeta>>({});
  const [keys, setKeys] = useState<Key[]>([]);
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);
  const [issues, setIssues] = useState<LintIssue[]>([]);
  const [register, setRegister] = useState("neutral");
  const [selected, setSelected] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Locale metadata is static for the life of the session.
  useEffect(() => {
    api
      .locales()
      .then((list) => setLocales(Object.fromEntries(list.map((l) => [l.code, l]))))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    api
      .projects()
      .then((list) => {
        setProjects(list);
        setProject((current) => current ?? list[0] ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  const refresh = useCallback(async (id: string) => {
    try {
      const [k, c, l] = await Promise.all([
        api.keys(id),
        api.readiness(id),
        api.lint(id, register),
      ]);
      setKeys(k);
      setReadiness(c);
      setIssues(l);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [register]);

  useEffect(() => {
    if (project) refresh(project.id);
  }, [project, refresh]);

  // Load only the fonts for scripts actually on screen.
  useEffect(() => {
    if (!project) return;
    const families = project.locales
      .map((code) => locales[code]?.script)
      .filter(Boolean);
    if (!families.length) return;

    const id = "selakata-fonts";
    document.getElementById(id)?.remove();
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?" +
      [...new Set(project.locales)]
        .map((c) => scriptFont(locales[c]?.script))
        .filter(Boolean)
        .map((f) => `family=${encodeURIComponent(f!)}:wght@400;600`)
        .join("&") +
      "&display=swap";
    document.head.appendChild(link);
  }, [project, locales]);

  const issuesByKey = useMemo(() => {
    const map = new Map<string, LintIssue[]>();
    for (const issue of issues) {
      const list = map.get(issue.key) ?? [];
      list.push(issue);
      map.set(issue.key, list);
    }
    return map;
  }, [issues]);

  async function addKey() {
    const name = prompt("Key name, for example cart.title");
    if (!name || !project) return;
    try {
      await api.createKey(project.id, name);
      refresh(project.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function newProject() {
    const name = prompt("Project name");
    if (!name) return;
    try {
      const created = await api.createProject(name, "en", ["vi", "th", "id", "ms"]);
      setProjects((p) => [...p, created]);
      setProject(created);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const registers = project ? locales[project.locales[1]]?.registers ?? ["formal", "neutral", "casual"] : [];

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1 className="wordmark">
          sela<span>kata</span>
        </h1>
        <p className="tagline">Translation management for Southeast Asia</p>

        <div className="eyebrow">Projects</div>
        <ul className="locale-list">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                className="locale-row"
                aria-current={project?.id === p.id}
                onClick={() => setProject(p)}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        <button className="btn" style={{ marginTop: 8, width: "100%" }} onClick={newProject}>
          New project
        </button>

        {project && (
          <>
            <div className="eyebrow">
              Readiness
              {readiness && (
                <span className={`grade grade-${readiness.grade}`}>
                  {readiness.score} {readiness.grade}
                </span>
              )}
            </div>
            <ul className="locale-list">
              {readiness?.locales.map((l) => {
                const meta = locales[l.locale];
                const blocking = readiness.blocking.includes(l.locale);
                return (
                  <li key={l.locale} style={{ padding: "6px 8px" }}>
                    <div className="locale-top">
                      <span className="locale-code">{l.locale}</span>
                      <span className="locale-pct">
                        {l.score}
                        <span className={`grade grade-${l.grade}`}>{l.grade}</span>
                      </span>
                    </div>

                    {/* One stacked bar, segmented by facet. Each segment is as
                        wide as the points that facet actually earned, so the
                        empty tail is exactly what the locale is missing. */}
                    <div className="meter meter-facets" title={`${l.score} / 100`}>
                      {l.facets.map((f) => (
                        <i
                          key={f.id}
                          className={`facet facet-${f.id}`}
                          style={{ width: `${f.contribution}%` }}
                          title={`${f.label}: ${Math.round(f.score * 100)}% × ${f.weight} = ${f.contribution.toFixed(1)} pts — ${f.detail}`}
                        />
                      ))}
                    </div>

                    {meta && <div className="hint">{meta.nativeName}</div>}
                    {l.topDrag && (
                      <div className={blocking ? "hint hint-blocking" : "hint"}>
                        {l.topDrag.label}: {l.topDrag.detail}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {readiness && readiness.blocking.length > 0 && (
              <div className="hint hint-blocking" style={{ padding: "0 8px" }}>
                {readiness.blocking.length} locale(s) below the{" "}
                {readiness.releaseThreshold} threshold.
              </div>
            )}
          </>
        )}

        <div className="eyebrow">Session</div>
        <button
          className="btn"
          style={{ width: "100%" }}
          onClick={() => {
            setToken(null);
            onSignOut();
          }}
        >
          Sign out
        </button>
      </aside>

      <main className="main">
        {error && <div className="banner">{error}</div>}

        {!project ? (
          <div className="empty-state">
            <p>No projects yet. Create one to start adding keys.</p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: 16,
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2>{project.name}</h2>
                <p className="hint">
                  Source {project.sourceLocale} · {project.locales.length} locales ·{" "}
                  {keys.length} keys
                </p>
              </div>

              <div className="btn-row">
                <div className="register-tabs" role="tablist" aria-label="Register">
                  {registers.map((r) => (
                    <button
                      key={r}
                      role="tab"
                      className="register-tab"
                      aria-selected={register === r}
                      onClick={() => setRegister(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <button className="btn" onClick={addKey}>
                  Add key
                </button>
                <a
                  className="btn"
                  href={api.exportUrl(project.id, "csv", project.sourceLocale, register)}
                >
                  Export CSV
                </a>
              </div>
            </div>

            {selected && (
              <KeyEditor
                projectKey={selected}
                project={project}
                locales={locales}
                register={register}
                issues={issuesByKey.get(selected.name) ?? []}
                onClose={() => setSelected(null)}
                onSaved={() => refresh(project.id)}
              />
            )}

            {keys.length === 0 ? (
              <div className="empty-state">
                <p>No keys yet. Add one, or import a locale file with the CLI.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Key</th>
                      {project.locales.map((code) => (
                        <th key={code}>
                          {code} <span style={{ fontWeight: 400 }}>{locales[code]?.nativeName}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.id} onClick={() => setSelected(k)} style={{ cursor: "pointer" }}>
                        <td>
                          <div className="key-name">{k.name}</div>
                          <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
                            {k.regulated && <span className="tag tag-regulated">regulated</span>}
                            {issuesByKey.has(k.name) && (
                              <span className="tag tag-draft">
                                {issuesByKey.get(k.name)!.length} issue
                              </span>
                            )}
                          </div>
                        </td>
                        {project.locales.map((code) => {
                          const meta = locales[code];
                          const value = k.values[code]?.[register];
                          return (
                            <td
                              key={code}
                              className={`script-cell${value ? "" : " empty"}`}
                              style={
                                {
                                  "--cell-font": cellFont(meta?.script),
                                  "--cell-dir": meta?.dir ?? "ltr",
                                  "--cell-leading": leadingFor(meta?.script),
                                } as React.CSSProperties
                              }
                            >
                              {value ?? "Not translated"}
                              {k.draft.includes(code) && (
                                <>
                                  {" "}
                                  <span className="tag tag-draft">draft</span>
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------ script fonts */

/**
 * The default system font has no glyphs at all for Khmer, Burmese, Lao, or
 * Javanese, and clips Thai and Vietnamese diacritics. Each script gets a face
 * that actually covers it.
 */
export function scriptFont(script?: string): string | null {
  switch (script) {
    case "Thai":
      return "Noto Sans Thai";
    case "Khmr":
      return "Noto Sans Khmer";
    case "Mymr":
      return "Noto Sans Myanmar";
    case "Laoo":
      return "Noto Sans Lao";
    case "Java":
      return "Noto Sans Javanese";
    case "Arab":
      return "Noto Naskh Arabic";
    case "Taml":
      return "Noto Sans Tamil";
    case "Hans":
      return "Noto Sans SC";
    default:
      return null;
  }
}

export function cellFont(script?: string): string {
  const family = scriptFont(script);
  return family ? `"${family}", var(--sans)` : "var(--sans)";
}

/**
 * Scripts that stack marks above and below the baseline need more leading or
 * the marks collide with the line above.
 */
export function leadingFor(script?: string): string {
  switch (script) {
    case "Thai":
    case "Laoo":
      return "1.75";
    case "Khmr":
    case "Mymr":
      return "1.9";
    case "Java":
      return "1.85";
    case "Arab":
      return "1.8";
    default:
      return "1.5";
  }
}
