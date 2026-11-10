import { effectivePersonas } from "./persona";
import type { FormId, ReasoningEffort, Settings } from "./types";

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
 * Thinking models may put the chain in `reasoning_content` and leave `content`
 * empty. The bubble uses only the final visible content, never that chain.
 * Local and Qwen chats send `reasoning_effort: "none"` unless the setting says
 * otherwise, so a short spoken line does not wait out a long chain.
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
  reasoningEffort: ReasoningEffort;
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
  const duoLines = form === "duo" && settings.duoVoice.dualBubble;
  return [
    persona,
    `当前形态：${formLabel(settings)}。`,
    address,
    toneHint(settings, form),
    duoLines
      ? "说两句，中间只用 || 隔开。|| 前面是黑樱的一句，后面是常态樱的一句。不要第三句，不要标题，不要分点，不要用引号把整句包起来，不要说自己是语言模型。"
      : "只说一句能放进气泡的中文口语。不要标题，不要分点，不要用引号把整句包起来，不要说自己是语言模型。",
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
  const duoLines = settings.activeForm === "duo" && settings.duoVoice.dualBubble;
  const seen = picture.image
    ? duoLines
      ? "\n对方发来一张图。黑樱和常态樱各用一句说说看到的，仍用 || 隔开。"
      : "\n对方发来一张图。用一句中文口语说说你看到的。"
    : "";
  const messages: LlmMessage[] = [
    { role: "system", content: `${buildChatSystemPrompt(settings)}${seen}` },
    user,
  ];
  return run(ready.provider, ready, messages, CHAT_MAX_TOKENS, 0.7, fetchImpl ?? defaultFetch(), duoLines);
}

/** Room for a thinking model to finish, then one short spoken line. */
const CHAT_MAX_TOKENS = 2048;
/** One retry when the first budget was spent entirely on reasoning. */
const CHAT_RETRY_TOKENS = 4096;

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

function formLabel(settings: Settings): string {
  const form = settings.activeForm;
  if (form === "dark") return "黑樱";
  if (form === "duo" && settings.duoVoice.dualBubble) return "双人同框。黑樱和常态樱都在，两人各说一句";
  if (form === "duo") return settings.duoVoice.darkShare < 50 ? "双人同框。这一句由常态樱说" : "双人同框。这一句由黑樱说";
  if (form === "normal") return "常态樱";
  return "预留形态";
}

function toneHint(settings: Settings, form: FormId): string {
  if (form === "dark" || form === "duo") {
    const cap = settings.snarkCap;
    const snark = cap < 34 ? "收着，不要刺人" : cap < 67 ? "可以硬一点，但到此为止" : "可以锋利，仍不可羞辱";
    const dark = `黑樱的毒舌上限：${snark}。`;
    if (form === "duo" && settings.duoVoice.dualBubble) {
      const soft = settings.tone.politeness >= 60 ? "常态樱用敬语。" : "常态樱少用敬语，仍然温和。";
      return `${dark}${soft}`;
    }
    return dark;
  }
  return settings.tone.politeness >= 60 ? "常态樱用敬语。" : "常态樱少用敬语，仍然温和。";
}

interface ReadyCall {
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  reasoningEffort: ReasoningEffort;
}

function prepare(settings: Settings, mode: "chat" | "test"): { ok: true; provider: LlmProvider; baseUrl: string; apiKey: string; model: string; timeoutMs: number; reasoningEffort: ReasoningEffort } | { ok: false; result: LlmCallResult } {
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
    reasoningEffort: settings.llm.reasoningEffort,
  };
}

async function run(
  provider: LlmProvider,
  ready: ReadyCall,
  messages: LlmMessage[],
  maxTokens: number,
  temperature: number,
  fetchImpl: LlmFetch,
  duoLines = false,
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
      reasoningEffort: ready.reasoningEffort,
      fetchImpl,
    });
    if (!completed.ok) return { ok: false, text: LLM_FALLBACK_LINE, source: "fallback", reason: completed.reason, detail: redact(completed.detail, ready.apiKey) };
    const text = shapeChatReply(completed.text, duoLines);
    if (!text) return fallback("empty-reply", "接口没有返回内容");
    return { ok: true, text, source: "llm", reason: null, detail: "模型回了一句。" };
  } catch {
    return fallback("network", "连不上接口");
  }
}

async function completeOpenAiCompatible(input: LlmCompleteInput): Promise<LlmCompleteResult> {
  const first = await requestCompletion(input, input.maxTokens);
  if (first.reasoningOnly && input.maxTokens >= 256 && input.maxTokens < CHAT_RETRY_TOKENS) {
    const second = await requestCompletion(input, CHAT_RETRY_TOKENS);
    if (second.reasoningOnly) {
      return { ok: false, reason: "empty-reply", detail: "模型只回了思考，没有最终的一句话。可以把超时调长后再试。" };
    }
    return second.result;
  }
  if (first.reasoningOnly) {
    return { ok: false, reason: "empty-reply", detail: "模型只回了思考，没有最终的一句话。可以把超时调长后再试。" };
  }
  return first.result;
}

function completionBody(input: LlmCompleteInput, maxTokens: number): string {
  const payload: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    temperature: input.temperature,
    max_tokens: maxTokens,
  };
  const effort = outboundReasoningEffort(input.reasoningEffort, input.baseUrl, input.model);
  if (effort) payload.reasoning_effort = effort;
  return JSON.stringify(payload);
}

/**
 * LM Studio's Qwen returns a short `content` when the request asks for
 * `reasoning_effort: "none"`. Cloud models that reject the field stay on auto,
 * which omits it unless the host is loopback or the model id is Qwen.
 */
function outboundReasoningEffort(effort: ReasoningEffort, baseUrl: string, model: string): "none" | null {
  if (effort === "off") return null;
  if (effort === "none") return "none";
  if (isLoopback(baseUrl) || /qwen/i.test(model)) return "none";
  return null;
}

function isLoopback(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function requestCompletion(
  input: LlmCompleteInput,
  maxTokens: number,
): Promise<{ reasoningOnly: boolean; result: LlmCompleteResult }> {
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
      body: completionBody(input, maxTokens),
      signal: controller.signal,
      redirect: "error",
    });
    const raw = await response.text();
    if (!response.ok) {
      if (requestHasImage(input.messages) && visionRejected(raw)) {
        return { reasoningOnly: false, result: { ok: false, reason: "vision-unsupported", detail: "这个接口或模型不支持图片。换一个能看图的模型，或去掉图片再发。" } };
      }
      return { reasoningOnly: false, result: { ok: false, reason: "http", detail: httpDetail(response.status, raw, input.apiKey) } };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      return { reasoningOnly: false, result: { ok: false, reason: "http", detail: "接口没有返回 JSON" } };
    }
    if (payload && typeof payload === "object" && "error" in payload && (payload as { error?: unknown }).error) {
      return { reasoningOnly: false, result: { ok: false, reason: "http", detail: httpDetail(response.status, raw, input.apiKey) } };
    }
    const reply = readAssistant(payload);
    if (reply.visible) return { reasoningOnly: false, result: { ok: true, text: reply.visible } };
    if (reply.reasoningOnly) return { reasoningOnly: true, result: { ok: false, reason: "empty-reply", detail: "模型只回了思考，没有最终的一句话。可以把超时调长后再试。" } };
    return { reasoningOnly: false, result: { ok: false, reason: "empty-reply", detail: "接口没有返回内容" } };
  } catch (error) {
    if (isAbort(error)) return { reasoningOnly: false, result: { ok: false, reason: "timeout", detail: "请求超时" } };
    if (isRedirect(error)) return { reasoningOnly: false, result: { ok: false, reason: "network", detail: "请求被重定向，已中止" } };
    const message = error instanceof Error ? error.message : "";
    return { reasoningOnly: false, result: { ok: false, reason: "network", detail: redact(message ? `连不上接口：${clip(message)}` : "连不上接口", input.apiKey) } };
  } finally {
    clearTimeout(timer);
  }
}

function readAssistant(payload: unknown): { visible: string; reasoningOnly: boolean } {
  if (!payload || typeof payload !== "object") return { visible: "", reasoningOnly: false };
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return { visible: "", reasoningOnly: false };
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return { visible: "", reasoningOnly: false };
  const record = message as Record<string, unknown>;
  const visible = stripThinking(readContent(record.content));
  const reasoning = stripThinking(readContent(record.reasoning_content ?? record.reasoning));
  if (visible) return { visible, reasoningOnly: false };
  return { visible: "", reasoningOnly: reasoning.length > 0 };
}

/** Drop Qwen-style think tags so only the spoken line remains. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/gi, "").trim();
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

/** Keep a duo reply as 黑樱||常态樱. A single speaker stays one line. */
function shapeChatReply(text: string, duoLines: boolean): string {
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (!duoLines) return oneLine(cleaned);
  const barred = cleaned.replace(/\s*[|｜]{2,}\s*/g, "||");
  const fromBars = barred.split("||").map((part) => oneLine(part)).filter(Boolean);
  if (fromBars.length >= 2) return `${fromBars[0]}||${fromBars[1]}`;
  const fromLines = cleaned.split(/\n+/).map((part) => oneLine(part)).filter(Boolean);
  if (fromLines.length >= 2) return `${fromLines[0]}||${fromLines[1]}`;
  const flat = oneLine(cleaned);
  const sentences = flat.split(/(?<=[。！？!?])/).map((part) => part.trim()).filter(Boolean);
  if (sentences.length >= 2) return `${sentences[0]}||${sentences.slice(1).join("")}`;
  return flat;
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
