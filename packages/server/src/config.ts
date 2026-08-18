/**
 * Configuration, read once at boot.
 *
 * Anything that would silently produce an insecure deployment is checked here
 * and refused loudly, rather than discovered in production.
 */

function env(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

const JWT_SECRET = env("JWT_SECRET");
const NODE_ENV = env("NODE_ENV", "development")!;
const isProd = NODE_ENV === "production";

// A short secret is the single most common way a self-hosted deployment ends
// up forgeable. Refuse to boot rather than accept one.
if (JWT_SECRET && JWT_SECRET.length < 32) {
  throw new Error(
    `JWT_SECRET must be at least 32 characters (got ${JWT_SECRET.length}). ` +
      `Generate one with: openssl rand -hex 32`,
  );
}
if (isProd && !JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production.");
}

const MONGO_CONNECTION_URL = env("MONGO_CONNECTION_URL");
if (isProd && !MONGO_CONNECTION_URL) {
  throw new Error(
    "MONGO_CONNECTION_URL is required in production. The in-memory store is " +
      "for development only and loses all data on restart.",
  );
}

export const config = {
  nodeEnv: NODE_ENV,
  isProd,
  port: Number(env("PORT", "5000")),

  jwtSecret: JWT_SECRET ?? "dev-only-insecure-secret-not-for-production-use",
  jwtExpiry: env("JWT_EXPIRY", "7d")!,

  mongoUrl: MONGO_CONNECTION_URL,
  mongoDb: env("MONGO_DB", "selakata")!,

  corsOrigin: env("CORS_ORIGIN", "*")!,

  /** Guardrail against a runaway import filling the database. 0 disables. */
  maxKeysPerProject: Number(env("MAX_KEYS_PER_PROJECT", "20000")),

  ai: {
    provider: env("AI_PROVIDER", "gemini")!,
    geminiApiKey: env("GEMINI_API_KEY"),
    geminiModel: env("GEMINI_MODEL", "gemini-2.5-flash")!,
    useVertex: env("GEMINI_USE_VERTEX", "false") === "true",
    googleCloudProject: env("GOOGLE_CLOUD_PROJECT"),
    googleCloudLocation: env("GOOGLE_CLOUD_LOCATION", "us-central1")!,
  },
} as const;

export function aiConfigured(): boolean {
  return config.ai.useVertex
    ? Boolean(config.ai.googleCloudProject)
    : Boolean(config.ai.geminiApiKey);
}
