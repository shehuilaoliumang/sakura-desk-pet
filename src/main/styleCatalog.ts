import fs from "node:fs";
import path from "node:path";
import type { StyleDescriptor } from "../shared/types";
import { readPackStyle } from "./pack";

/** Every pack directory that declares a style. A new folder shows up without a code change. */
export function discoverStyles(appRoot: string): StyleDescriptor[] {
  const packsDir = path.join(appRoot, "packs");
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(packsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: StyleDescriptor[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(packsDir, entry.name);
    const manifest = path.join(dir, "pack.json");
    if (!fs.existsSync(manifest)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(manifest, "utf8")) as Record<string, unknown>;
      const style = readPackStyle(raw.style);
      if (!style) continue;
      const root = path.relative(appRoot, dir).split(path.sep).join("/");
      found.push({ ...style, root });
    } catch {
      // a broken manifest is skipped; the active pack still reports its own warning
    }
  }
  found.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh"));
  return found;
}
