import fs from "node:fs";
import path from "node:path";
import { FORM_IDS, PET_EVENTS, type FormId, type PackClip, type PetEvent, type ResolvedPack } from "../shared/types";

const LOOP: Record<PetEvent, boolean> = {
  idle: true,
  thinking: true,
  working: true,
  waiting: true,
  success: false,
  error: false,
};

const LABEL: Record<PetEvent, string> = {
  idle: "待机",
  thinking: "思考",
  working: "工作",
  waiting: "等待",
  success: "完成",
  error: "出错",
};

const EXTS = [".webm", ".gif", ".png", ".webp", ".mov"] as const;
const CLIP_NAMES = ["idle", "thinking", "working", "waiting", "success", "error", "click"] as const;

export function resolvePack(root: string): ResolvedPack {
  const manifestPath = path.join(root, "pack.json");
  let id = "sakura";
  let name = "樱 · 占位包";
  let version = "0.1.0";
  let credit = "原创占位矢量，粉丝向重新设计，不是 Fate / TYPE-MOON 的官方素材。";
  let warning: string | null = null;

  if (!fs.existsSync(manifestPath)) {
    warning = "找不到 pack.json，先用内置矢量。";
  } else {
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      if (typeof raw.id === "string" && raw.id.trim()) id = raw.id.trim();
      if (typeof raw.name === "string" && raw.name.trim()) name = raw.name.trim();
      if (typeof raw.version === "string" && raw.version.trim()) version = raw.version.trim();
      if (typeof raw.credit === "string") credit = raw.credit;
    } catch {
      warning = "pack.json 解析失败，先用内置矢量。";
    }
  }

  const animRoot = path.join(root, "animations");
  const forms = {} as ResolvedPack["forms"];
  for (const form of FORM_IDS) {
    const clips = PET_EVENTS.map((state) => toClip(animRoot, form, state));
    const clickFiles = collectFiles(animRoot, form, "click");
    forms[form] = {
      clips,
      click: clickFiles.length
        ? {
            name: "click",
            label: "点击",
            loop: false,
            file: clickFiles[0] ?? null,
            mediaUrl: publicUrl(animRoot, form, clickFiles[0] ?? ""),
            frames: hold(publicUrls(animRoot, form, clickFiles), 3),
          }
        : null,
    };
  }

  return { id, name, version, credit, root, warning, forms };
}

function toClip(animRoot: string, form: FormId, state: PetEvent): PackClip {
  const files = collectFiles(animRoot, form, state);
  const urls = publicUrls(animRoot, form, files);
  const frames = state === "idle" ? paceIdle(urls) : urls;
  return {
    state,
    label: LABEL[state],
    loop: LOOP[state],
    file: files[0] ?? null,
    mediaUrl: frames[0] ?? null,
    frames,
  };
}

function collectFiles(animRoot: string, form: FormId, name: (typeof CLIP_NAMES)[number]): string[] {
  const dir = path.join(animRoot, form, name);
  try {
    if (fs.statSync(dir).isDirectory()) {
      const frames = fs
        .readdirSync(dir)
        .filter((file) => /\.(png|webp|gif)$/i.test(file))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (frames.length) return frames.map((file) => path.join(dir, file));
    }
  } catch {
    // no sequence directory
  }
  for (const ext of EXTS) {
    const full = path.join(animRoot, form, `${name}${ext}`);
    try {
      if (fs.statSync(full).isFile()) return [full];
    } catch {
      // try the next extension
    }
  }
  return [];
}

function publicUrls(animRoot: string, form: FormId, files: string[]): string[] {
  return files.map((file) => publicUrl(animRoot, form, file)).filter((url): url is string => !!url);
}

function publicUrl(animRoot: string, form: FormId, file: string): string | null {
  if (!file) return null;
  const rel = path.relative(path.join(animRoot, form), file).split(path.sep).join("/");
  if (!rel || rel.startsWith("..")) return null;
  return `/pet/media/${form}/${rel}`;
}

/** Two source frames become open, open, open, blink so the blink stays short. */
function paceIdle(urls: string[]): string[] {
  if (urls.length !== 2) return urls;
  return [urls[0] ?? "", urls[0] ?? "", urls[0] ?? "", urls[1] ?? ""];
}

function hold(urls: string[], times: number): string[] {
  if (urls.length !== 1) return urls;
  return Array.from({ length: times }, () => urls[0] ?? "");
}

export function clipLoop(state: PetEvent): boolean {
  return LOOP[state];
}
