/**
 * AI drafting.
 *
 * The interesting part is not the API call, it is the prompt. A general
 * "translate this to Thai" request reliably produces text that is grammatical
 * but wrong for a product: it picks a gender for your brand voice, drops
 * classifiers, and ignores register. The prompt below pins those down using
 * the same locale data the SDK ships, and the result is validated with the
 * SDK linter before it is stored.
 */

import {
  classifierFor,
  getLocale,
  lintBundle,
  particleIsGendered,
  politeParticle,
  usesClassifiers,
  type LintIssue,
} from "selakata";
import { config, aiConfigured } from "./config.js";

export interface DraftRequest {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  register: string;
  /** Brand voice gender, needed for Thai, Burmese, and Khmer particles. */
  speakerGender?: "male" | "female" | "neutral";
  /** Existing approved pairs, used as translation memory. */
  memory?: Array<{ source: string; target: string }>;
  /** Terms that must be translated consistently, or not at all. */
  glossary?: Record<string, string>;
  keyName?: string;
}

export interface DraftResult {
  text: string;
  /** Issues the linter found in the model's output. */
  issues: LintIssue[];
  model: string;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "AI translation is not configured. Set GEMINI_API_KEY, or set " +
        "GEMINI_USE_VERTEX=true with GOOGLE_CLOUD_PROJECT.",
    );
    this.name = "AiNotConfiguredError";
  }
}

/**
 * Build the instructions that make output usable rather than merely correct.
 */
export function buildPrompt(req: DraftRequest): string {
  const target = getLocale(req.targetLocale);
  const source = getLocale(req.sourceLocale);
  const rules: string[] = [];

  rules.push(
    `Translate from ${source?.name ?? req.sourceLocale} to ${target?.name ?? req.targetLocale} (${target?.nativeName ?? ""}).`,
  );
  rules.push(
    `Register: ${req.register}. Match it exactly; do not drift more formal or more casual.`,
  );

  if (target?.registers?.length) {
    rules.push(`This language distinguishes: ${target.registers.join(", ")}.`);
  }

  if (usesClassifiers(req.targetLocale)) {
    const order =
      target?.countOrder === "noun-num-clf"
        ? "noun, then numeral, then classifier"
        : "numeral, then classifier, then noun";
    rules.push(
      `This language requires a numeral classifier in counted phrases. ` +
        `Word order is ${order}. Example classifiers: person=${classifierFor(req.targetLocale, "person") ?? "n/a"}, ` +
        `thing=${classifierFor(req.targetLocale, "thing") ?? "n/a"}. ` +
        `Never emit a bare number next to a noun.`,
    );
  }

  if (particleIsGendered(req.targetLocale)) {
    const gender = req.speakerGender ?? "neutral";
    if (gender === "neutral") {
      rules.push(
        `The polite sentence-final particle in this language marks the speaker's ` +
          `gender and there is no neutral form. Write without a polite particle ` +
          `and let the application add one at render time.`,
      );
    } else {
      const particle = politeParticle(req.targetLocale, { speakerGender: gender });
      rules.push(
        `Brand voice speaks as ${gender}. The polite particle is ${particle}. ` +
          `Use it only where natural; do not append it to every sentence.`,
      );
    }
  }

  if (target?.wordSpaced === false) {
    rules.push(
      `This script does not use spaces between words. Do not insert them, and ` +
        `do not add zero-width spaces; the application handles line breaking.`,
    );
  }

  if (target?.code === "my") {
    rules.push(`Output standard Unicode Burmese. Never output Zawgyi.`);
  }
  if (target?.script === "Latn" && target?.code === "vi") {
    rules.push(`Output NFC-normalised Vietnamese with correct tone marks.`);
  }

  if (req.glossary && Object.keys(req.glossary).length) {
    const lines = Object.entries(req.glossary)
      .map(([term, rendering]) => `  "${term}" -> "${rendering}"`)
      .join("\n");
    rules.push(`Glossary, follow exactly:\n${lines}`);
  }

  if (req.memory?.length) {
    const lines = req.memory
      .slice(0, 20)
      .map((m) => `  "${m.source}" -> "${m.target}"`)
      .join("\n");
    rules.push(`Previously approved translations, match their style:\n${lines}`);
  }

  rules.push(
    `Preserve every {placeholder} exactly as written, including spelling and case.`,
  );
  rules.push(
    `Return only the translated string. No quotes, no explanation, no markdown.`,
  );

  return `${rules.join("\n\n")}\n\nSource string:\n${req.text}`;
}

function endpoint(): string {
  const { geminiModel, useVertex, googleCloudProject, googleCloudLocation } = config.ai;
  if (useVertex) {
    return (
      `https://${googleCloudLocation}-aiplatform.googleapis.com/v1/projects/` +
      `${googleCloudProject}/locations/${googleCloudLocation}/publishers/google/` +
      `models/${geminiModel}:generateContent`
    );
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
}

async function callGemini(prompt: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.ai.useVertex) {
    // Vertex uses Application Default Credentials via the metadata server or
    // GOOGLE_APPLICATION_CREDENTIALS. The token is fetched by google-auth in a
    // real deployment; here we rely on an ambient access token.
    const token = process.env.GOOGLE_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        "Vertex mode needs an access token. Set GOOGLE_ACCESS_TOKEN, or run " +
          "with Application Default Credentials on GCP.",
      );
    }
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers["x-goog-api-key"] = config.ai.geminiApiKey!;
  }

  const response = await fetch(endpoint(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data: any = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text ?? "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned no text");
  return text;
}

/**
 * Draft one translation and lint the result.
 *
 * The linter runs on the model's output, not just on human edits, because the
 * failure modes it catches are exactly the ones models produce.
 */
export async function draftTranslation(req: DraftRequest): Promise<DraftResult> {
  if (!aiConfigured()) throw new AiNotConfiguredError();

  const text = await callGemini(buildPrompt(req));
  const keyName = req.keyName ?? "draft";

  const issues = lintBundle(
    req.targetLocale,
    { [keyName]: text },
    { [keyName]: req.text },
  );

  return { text, issues, model: config.ai.geminiModel };
}
