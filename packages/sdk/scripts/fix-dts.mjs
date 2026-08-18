// tsc emits .d.ts with .js import specifiers, which is correct for ESM.
// Copy each to .d.cts so the CJS conditional export resolves types too.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "dist";
for (const file of readdirSync(dir, { recursive: true })) {
  if (typeof file !== "string" || !file.endsWith(".d.ts")) continue;
  const path = join(dir, file);
  writeFileSync(path.replace(/\.d\.ts$/, ".d.cts"), readFileSync(path, "utf8"));
}
console.log("declaration files mirrored for cjs");
