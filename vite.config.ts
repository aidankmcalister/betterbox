import { defineConfig } from "vite";
import type { Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * Dev-only fix for email images. The reader loads proxied images as <img>
 * (`/api/image-proxy` and inline `/api/message` attachments), so the browser
 * sends `Sec-Fetch-Dest: image`. In the Vite dev server that routes the request
 * to the static-asset pipeline, which 404s and bypasses the server route — the
 * images then fall back to alt text. Production (Nitro) routes by path and is
 * unaffected. Normalizing the header on `/api/` requests lets them reach the
 * handler in dev. The proxy's SSRF and cross-site guards are untouched.
 */
function devApiImageDest(): Plugin {
  return {
    name: "betterbox:dev-api-image-dest",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (
          req.url?.startsWith("/api/") &&
          req.headers["sec-fetch-dest"] === "image"
        ) {
          req.headers["sec-fetch-dest"] = "empty";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    devApiImageDest(),
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    viteReact(),
    nitro(),
  ],
});
