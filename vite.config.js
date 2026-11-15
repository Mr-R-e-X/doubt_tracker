import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build as esbuild } from "esbuild";
import manifest from "./src/manifest.json";

/**
 * Bundle offscreen as a classic IIFE script (no type=module / absolute /assets).
 * Chrome offscreen documents are unreliable with Vite's ESM modulepreload output.
 */
function bundleOffscreenClassic() {
  const outHtml = resolve(__dirname, "dist/src/offscreen.html");
  const outJs = resolve(__dirname, "dist/src/offscreen.js");
  const entryJs = resolve(__dirname, "src/offscreen.js");

  return {
    name: "bundle-offscreen-classic",
    apply: "build",
    async closeBundle() {
      mkdirSync(dirname(outJs), { recursive: true });

      await esbuild({
        entryPoints: [entryJs],
        outfile: outJs,
        bundle: true,
        format: "iife",
        platform: "browser",
        target: ["chrome120"],
        minify: true,
        logLevel: "silent",
      });

      writeFileSync(
        outHtml,
        `<!doctype html>
<html>
  <body>
    <script src="./offscreen.js"></script>
  </body>
</html>
`,
      );
    },
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), bundleOffscreenClassic()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
  },
});
