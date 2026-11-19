/**
 * The old procedural 像素Q generator was rejected.
 * Frames are cut from the approved redraws by scripts/pack-pixel-q.mjs.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "pack-pixel-q.mjs");
const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
process.exit(result.status ?? 1);
