/**
 * HTTP routes.
 *
 * Two audiences. `/api/v1/*` is the dashboard, authenticated with a JWT.
 * `/api/v1/bundle` is the SDK, authenticated with a project API key and
 * readable by anyone holding it, so it never exposes drafts or member data.
 */

import { Router, type Response } from "express";
import {
  fallbackChain,
  getLocale,
  lintBundle,
  lintBundles,
  projectReadiness,
  resolveLocale,
  scoreReadiness,
  supportedLocales,
} from "selakata";
import { config, aiConfigured } from "./config.js";
import {
  canEditLocale,
  requireApiKey,
  requireMember,
  requireUser,
  signToken,
  type AuthedRequest,
} from "./auth.js";
import { hashPassword, newApiKey, verifyPassword, type Key } from "./store.js";
import { AiNotConfiguredError, draftTranslation } from "./ai.js";
import { exportKeys, type ExportFormat } from "./export.js";

export function createRouter(): Router {
  const r = Router();

  const fail = (res: Response, status: number, error: string) =>
    res.status(status).json({ error });

  // ------------------------------------------------------------------ health

  r.get("/health", (_req, res) => {
    res.json({
      ok: true,
      store: config.mongoUrl ? "mongodb" : "memory",
      ai: aiConfigured() ? config.ai.provider : "not configured",
      locales: supportedLocales().length,
    });
  });

  /** Locale metadata, so the dashboard never hardcodes the language list. */
  r.get("/locales", (_req, res) => {
    res.json(
      supportedLocales().map((def) => ({
        code: def.code,
        name: def.name,
        nativeName: def.nativeName,
        script: def.script,
        dir: def.dir,
        registers: def.registers,
        wordSpaced: def.wordSpaced,
        countries: def.countries,
        fallback: fallbackChain(def.code),
      })),
    );
  });

  // -------------------------------------------------------------------- auth

  r.post("/auth/register", async (req: AuthedRequest, res) => {
    const { email, password, name } = req.body ?? {};
    if (!email || !password) return fail(res, 400, "email and password are required");
    if (String(password).length < 8)
      return fail(res, 400, "Password must be at least 8 characters");

    if (await req.store.findUserByEmail(email))
      return fail(res, 409, "An account with that email already exists");

    const user = await req.store.createUser({
      email,
      name: name ?? email.split("@")[0],
      passwordHash: hashPassword(password),
    });

    res.status(201).json({ token: signToken(user.id), user: safeUser(user) });
  });

  r.post("/auth/login", async (req: AuthedRequest, res) => {
    const { email, password } = req.body ?? {};
    const user = email ? await req.store.findUserByEmail(email) : null;
    // Same message either way, so the endpoint does not confirm which emails exist.
    if (!user || !verifyPassword(String(password ?? ""), user.passwordHash))
      return fail(res, 401, "Invalid email or password");

    res.json({ token: signToken(user.id), user: safeUser(user) });
  });

  r.get("/auth/me", requireUser, (req: AuthedRequest, res) => {
    res.json({ user: safeUser(req.user!) });
  });

  // ---------------------------------------------------------------- projects

  r.get("/projects", requireUser, async (req: AuthedRequest, res) => {
    res.json(await req.store.listProjectsForUser(req.user!.id));
  });

  r.post("/projects", requireUser, async (req: AuthedRequest, res) => {
    const { name, sourceLocale = "en", locales = [] } = req.body ?? {};
    if (!name) return fail(res, 400, "name is required");

    const requested = [sourceLocale, ...locales];
    const unknown = requested.filter((l: string) => !resolveLocale(l));
    if (unknown.length) return fail(res, 400, `Unknown locales: ${unknown.join(", ")}`);

    const project = await req.store.createProject({
      name,
      sourceLocale,
      locales: [...new Set(requested)],
      apiKey: newApiKey(),
      members: [{ userId: req.user!.id, role: "owner", locales: [] }],
    });

    res.status(201).json(project);
  });

  r.get(
    "/projects/:projectId",
    requireUser,
    requireMember("viewer"),
    async (req: AuthedRequest, res) => {
      res.json(req.project);
    },
  );

  /** Rotate the API key. Owner only, and the old key stops working at once. */
  r.post(
    "/projects/:projectId/rotate-key",
    requireUser,
    requireMember("owner"),
    async (req: AuthedRequest, res) => {
      const updated = await req.store.updateProject(req.project!.id, {
        apiKey: newApiKey(),
      });
      res.json({ apiKey: updated!.apiKey });
    },
  );

  r.post(
    "/projects/:projectId/members",
    requireUser,
    requireMember("owner"),
    async (req: AuthedRequest, res) => {
      const { email, role = "translator", locales = [] } = req.body ?? {};
      const invitee = await req.store.findUserByEmail(email);
      if (!invitee) return fail(res, 404, "No user with that email");

      const members = req.project!.members.filter((m) => m.userId !== invitee.id);
      members.push({ userId: invitee.id, role, locales });

      const updated = await req.store.updateProject(req.project!.id, { members });
      res.json(updated);
    },
  );

  // -------------------------------------------------------------------- keys

  r.get(
    "/projects/:projectId/keys",
    requireUser,
    requireMember("viewer"),
    async (req: AuthedRequest, res) => {
      res.json(await req.store.listKeys(req.project!.id));
    },
  );

  r.post(
    "/projects/:projectId/keys",
    requireUser,
    requireMember("translator"),
    async (req: AuthedRequest, res) => {
      const { name, description, regulated = false } = req.body ?? {};
      if (!name) return fail(res, 400, "name is required");

      if (await req.store.findKey(req.project!.id, name))
        return fail(res, 409, "A key with that name already exists");

      const limit = config.maxKeysPerProject;
      if (limit > 0 && (await req.store.countKeys(req.project!.id)) >= limit)
        return fail(res, 422, `Project key limit reached (${limit})`);

      const key = await req.store.upsertKey({
        projectId: req.project!.id,
        name,
        description,
        values: {},
        draft: [],
        regulated,
      });

      res.status(201).json(key);
    },
  );

  /**
   * Set one translation.
   *
   * Every write is recorded as a revision, and a regulated key refuses AI
   * values outright so unreviewed machine output can never reach production
   * for legal or financial copy.
   */
  r.put(
    "/projects/:projectId/keys/:keyId",
    requireUser,
    requireMember("translator"),
    async (req: AuthedRequest, res) => {
      const { locale, register = "neutral", value, source = "human" } = req.body ?? {};
      if (!locale || typeof value !== "string")
        return fail(res, 400, "locale and value are required");

      if (!canEditLocale(req.project!, req.user!.id, locale))
        return fail(res, 403, `You are not assigned to ${locale}`);

      const key = await req.store.findKeyById(req.params.keyId);
      if (!key || key.projectId !== req.project!.id) return fail(res, 404, "Key not found");

      if (key.regulated && source === "ai")
        return fail(
          res,
          422,
          "This key is marked regulated. AI values must be reviewed by a human before they are stored.",
        );

      const before = key.values[locale]?.[register] ?? null;
      const values = {
        ...key.values,
        [locale]: { ...(key.values[locale] ?? {}), [register]: value },
      };

      // A human edit clears the draft flag; an AI write sets it.
      const draft = new Set(key.draft);
      if (source === "ai") draft.add(locale);
      else draft.delete(locale);

      const updated = await req.store.upsertKey({ ...key, values, draft: [...draft] });

      await req.store.addRevision({
        projectId: req.project!.id,
        keyId: key.id,
        keyName: key.name,
        locale,
        register,
        before,
        after: value,
        userId: req.user!.id,
        source,
      });

      res.json(updated);
    },
  );

  r.delete(
    "/projects/:projectId/keys/:keyId",
    requireUser,
    requireMember("owner"),
    async (req: AuthedRequest, res) => {
      await req.store.deleteKey(req.params.keyId);
      res.status(204).end();
    },
  );

  /** Bulk import, used by `sela push` and by the dashboard importer. */
  r.post(
    "/projects/:projectId/import",
    requireUser,
    requireMember("translator"),
    async (req: AuthedRequest, res) => {
      const { locale, register = "neutral", entries, source = "human" } = req.body ?? {};
      if (!locale || typeof entries !== "object" || entries === null)
        return fail(res, 400, "locale and entries are required");
      if (!["human", "ai", "import"].includes(source))
        return fail(res, 400, `Unknown source "${source}"`);

      if (!canEditLocale(req.project!, req.user!.id, locale))
        return fail(res, 403, `You are not assigned to ${locale}`);

      const flat = flatten(entries);
      const limit = config.maxKeysPerProject;
      const existing = await req.store.countKeys(req.project!.id);
      const incoming = Object.keys(flat);

      if (limit > 0 && existing + incoming.length > limit)
        return fail(res, 422, `Import would exceed the key limit (${limit})`);

      let created = 0;
      let updated = 0;

      for (const [name, value] of Object.entries(flat)) {
        const found = await req.store.findKey(req.project!.id, name);
        if (found?.regulated) continue; // never bulk-overwrite regulated copy

        const base: Omit<Key, "id" | "updatedAt"> & { id?: string } = found
          ? { ...found }
          : {
              projectId: req.project!.id,
              name,
              values: {},
              draft: [],
              regulated: false,
            };

        base.values = {
          ...base.values,
          [locale]: { ...(base.values[locale] ?? {}), [register]: value },
        };

        // Machine-translated imports land as drafts awaiting sign-off, so the
        // readiness score does not read a bulk-imported MT file as reviewed
        // work. A human-sourced import is approved on arrival.
        const drafts = new Set(base.draft);
        if (source === "ai") drafts.add(locale);
        else drafts.delete(locale);
        base.draft = [...drafts];

        await req.store.upsertKey(base);
        found ? updated++ : created++;
      }

      res.json({ created, updated, skipped: incoming.length - created - updated });
    },
  );

  // ------------------------------------------------------------------ review

  r.get(
    "/projects/:projectId/revisions",
    requireUser,
    requireMember("viewer"),
    async (req: AuthedRequest, res) => {
      const keyId = typeof req.query.keyId === "string" ? req.query.keyId : undefined;
      res.json(await req.store.listRevisions(req.project!.id, keyId));
    },
  );

  /** Run the regional linter across every locale in the project. */
  r.get(
    "/projects/:projectId/lint",
    requireUser,
    requireMember("viewer"),
    async (req: AuthedRequest, res) => {
      const keys = await req.store.listKeys(req.project!.id);
      const register = String(req.query.register ?? "neutral");
      const bundles: Record<string, Record<string, string>> = {};

      for (const locale of req.project!.locales) {
        bundles[locale] = {};
        for (const key of keys) {
          const value = key.values[locale]?.[register];
          if (value) bundles[locale][key.name] = value;
        }
      }

      res.json(lintBundles(bundles, req.project!.sourceLocale));
    },
  );

  /**
   * Release readiness per locale.
   *
   * Replaces the old percent-translated report. Coverage alone said a locale
   * was done while every string in it was an unreviewed machine draft sitting
   * in the wrong register, so the number is now one facet of four. The
   * weighting and the arithmetic live in the SDK, which keeps this endpoint,
   * the CLI, and anyone scoring bundles in CI on the same scale.
   */
  r.get(
    "/projects/:projectId/readiness",
    requireUser,
    requireMember("viewer"),
    async (req: AuthedRequest, res) => {
      const keys = await req.store.listKeys(req.project!.id);
      const project = req.project!;
      const sourceLocale = project.sourceLocale;

      const threshold = Number(req.query.threshold);
      const releaseThreshold =
        Number.isFinite(threshold) && threshold >= 0 && threshold <= 100 ? threshold : 75;

      const scored = project.locales
        .filter((locale) => locale !== sourceLocale)
        .map((locale) => {
          const registers = resolveLocale(locale)?.registers ?? ["neutral"];

          let translatedKeys = 0;
          let filledRegisterSlots = 0;
          let draftKeys = 0;

          // Lint this locale against the source, one bundle per register, so
          // a defect in the formal variant is not hidden by a clean neutral.
          const bundles: Record<string, Record<string, string>> = {};
          const sourceBundles: Record<string, Record<string, string>> = {};

          for (const key of keys) {
            const values = key.values[locale] ?? {};
            const filled = registers.filter((r) => (values[r] ?? "").trim() !== "").length;

            if (Object.keys(values).length > 0) translatedKeys++;
            filledRegisterSlots += filled;
            if (key.draft.includes(locale)) draftKeys++;

            for (const register of registers) {
              const value = values[register];
              if (value) (bundles[register] ??= {})[key.name] = value;

              const source = key.values[sourceLocale]?.[register];
              if (source) (sourceBundles[register] ??= {})[key.name] = source;
            }
          }

          const issues = Object.keys(bundles).flatMap((register) =>
            lintBundle(locale, bundles[register], sourceBundles[register]),
          );

          return scoreReadiness({
            locale,
            totalKeys: keys.length,
            translatedKeys,
            filledRegisterSlots,
            expectedRegisters: registers,
            issues,
            draftKeys,
          });
        });

      res.json(projectReadiness(scored, releaseThreshold));
    },
  );

  // ---------------------------------------------------------------------- ai

  r.post(
    "/projects/:projectId/keys/:keyId/draft",
    requireUser,
    requireMember("translator"),
    async (req: AuthedRequest, res) => {
      const { locale, register = "neutral", speakerGender } = req.body ?? {};
      const key = await req.store.findKeyById(req.params.keyId);
      if (!key || key.projectId !== req.project!.id) return fail(res, 404, "Key not found");

      const sourceLocale = req.project!.sourceLocale;
      const text = key.values[sourceLocale]?.[register] ?? key.values[sourceLocale]?.neutral;
      if (!text) return fail(res, 422, `Key has no ${sourceLocale} source text`);

      // Build translation memory from this project's approved pairs.
      const all = await req.store.listKeys(req.project!.id);
      const memory = all
        .filter((k) => k.id !== key.id && !k.draft.includes(locale))
        .map((k) => ({
          source: k.values[sourceLocale]?.[register] ?? "",
          target: k.values[locale]?.[register] ?? "",
        }))
        .filter((m) => m.source && m.target)
        .slice(0, 20);

      try {
        const draft = await draftTranslation({
          text,
          sourceLocale,
          targetLocale: locale,
          register,
          speakerGender,
          memory,
          keyName: key.name,
        });
        res.json(draft);
      } catch (error) {
        if (error instanceof AiNotConfiguredError) return fail(res, 503, error.message);
        return fail(res, 502, (error as Error).message);
      }
    },
  );

  // ------------------------------------------------------------------ export

  r.get(
    "/projects/:projectId/export",
    requireUser,
    requireMember("viewer"),
    async (req: AuthedRequest, res) => {
      const format = String(req.query.format ?? "json") as ExportFormat;
      const register = String(req.query.register ?? "neutral");
      const locales = req.query.locale
        ? [String(req.query.locale)]
        : req.project!.locales;

      const keys = await req.store.listKeys(req.project!.id);
      const { body, contentType, filename } = exportKeys(format, keys, locales, register);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(body);
    },
  );

  // -------------------------------------------------------------- public sdk

  /**
   * What the SDK fetches at runtime.
   *
   * API key only, no JWT. Unapproved AI drafts are withheld for regulated
   * keys, so production never serves unreviewed machine output.
   */
  r.get("/bundle", requireApiKey, async (req: AuthedRequest, res) => {
    const locale = String(req.query.lang ?? req.project!.sourceLocale);
    const register = String(req.query.register ?? "neutral");

    const keys = await req.store.listKeys(req.project!.id);
    const chain = fallbackChain(locale);
    const bundle: Record<string, string> = {};

    for (const key of keys) {
      if (key.regulated && key.draft.includes(locale)) continue;

      for (const tag of chain) {
        const table = key.values[tag];
        const value =
          table?.[register] ?? table?.neutral ?? table?.formal ?? table?.casual;
        if (value) {
          bundle[key.name] = value;
          break;
        }
      }
    }

    const def = getLocale(locale);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=86400");
    res.json({
      locale,
      register,
      dir: def.dir,
      fallback: chain,
      translations: bundle,
    });
  });

  return r;
}

function safeUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

/** Turn nested locale JSON into dotted keys. */
function flatten(input: Record<string, any>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    const name = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, name));
    } else if (typeof v === "string") {
      out[name] = v;
    }
  }
  return out;
}
