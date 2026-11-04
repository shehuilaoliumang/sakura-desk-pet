import { build } from "esbuild";
import { build as viteBuild } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await viteBuild({ configFile: path.join(root, "vite.config.ts") });

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  sourcemap: true,
  external: ["electron"],
};
await build({ ...common, entryPoints: [path.join(root, "electron/main.ts")], outfile: path.join(root, "dist-electron/main.cjs") });
await build({ ...common, entryPoints: [path.join(root, "electron/preload.ts")], outfile: path.join(root, "dist-electron/preload.cjs") });
console.log("[sakura-pet] build 完成。运行仍用 npm start；产物在 dist/ 与 dist-electron/。");
