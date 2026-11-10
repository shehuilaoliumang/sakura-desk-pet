import { effectivePersonas } from "./persona";
import type { FormId, Settings } from "./types";

/**
 * Pluggable chat providers.
 *
 * Status bubbles stay on the template pools in `lines.ts`. This module is only
 * for a deliberate chat turn (settings「试对话」, pet menu「问一句」, tray「试对话」).
 *
 * To add a provider: append a `LlmProvider` whose `complete` talks to that API.
 * `chatWithLlm` does not need to change. Keys stay in local settings and are
 * never written into the result text.
 *
 * When chat is disabled, missing a key or address, or the request fails, the
 * spoken line is always `LLM_FALLBACK_LINE`. The pet keeps its work status.
 * 「测试连接」does not require the enable switch and does not change the bubble.
 */

export const LLM_FALLBACK_LINE = "……这会儿说不了。";

export type LlmFailReason =
  | "disabled"
  | "missing-key"
  | "missing-base-url"
  | "bad-base-url"
  | "unknown-provider"
  | "empty"
  | "timeout"
  | "http"
  | "network"
  | "empty-reply"
  | "bad-image"
  | "vision-unsupported";

export interface LlmCallResult {
  ok: boolean;
  /** Spoken line for a chat turn. Failures use `LLM_FALLBACK_LINE`. Test success is 「连上了。」 */
  text: string;
  source: "llm" | "fallback";
  reason: LlmFailReason | null;
  /** Chinese note safe to show in settings. The API key is stripped. */
  detail: string;
}

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface LlmMessage {
  role: "system" | "user";
  content: string | LlmContentPart[];
}

interface LlmFetchInit {
  method: "POST";
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
  redirect: "error";
}

interface LlmFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type LlmFetch = (url: string, init: LlmFetchInit) => Promise<LlmFetchResponse>;

export interface LlmCompleteInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  fetchImpl: LlmFetch;
}

export type LlmCompleteResult =
  | { ok: true; text: string }
  | { ok: false; reason: LlmFailReason; detail: string };

export interface LlmProvider {
  id: string;
  label: string;
  defaultModel: string;
  complete(input: LlmCompleteInput): Promise<LlmCompleteResult>;
}

const PROVIDERS: LlmProvider[] = [
  {
    id: "openai-compatible",
    label: "OpenAI 兼容",
    defaultModel: "gpt-4o-mini",
    complete: completeOpenAiCompatible,
  },
];

export function listLlmProviders(): readonly LlmProvider[] {
  return PROVIDERS;
}

export function findLlmProvider(id: string): LlmProvider | null {
  return PROVIDERS.find((item) => item.id === id) ?? null;
}

/** Join a user base URL to the OpenAI chat-completions path. */
export function openAiCompatibleChatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export function buildChatSystemPrompt(settings: Settings): string {
  const form = settings.activeForm;
  const personas = effectivePersonas(settings);
  const persona = personas.forms[form]?.text.trim() || "你是桌宠樱。话短，只对面前这个人说。";
  const honorific = personas.honorific || "你";
  const nickname = personas.nickname.trim();
  const direct = settings.darkMayAddressDirectly && (form === "dark" || form === "duo");
  const address = direct
    ? `可以直呼「${nickname || "你"}」，不必用「${honorific}」。`
    : `称呼对方为「${honorific}」。`;
  return [
    persona,
    `当前形态：${formLabel(form)}。`,
    address,
    toneHint(settings, form),
    "只说一句能放进气泡的中文口语。不要标题，不要分点，不要用引号把整句包起来，不要说自己是语言模型。",
  ].join("\n");
}

const IMAGE_DATA = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** One local image, already a data URL. Empty means text-only. */
export function normalizeChatImage(image: string | undefined): { ok: true; image: string | null } | { ok: false; detail: string } {
  if (!image) return { ok: true, image: null };
  const compact = image.replace(/\s/g, "");
  if (!compact) return { ok: true, image: null };
  if (compact.length > 2_800_000) return { ok: false, detail: "图片太大，请换一张小一点的" };
  if (!IMAGE_DATA.test(compact)) return { ok: false, detail: "只接受 png、jpeg、webp 或 gif" };
  return { ok: true, image: compact };
}

export async function chatWithLlm(
  settings: Settings,
  message: string,
  fetchImpl?: LlmFetch,
  image?: string,
): Promise<LlmCallResult> {
  const picture = normalizeChatImage(image);
  if (!picture.ok) return fallback("bad-image", picture.detail);
  const trimmed = message.trim().slice(0, 400);
  if (!trimmed && !picture.image) return fallback("empty", "没有要说的话");
  const ready = prepare(settings, "chat");
  if (!ready.ok) return ready.result;
  const spoken = trimmed || "请看这张图。";
  const user: LlmMessage = picture.image
    ? {
      role: "user",
      content: [
        { type: "text", text: spoken },
        { type: "image_url", image_url: { url: picture.image } },
      ],
    }
    : { role: "user", content: spoken };
  const messages: LlmMessage[] = [
    { role: "system", content: picture.image ? `${buildChatSystemPrompt(settings)}\n对方发来一张图。用一句中文口语说说你看到的。` : buildChatSystemPrompt(settings) },
    user,
  ];
  return run(ready.provider, ready, messages, 200, 0.7, fetchImpl ?? defaultFetch());
}

export async function testLlmConnection(settings: Settings, fetchImpl?: LlmFetch): Promise<LlmCallResult> {
  const ready = prepare(settings, "test");
  if (!ready.ok) return ready.result;
  const messages: LlmMessage[] = [{ role: "user", content: "ping" }];
  const result = await run(ready.provider, ready, messages, 1, 0, fetchImpl ?? defaultFetch());
  if (result.ok || result.reason === "empty-reply") {
    return { ok: true, text: "连上了。", source: "llm", reason: null, detail: "连上了。" };
  }
  return result;
}

function formLabel(form: FormId): string {
  if (form === "dark") return "黑樱";
  if (form === "duo") return "双人同框。黑樱护着常态樱，由你说一句";
  if (form === "normal") return "常态樱";
  return "预留形态";
}

function toneHint(settings: Settings, form: FormId): string {
  if (form === "dark" || form === "duo") {
    const cap = settings.snarkCap;
    const snark = cap < 34 ? "收着，不要刺人" : cap < 67 ? "可以硬一点，但到此为止" : "可以锋利，仍不可羞辱";
    return `黑樱的毒舌上限：${snark}。`;
  }
  return settings.tone.politeness >= 60 ? "常态樱用敬语。" : "常态樱少用敬语，仍然温和。";
}

interface ReadyCall {
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

function prepare(settings: Settings, mode: "chat" | "test"): { ok: true; provider: LlmProvider; baseUrl: string; apiKey: string; model: string; timeoutMs: number } | { ok: false; result: LlmCallResult } {
  if (mode === "chat" && !settings.llm.enabled) return { ok: false, result: fallback("disabled", "智能对话没有打开") };
  const provider = findLlmProvider(settings.llm.provider);
  if (!provider) return { ok: false, result: fallback("unknown-provider", "不认识这个提供方") };
  const baseUrl = settings.llm.baseUrl.trim();
  if (!baseUrl) return { ok: false, result: fallback("missing-base-url", "还没有填写接口地址") };
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { ok: false, result: fallback("bad-base-url", "接口地址不是合法的 URL") };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, result: fallback("bad-base-url", "接口地址只接受 http 或 https") };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, result: fallback("bad-base-url", "接口地址不要带账号密码") };
  }
  const apiKey = settings.llm.apiKey.trim();
  if (!apiKey) return { ok: false, result: fallback("missing-key", "还没有填写密钥") };
  return {
    ok: true,
    provider,
    baseUrl,
    apiKey,
    model: settings.llm.model.trim() || provider.defaultModel,
    timeoutMs: settings.llm.timeoutMs,
  };
}

async function run(
  provider: LlmProvider,
  ready: ReadyCall,
  messages: LlmMessage[],
  maxTokens: number,
  temperature: number,
  fetchImpl: LlmFetch,
): Promise<LlmCallResult> {
  try {
    const completed = await provider.complete({
      baseUrl: ready.baseUrl,
      apiKey: ready.apiKey,
      model: ready.model,
      messages,
      maxTokens,
      temperature,
      timeoutMs: ready.timeoutMs,
      fetchImpl,
    });
    if (!completed.ok) return { ok: false, text: LLM_FALLBACK_LINE, source: "fallback", reason: completed.reason, detail: redact(completed.detail, ready.apiKey) };
    const text = oneLine(completed.text);
    if (!text) return fallback("empty-reply", "接口没有返回内容");
    return { ok: true, text, source: "llm", reason: null, detail: "模型回了一句。" };
  } catch {
    return fallback("network", "连不上接口");
  }
}

async function completeOpenAiCompatible(input: LlmCompleteInput): Promise<LlmCompleteResult> {
  const url = openAiCompatibleChatUrl(input.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      }),
      signal: controller.signal,
      redirect: "error",
    });
    const raw = await response.text();
    if (!response.ok) {
      if (requestHasImage(input.messages) && visionRejected(raw)) {
        return { ok: false, reason: "vision-unsupported", detail: "这个接口或模型不支持图片。换一个能看图的模型，或去掉图片再发。" };
      }
      return { ok: false, reason: "http", detail: httpDetail(response.status, raw, input.apiKey) };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, reason: "http", detail: "接口没有返回 JSON" };
    }
    if (payload && typeof payload === "object" && "error" in payload && (payload as { error?: unknown }).error) {
      return { ok: false, reason: "http", detail: httpDetail(response.status, raw, input.apiKey) };
    }
    const text = readAssistant(payload);
    if (!text) return { ok: false, reason: "empty-reply", detail: "接口没有返回内容" };
    return { ok: true, text };
  } catch (error) {
    if (isAbort(error)) return { ok: false, reason: "timeout", detail: "请求超时" };
    if (isRedirect(error)) return { ok: false, reason: "network", detail: "请求被重定向，已中止" };
    const message = error instanceof Error ? error.message : "";
    return { ok: false, reason: "network", detail: redact(message ? `连不上接口：${clip(message)}` : "连不上接口", input.apiKey) };
  } finally {
    clearTimeout(timer);
  }
}

function readAssistant(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  return readContent((message as { content?: unknown }).content);
}

function readContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part && typeof (part as { text: unknown }).text === "string") {
      return (part as { text: string }).text;
    }
    return "";
  }).join("");
}

function requestHasImage(messages: LlmMessage[]): boolean {
  return messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image_url"));
}

function visionRejected(raw: string): boolean {
  return /image|vision|multimodal|image_url/i.test(raw);
}

function httpDetail(status: number, raw: string, secret: string): string {
  let message = "";
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") message = parsed.error;
    else if (parsed.error && typeof parsed.error.message === "string") message = parsed.error.message;
  } catch {
    message = raw;
  }
  const extra = clip(message);
  return redact(extra ? `接口返回 ${status}：${extra}` : `接口返回 ${status}`, secret);
}

function oneLine(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= 200) return line;
  return `${line.slice(0, 200)}…`;
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("***");
}

function fallback(reason: LlmFailReason, detail: string): LlmCallResult {
  return { ok: false, text: LLM_FALLBACK_LINE, source: "fallback", reason, detail };
}

function isAbort(error: unknown): boolean {
  return !!error && typeof error === "object" && "name" in error && (error as { name: string }).name === "AbortError";
}

function isRedirect(error: unknown): boolean {
  return error instanceof Error && /redirect/i.test(error.message);
}

function defaultFetch(): LlmFetch {
  const candidate = (globalThis as unknown as { fetch?: LlmFetch }).fetch;
  if (!candidate) {
    return async () => {
      throw new Error("fetch-unavailable");
    };
  }
  return candidate;
}
