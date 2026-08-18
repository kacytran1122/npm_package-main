import { defineConfig, passthroughImageService } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  integrations: [react()],
  // Static output: the site is served by nginx, same as the dashboard.
  output: "static",
  build: { format: "directory" },
  // Nothing here is raster, so the sharp-backed image service is dead weight
  // and one more native binary for CI to install.
  image: { service: passthroughImageService() },
  devToolbar: { enabled: false },
  vite: {
    // The SDK is a workspace sibling. Bundling it rather than externalising it
    // means the demos on this page run the same build users install.
    ssr: { noExternal: ["selakata"] },
  },
});
