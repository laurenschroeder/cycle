import { iwsdkDev } from "@iwsdk/vite-plugin-dev";

import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { defineConfig, type Plugin } from "vite";
import mkcert from "vite-plugin-mkcert";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Serves public/ui/*.json before the iwsdkDev middleware intercepts them.
function servePublicJson(): Plugin {
  return {
    name: "serve-public-json",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url.startsWith("/ui/") && url.endsWith(".json")) {
          const filePath = join(process.cwd(), "public", url);
          if (existsSync(filePath)) {
            res.setHeader("Content-Type", "application/json");
            res.end(readFileSync(filePath, "utf-8"));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    servePublicJson(),
    mkcert(),
    iwsdkDev({
      emulator: {
        device: "metaQuest3",
      },
      ai: { mode: "agent" },
      verbose: true,
    }),

    compileUIKit({ sourceDir: "ui", outputDir: "public/ui", verbose: true }),
  ],
  server: { host: "0.0.0.0", port: 8081, open: true },
  build: {
    outDir: "dist",
    sourcemap: process.env.NODE_ENV !== "production",
    target: "esnext",
    rollupOptions: { input: "./index.html" },
  },
  esbuild: { target: "esnext" },
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
    esbuildOptions: { target: "esnext" },
  },
  publicDir: "public",
  base: "./",
});
