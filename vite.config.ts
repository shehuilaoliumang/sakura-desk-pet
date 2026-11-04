import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

// /pet is both the HTTP API and the renderer folder. Source files stay on Vite.
function bypassSource(req: { url?: string }): string | undefined {
  const url = req.url ?? "";
  if (url.includes("/media/")) return undefined;
  if (/\.(tsx?|jsx?|mjs|css|map|svg|png|json)(\?|$)/.test(url)) return url;
  return undefined;
}

export default defineConfig({
  root: path.join(root, "src/renderer"),
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.join(root, "src/shared"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 7342,
    strictPort: true,
    proxy: {
      "/pet": {
        target: "http://127.0.0.1:7341",
        bypass: bypassSource,
      },
      "/dsh-pet-7340": "http://127.0.0.1:7341",
      "/health": "http://127.0.0.1:7341",
    },
  },
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
  },
});
