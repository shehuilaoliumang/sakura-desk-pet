import { build } from "esbuild";
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Keep this path rule aligned with src/main/paths.ts
function dataDir() {
  if (process.env.SAKURA_PET_DATA_DIR) return path.resolve(process.env.SAKURA_PET_DATA_DIR);
  return path.join(os.homedir(), ".config", "sakura-pet");
}

function readPort() {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(dataDir(), "settings.json"), "utf8"));
    const port = json?.api?.port;
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) return port;
  } catch {
    // first launch
  }
  return 7341;
}

function needsNoSandbox() {
  if (process.env.SAKURA_PET_NO_SANDBOX === "1") return true;
  if (process.env.SAKURA_PET_NO_SANDBOX === "0") return false;
  try {
    return fs.readFileSync("/proc/sys/kernel/unprivileged_userns_clone", "utf8").trim() === "0";
  } catch {
    return false;
  }
}

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  sourcemap: true,
  external: ["electron"],
};

await build({ ...common, entryPoints: [path.join(root, "electron/main.ts")], outfile: path.join(root, "dist-electron/main.cjs") });
await build({ ...common, entryPoints: [path.join(root, "electron/preload.ts")], outfile: path.join(root, "dist-electron/preload.cjs") });

const port = readPort();
const apiOrigin = `http://127.0.0.1:${port}`;
const bypassSource = (req) => {
  const url = req.url ?? "";
  if (url.includes("/media/")) return undefined;
  if (/\.(tsx?|jsx?|mjs|css|map|svg|png|json)(\?|$)/.test(url)) return url;
  return undefined;
};
const vite = await createServer({
  configFile: path.join(root, "vite.config.ts"),
  server: {
    proxy: {
      "/pet": { target: apiOrigin, bypass: bypassSource },
      "/dsh-pet-7340": apiOrigin,
      "/health": apiOrigin,
    },
  },
});
await vite.listen();

const electronPath = require("electron");
const args = [];
if (needsNoSandbox()) {
  args.push("--no-sandbox");
  console.log("[sakura-pet] 当前环境没有可用的用户命名空间，已加上 --no-sandbox");
}
args.push(path.join(root, "dist-electron/main.cjs"));

const child = spawn(String(electronPath), args, {
  stdio: "inherit",
  env: {
    ...process.env,
    SAKURA_PET_RENDERER_URL: "http://127.0.0.1:7342/",
    SAKURA_PET_ROOT: root,
  },
});

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  if (!child.killed) child.kill();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code) => {
  void vite.close().finally(() => process.exit(code ?? 0));
});
