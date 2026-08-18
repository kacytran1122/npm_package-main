/**
 * Integration tests. These drive the real Express app over a real socket
 * against the in-memory store, so routing, auth, and serialization are all
 * exercised rather than mocked.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/index.js";
import { MemoryStore } from "../dist/store.js";

/** Boot the app on an ephemeral port and return a small fetch helper. */
async function boot() {
  const app = createApp(new MemoryStore());
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  const call = async (method, path, { token, apiKey, body } = {}) => {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    if (apiKey) headers["x-api-key"] = apiKey;

    const res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  };

  return { call, close: () => new Promise((r) => server.close(r)) };
}

/** Register a user, create a project, return everything a test needs. */
async function seed(call) {
  const reg = await call("POST", "/auth/register", {
    body: { email: `kacy${Math.random()}@example.com`, password: "correct-horse-battery" },
  });
  const token = reg.data.token;

  const project = await call("POST", "/projects", {
    token,
    body: { name: "Storefront", sourceLocale: "en", locales: ["vi", "th", "id"] },
  });

  return { token, project: project.data };
}

test("health reports store and locale count", async () => {
  const { call, close } = await boot();
  const res = await call("GET", "/health");
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.store, "memory");
  assert.equal(res.data.locales, 29);
  await close();
});

test("locales endpoint exposes direction and fallback chains", async () => {
  const { call, close } = await boot();
  const { data } = await call("GET", "/locales");

  const jawi = data.find((l) => l.code === "ms-Arab");
  assert.equal(jawi.dir, "rtl");

  const lao = data.find((l) => l.code === "lo");
  assert.deepEqual(lao.fallback, ["lo", "th", "en"]);
  await close();
});

test("rejects short passwords and duplicate emails", async () => {
  const { call, close } = await boot();
  const short = await call("POST", "/auth/register", {
    body: { email: "a@b.co", password: "short" },
  });
  assert.equal(short.status, 400);

  const first = await call("POST", "/auth/register", {
    body: { email: "dup@b.co", password: "correct-horse-battery" },
  });
  assert.equal(first.status, 201);

  const second = await call("POST", "/auth/register", {
    body: { email: "dup@b.co", password: "correct-horse-battery" },
  });
  assert.equal(second.status, 409);
  await close();
});

test("login does not reveal whether an email exists", async () => {
  const { call, close } = await boot();
  await call("POST", "/auth/register", {
    body: { email: "real@b.co", password: "correct-horse-battery" },
  });

  const wrongPassword = await call("POST", "/auth/login", {
    body: { email: "real@b.co", password: "nope" },
  });
  const noSuchUser = await call("POST", "/auth/login", {
    body: { email: "ghost@b.co", password: "nope" },
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.equal(wrongPassword.data.error, noSuchUser.data.error);
  await close();
});

test("unauthenticated requests are refused", async () => {
  const { call, close } = await boot();
  assert.equal((await call("GET", "/projects")).status, 401);
  assert.equal((await call("GET", "/projects", { token: "garbage" })).status, 401);
  await close();
});

test("project creation validates locale codes", async () => {
  const { call, close } = await boot();
  const reg = await call("POST", "/auth/register", {
    body: { email: "v@b.co", password: "correct-horse-battery" },
  });

  const bad = await call("POST", "/projects", {
    token: reg.data.token,
    body: { name: "X", sourceLocale: "en", locales: ["klingon"] },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /klingon/);
  await close();
});

test("a non-member cannot read someone else's project", async () => {
  const { call, close } = await boot();
  const { project } = await seed(call);

  const outsider = await call("POST", "/auth/register", {
    body: { email: "outsider@b.co", password: "correct-horse-battery" },
  });

  const res = await call("GET", `/projects/${project.id}`, {
    token: outsider.data.token,
  });
  assert.equal(res.status, 403);
  await close();
});

test("keys round-trip and record a revision", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  const created = await call("POST", `/projects/${project.id}/keys`, {
    token,
    body: { name: "cart.title", description: "Cart heading" },
  });
  assert.equal(created.status, 201);

  const put = await call("PUT", `/projects/${project.id}/keys/${created.data.id}`, {
    token,
    body: { locale: "vi", register: "formal", value: "Giỏ hàng của quý khách" },
  });
  assert.equal(put.status, 200);
  assert.equal(put.data.values.vi.formal, "Giỏ hàng của quý khách");

  const revisions = await call("GET", `/projects/${project.id}/revisions`, { token });
  assert.equal(revisions.data.length, 1);
  assert.equal(revisions.data[0].before, null);
  assert.equal(revisions.data[0].after, "Giỏ hàng của quý khách");
  assert.equal(revisions.data[0].source, "human");
  await close();
});

test("duplicate key names are rejected", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  await call("POST", `/projects/${project.id}/keys`, { token, body: { name: "a.b" } });
  const dup = await call("POST", `/projects/${project.id}/keys`, {
    token,
    body: { name: "a.b" },
  });
  assert.equal(dup.status, 409);
  await close();
});

test("regulated keys refuse AI-sourced writes", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  const key = await call("POST", `/projects/${project.id}/keys`, {
    token,
    body: { name: "legal.terms", regulated: true },
  });

  const ai = await call("PUT", `/projects/${project.id}/keys/${key.data.id}`, {
    token,
    body: { locale: "vi", value: "máy dịch", source: "ai" },
  });
  assert.equal(ai.status, 422);

  const human = await call("PUT", `/projects/${project.id}/keys/${key.data.id}`, {
    token,
    body: { locale: "vi", value: "Điều khoản", source: "human" },
  });
  assert.equal(human.status, 200);
  await close();
});

test("import flattens nested JSON into dotted keys", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  const res = await call("POST", `/projects/${project.id}/import`, {
    token,
    body: {
      locale: "en",
      entries: { cart: { title: "Your cart", empty: "Nothing here" }, hero: "Welcome" },
    },
  });
  assert.equal(res.data.created, 3);

  const keys = await call("GET", `/projects/${project.id}/keys`, { token });
  const names = keys.data.map((k) => k.name).sort();
  assert.deepEqual(names, ["cart.empty", "cart.title", "hero"]);
  await close();
});

test("translator scoped to a locale cannot edit another", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  const translator = await call("POST", "/auth/register", {
    body: { email: "th-only@b.co", password: "correct-horse-battery" },
  });
  await call("POST", `/projects/${project.id}/members`, {
    token,
    body: { email: "th-only@b.co", role: "translator", locales: ["th"] },
  });

  const key = await call("POST", `/projects/${project.id}/keys`, {
    token,
    body: { name: "greeting" },
  });

  const allowed = await call("PUT", `/projects/${project.id}/keys/${key.data.id}`, {
    token: translator.data.token,
    body: { locale: "th", value: "สวัสดี" },
  });
  assert.equal(allowed.status, 200);

  const denied = await call("PUT", `/projects/${project.id}/keys/${key.data.id}`, {
    token: translator.data.token,
    body: { locale: "vi", value: "Xin chào" },
  });
  assert.equal(denied.status, 403);
  await close();
});

test("viewers cannot write", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  const viewer = await call("POST", "/auth/register", {
    body: { email: "viewer@b.co", password: "correct-horse-battery" },
  });
  await call("POST", `/projects/${project.id}/members`, {
    token,
    body: { email: "viewer@b.co", role: "viewer" },
  });

  const res = await call("POST", `/projects/${project.id}/keys`, {
    token: viewer.data.token,
    body: { name: "nope" },
  });
  assert.equal(res.status, 403);
  await close();
});

test("bundle endpoint serves the SDK with an API key and walks fallbacks", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  const key = await call("POST", `/projects/${project.id}/keys`, {
    token,
    body: { name: "greeting" },
  });
  await call("PUT", `/projects/${project.id}/keys/${key.data.id}`, {
    token,
    body: { locale: "en", value: "Hello" },
  });

  // No Vietnamese value, so the chain vi -> en supplies the English one.
  const bundle = await call("GET", "/bundle?lang=vi", { apiKey: project.apiKey });
  assert.equal(bundle.status, 200);
  assert.equal(bundle.data.translations.greeting, "Hello");
  assert.deepEqual(bundle.data.fallback, ["vi", "en"]);
  assert.equal(bundle.data.dir, "ltr");

  const bad = await call("GET", "/bundle?lang=vi", { apiKey: "bhs_wrong" });
  assert.equal(bad.status, 401);
  await close();
});

test("bundle reports rtl for Jawi", async () => {
  const { call, close } = await boot();
  const { project } = await seed(call);
  const bundle = await call("GET", "/bundle?lang=ms-Arab", { apiKey: project.apiKey });
  assert.equal(bundle.data.dir, "rtl");
  await close();
});

test("rotating the API key invalidates the old one", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  const rotated = await call("POST", `/projects/${project.id}/rotate-key`, { token });
  assert.notEqual(rotated.data.apiKey, project.apiKey);

  const old = await call("GET", "/bundle", { apiKey: project.apiKey });
  assert.equal(old.status, 401);

  const fresh = await call("GET", "/bundle", { apiKey: rotated.data.apiKey });
  assert.equal(fresh.status, 200);
  await close();
});

test("lint flags a hardcoded Thai gendered particle", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  await call("POST", `/projects/${project.id}/import`, {
    token,
    body: { locale: "en", entries: { thanks: "Thank you" } },
  });
  await call("POST", `/projects/${project.id}/import`, {
    token,
    body: { locale: "th", entries: { thanks: "ขอบคุณครับ" } },
  });

  const issues = await call("GET", `/projects/${project.id}/lint`, { token });
  assert.ok(issues.data.some((i) => i.rule === "gendered-particle"));
  await close();
});

test("readiness scores translated keys per locale", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  await call("POST", `/projects/${project.id}/import`, {
    token,
    body: { locale: "en", entries: { a: "A", b: "B" } },
  });
  await call("POST", `/projects/${project.id}/import`, {
    token,
    body: { locale: "vi", entries: { a: "A-vi" } },
  });

  const res = await call("GET", `/projects/${project.id}/readiness`, { token });
  const vi = res.data.locales.find((l) => l.locale === "vi");

  assert.equal(vi.counts.totalKeys, 2);
  assert.equal(vi.counts.translatedKeys, 1);
  assert.equal(vi.facets.find((f) => f.id === "translated").score, 0.5);

  // The source locale is not scored against itself.
  assert.ok(!res.data.locales.some((l) => l.locale === "en"));

  // Untouched locales rank below the half-translated one.
  assert.equal(res.data.locales[res.data.locales.length - 1].locale, "vi");
  assert.ok(res.data.blocking.includes("th"));
  await close();
});

test("readiness docks a locale whose translations are unreviewed AI drafts", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  await call("POST", `/projects/${project.id}/import`, {
    token,
    body: { locale: "en", entries: { a: "A", b: "B" } },
  });
  await call("POST", `/projects/${project.id}/import`, {
    token,
    body: { locale: "vi", entries: { a: "A-vi", b: "B-vi" }, source: "ai" },
  });

  const res = await call("GET", `/projects/${project.id}/readiness`, { token });
  const vi = res.data.locales.find((l) => l.locale === "vi");

  // Fully translated, so the old percent metric would have called this 100%.
  assert.equal(vi.facets.find((f) => f.id === "translated").score, 1);
  assert.ok(vi.score < 100);
  assert.equal(vi.counts.draftKeys, 2);
  assert.equal(vi.facets.find((f) => f.id === "reviewed").score, 0);
  await close();
});

test("readiness accepts a release threshold and reports what blocks it", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  await call("POST", `/projects/${project.id}/import`, {
    token,
    body: { locale: "en", entries: { a: "A" } },
  });

  const lax = await call("GET", `/projects/${project.id}/readiness?threshold=0`, { token });
  assert.deepEqual(lax.data.blocking, []);
  assert.equal(lax.data.releaseThreshold, 0);

  const strict = await call("GET", `/projects/${project.id}/readiness?threshold=99`, { token });
  assert.equal(strict.data.releaseThreshold, 99);
  assert.equal(strict.data.blocking.length, 3);

  // A nonsense threshold falls back to the default rather than 400ing.
  const bogus = await call("GET", `/projects/${project.id}/readiness?threshold=abc`, { token });
  assert.equal(bogus.data.releaseThreshold, 75);
  await close();
});

test("export produces valid Android XML with escaped apostrophes", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  await call("POST", `/projects/${project.id}/import`, {
    token,
    body: { locale: "en", entries: { "cart.title": "Your cart's items" } },
  });

  const res = await call("GET", `/projects/${project.id}/export?format=android&locale=en`, {
    token,
  });
  assert.match(res.data, /<string name="cart_title">Your cart\\'s items<\/string>/);
  await close();
});

test("export produces CSV that quotes embedded commas", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  await call("POST", `/projects/${project.id}/import`, {
    token,
    body: { locale: "en", entries: { greet: "Hello, friend" } },
  });

  const res = await call("GET", `/projects/${project.id}/export?format=csv`, { token });
  assert.match(res.data, /"Hello, friend"/);
  await close();
});

test("AI draft returns 503 when no provider is configured", async () => {
  const { call, close } = await boot();
  const { token, project } = await seed(call);

  const key = await call("POST", `/projects/${project.id}/keys`, {
    token,
    body: { name: "greeting" },
  });
  await call("PUT", `/projects/${project.id}/keys/${key.data.id}`, {
    token,
    body: { locale: "en", value: "Hello" },
  });

  const res = await call("POST", `/projects/${project.id}/keys/${key.data.id}/draft`, {
    token,
    body: { locale: "vi" },
  });
  assert.equal(res.status, 503);
  await close();
});
