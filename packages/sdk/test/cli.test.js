import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

/** Run the CLI and capture its output and exit code. */
function sela(args, cwd) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status, out: (error.stdout ?? "") + (error.stderr ?? "") };
  }
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "selakata-cli-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("init records the directory it was actually given", () => {
  withTempDir((dir) => {
    assert.equal(sela(["init", "--country", "VN", "--dir", "i18n"], dir).code, 0);
    const config = JSON.parse(readFileSync(join(dir, "sela.config.json"), "utf8"));
    assert.equal(config.localesDir, "i18n");
    assert.equal(config.country, "VN");
  });
});

test("a flag with no value falls back to the default", () => {
  withTempDir((dir) => {
    // `--dir` with nothing after it must not become undefined and crash.
    const result = sela(["lint", "--dir"], dir);
    assert.equal(result.code, 1);
    assert.match(result.out, /no locales directory at .*locales/);
  });
});

test("a non-numeric threshold is rejected rather than silently NaN", () => {
  withTempDir((dir) => {
    sela(["init", "--country", "VN"], dir);
    const result = sela(["readiness", "--threshold", "abc"], dir);
    assert.equal(result.code, 1);
    assert.match(result.out, /--threshold expects a number/);
  });
});

test("a malformed bundle names the file that failed", () => {
  withTempDir((dir) => {
    sela(["init", "--country", "VN"], dir);
    writeFileSync(join(dir, "locales", "vi.json"), "{ not json");
    const result = sela(["lint"], dir);
    assert.equal(result.code, 1);
    assert.match(result.out, /cannot read .*vi\.json/);
  });
});

test("info resolves a locale tag in any case", () => {
  withTempDir((dir) => {
    const upper = sela(["info", "VI-VN"], dir);
    assert.equal(upper.code, 0);
    assert.equal(JSON.parse(upper.out).code, "vi");
    assert.deepEqual(JSON.parse(sela(["info", "vi"], dir).out), JSON.parse(upper.out));
  });
});
