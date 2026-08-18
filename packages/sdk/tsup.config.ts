import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/react.tsx", "src/server.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ["react"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
