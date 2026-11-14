import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { resolve } from "node:path";
import manifest from "./src/manifest.json";

function includeOffscreen() {
  const offscreen = resolve(__dirname, "src/offscreen.html");

  return {
    name: "include-offscreen",
    enforce: "post",
    options(options) {
      const input = options.input;

      if (!input) {
        options.input = { offscreen };
      } else if (typeof input === "string") {
        options.input = [input, offscreen];
      } else if (Array.isArray(input)) {
        if (!input.includes(offscreen)) {
          options.input = [...input, offscreen];
        }
      } else if (typeof input === "object") {
        options.input = { ...input, offscreen };
      }

      return options;
    }
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), includeOffscreen()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: true
  }
});
