import { z } from "zod";
import { defaultSettings } from "./defaults";
import {
  DEFAULT_LLM_PROVIDER,
  FORM_IDS,
  FORM_SLOT,
  THEME_IDS,
  isFormId,
  isThemeId,
  type FormId,
  type Settings,
} from "./types";

const formIdSchema = z.enum(FORM_IDS);

const formSlotSchema = z.object({
  id: formIdSchema,
  slot: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  enabled: z.boolean(),
  reserved: z.boolean(),
  displayName: z.string(),
  persona: z.string(),
});

export const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  honorific: z.string(),
  nickname: z.string(),
  darkMayAddressDirectly: z.boolean(),
  snarkCap: z.number(),
  tone: z.object({
    intensity: z.number(),
    politeness: z.number(),
  }),
  duoVoice: z.object({
    darkShare: z.number(),
    dualBubble: z.boolean(),
  }),
  tabooWords: z.array(z.string()),
  defaultForm: formIdSchema,
  activeForm: formIdSchema,
  forms: z.object({
    normal: formSlotSchema,
    dark: formSlotSchema,
    duo: formSlotSchema,
    form4: formSlotSchema,
    form5: formSlotSchema,
  }),
  adapters: z.object({
    dsh: z.boolean(),
    codex: z.boolean(),
    webhook: z.boolean(),
  }),
  api: z.object({
    host: z.literal("127.0.0.1"),
    port: z.number(),
  }),
  pack: z.object({
    root: z.string(),
  }),
  window: z.object({
    x: z.number().nullable(),
    y: z.number().nullable(),
    scale: z.number(),
    alwaysOnTop: z.boolean(),
  }),
  llm: z.object({
    enabled: z.boolean(),
    provider: z.string(),
    baseUrl: z.string(),
    apiKey: z.string(),
    model: z.string(),
    timeoutMs: z.number(),
  }),
  theme: z.enum(THEME_IDS),
});

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSettings(input: Settings): Settings {
  const s = input;
  s.schemaVersion = 1;
  s.honorific = s.honorific.trim().slice(0, 24);
  s.nickname = s.nickname.trim().slice(0, 24);
  s.snarkCap = clamp(s.snarkCap, 0, 100);
  s.tone.intensity = clamp(s.tone.intensity, 0, 100);
  s.tone.politeness = clamp(s.tone.politeness, 0, 100);
  s.duoVoice.darkShare = clamp(s.duoVoice.darkShare, 0, 100);
  s.tabooWords = [...new Set(s.tabooWords.map((word) => word.trim()).filter((word) => word.length > 0 && word.length <= 32))].slice(0, 40);
  s.api.host = "127.0.0.1";
  s.api.port = Math.round(clamp(s.api.port, 1024, 65535));
  s.pack.root = s.pack.root.trim().slice(0, 300) || "packs/sakura";
  s.window.scale = Math.round(clamp(s.window.scale, 0.4, 2) * 100) / 100;
  if (s.window.x != null && !Number.isFinite(s.window.x)) s.window.x = null;
  if (s.window.y != null && !Number.isFinite(s.window.y)) s.window.y = null;
  const provider = s.llm.provider.trim().slice(0, 64);
  s.llm.provider = provider || DEFAULT_LLM_PROVIDER;
  s.llm.baseUrl = s.llm.baseUrl.trim().slice(0, 500);
  s.llm.apiKey = s.llm.apiKey.replace(/[\u0000\r\n]/g, "").trim().slice(0, 2000);
  s.llm.model = s.llm.model.trim().slice(0, 128);
  s.llm.timeoutMs = Math.round(clamp(s.llm.timeoutMs, 500, 120_000));
  if (!isThemeId(s.theme)) s.theme = "warm";

  for (const id of FORM_IDS) {
    const slot = s.forms[id];
    slot.id = id;
    slot.slot = FORM_SLOT[id];
    slot.reserved = id === "form4" || id === "form5";
    if (!slot.reserved) slot.enabled = true;
    const name = slot.displayName.trim().slice(0, 16);
    slot.displayName = name || defaultSettings().forms[id].displayName;
    slot.persona = slot.persona.slice(0, 2000);
  }

  if (!s.forms[s.defaultForm].enabled) s.defaultForm = "normal";
  if (!s.forms[s.activeForm].enabled) s.activeForm = "normal";
  return s;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function mergeSettings(base: Settings, input: unknown): Settings {
  const next = structuredClone(base);
  if (!isRecord(input)) return next;
  const src = input;

  if (typeof src.honorific === "string") next.honorific = src.honorific;
  if (typeof src.nickname === "string") next.nickname = src.nickname;
  if (typeof src.darkMayAddressDirectly === "boolean") next.darkMayAddressDirectly = src.darkMayAddressDirectly;
  if (typeof src.snarkCap === "number") next.snarkCap = src.snarkCap;
  if (Array.isArray(src.tabooWords)) next.tabooWords = src.tabooWords.filter((word): word is string => typeof word === "string");
  if (typeof src.defaultForm === "string" && isFormId(src.defaultForm)) next.defaultForm = src.defaultForm;
  if (typeof src.activeForm === "string" && isFormId(src.activeForm)) next.activeForm = src.activeForm;

  if (isRecord(src.tone)) {
    if (typeof src.tone.intensity === "number") next.tone.intensity = src.tone.intensity;
    if (typeof src.tone.politeness === "number") next.tone.politeness = src.tone.politeness;
  }
  if (isRecord(src.duoVoice)) {
    if (typeof src.duoVoice.darkShare === "number") next.duoVoice.darkShare = src.duoVoice.darkShare;
    if (typeof src.duoVoice.dualBubble === "boolean") next.duoVoice.dualBubble = src.duoVoice.dualBubble;
  }
  if (isRecord(src.adapters)) {
    if (typeof src.adapters.dsh === "boolean") next.adapters.dsh = src.adapters.dsh;
    if (typeof src.adapters.codex === "boolean") next.adapters.codex = src.adapters.codex;
    if (typeof src.adapters.webhook === "boolean") next.adapters.webhook = src.adapters.webhook;
  }
  if (isRecord(src.api)) {
    if (src.api.host === "127.0.0.1") next.api.host = "127.0.0.1";
    if (typeof src.api.port === "number") next.api.port = src.api.port;
  }
  if (isRecord(src.pack) && typeof src.pack.root === "string") next.pack.root = src.pack.root;
  if (isRecord(src.window)) {
    if (typeof src.window.scale === "number") next.window.scale = src.window.scale;
    if (typeof src.window.alwaysOnTop === "boolean") next.window.alwaysOnTop = src.window.alwaysOnTop;
    if (typeof src.window.x === "number") next.window.x = src.window.x;
    if (typeof src.window.y === "number") next.window.y = src.window.y;
  }
  if (isRecord(src.llm)) {
    if (typeof src.llm.enabled === "boolean") next.llm.enabled = src.llm.enabled;
    if (typeof src.llm.provider === "string") next.llm.provider = src.llm.provider;
    if (typeof src.llm.baseUrl === "string") next.llm.baseUrl = src.llm.baseUrl;
    if (typeof src.llm.apiKey === "string") next.llm.apiKey = src.llm.apiKey;
    if (typeof src.llm.model === "string") next.llm.model = src.llm.model;
    if (typeof src.llm.timeoutMs === "number") next.llm.timeoutMs = src.llm.timeoutMs;
  }
  if (typeof src.theme === "string" && isThemeId(src.theme)) next.theme = src.theme;
  if (isRecord(src.forms)) {
    for (const id of FORM_IDS) {
      const patch = src.forms[id];
      if (!isRecord(patch)) continue;
      const slot = next.forms[id];
      if (typeof patch.displayName === "string") slot.displayName = patch.displayName;
      if (typeof patch.persona === "string") slot.persona = patch.persona;
      if (typeof patch.enabled === "boolean") slot.enabled = patch.enabled;
    }
  }
  return next;
}

export type ParseResult = { ok: true; settings: Settings } | { ok: false; issues: string[] };

export function parseSettings(input: unknown, base?: Settings): ParseResult {
  const merged = mergeSettings(base ?? defaultSettings(), input);
  const parsed = settingsSchema.safeParse(merged);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "settings"}: ${issue.message}`),
    };
  }
  return { ok: true, settings: normalizeSettings(parsed.data) };
}
