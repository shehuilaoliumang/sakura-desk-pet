import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSettings } from "../shared/defaults";
import {
  PORTRAIT_EMOTIONS,
  clickTimeline,
  hitZone,
  idleTimeline,
  poseSteps,
  resolveFrame,
  speakTouch,
  workPose,
  workTimeline,
  zonesFor,
} from "../shared/portrait";
import { resolvePack } from "./pack";
import { parseSettings } from "../shared/schema";
import { LLM_FALLBACK_LINE, buildChatSystemPrompt, chatWithLlm, openAiCompatibleChatUrl, type LlmFetch } from "../shared/llm";
import { DISK_JSON_WARNING, judgeSettingsSnapshot, nextDiskReaction, PetRuntime } from "./runtime";
import { POLL_ERROR, pollErrorMessage } from "../shared/pollError";
import { startServer } from "./server";
import type { PublicState, Settings } from "../shared/types";

const appRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sakura-pet-"));
  const runtime = new PetRuntime({ dataDir, appRoot });
  runtime.load();
  const server = await startServer(runtime, 0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const user = { "x-sakura-user": "1" };

  try {
    const health = await call(base, "GET", "/health");
    assert(health.status === 200 && health.json.ok === true, "health");

    let state = await stateOf(base);
    assert(state.sections.config.data.activeForm === "normal", "boot form is the default");
    assert(state.sections.workStatus.data.state === "idle", "boot idle");

    const forbidden = await call(base, "POST", "/pet/work-status", {
      state: "working",
      task: "写一段说明",
      form: "dark",
    });
    assert(forbidden.status === 200, "work-status accepts");
    state = await stateOf(base);
    assert(state.sections.workStatus.data.state === "working", "status changed");
    assert(state.sections.workStatus.data.task === "写一段说明", "task kept");
    assert(state.sections.config.data.activeForm === "normal", "work-status does not switch form");
    assert(state.pets.sakura.anim.data.form === "normal", "anim stays on the current form");
    assert(state.pets.sakura.anim.data.name === "working", "anim follows the status");
    assert(state.pets.sakura.say.data.text.includes("前辈"), "default honorific is spoken");

    const animForm = await call(base, "POST", "/pet/anim", { name: "duo" });
    assert(animForm.status === 400 && animForm.json.reason === "form-switch-forbidden", "anim cannot switch form");
    assert((await stateOf(base)).sections.config.data.activeForm === "normal", "form still normal after anim");

    const noHeader = await call(base, "POST", "/pet/form", { form: "dark" });
    assert(noHeader.status === 403, "form switch is user-only");
    assert((await stateOf(base)).sections.config.data.activeForm === "normal", "missing header did not switch");

    const switched = await call(base, "POST", "/pet/form", { form: "dark" }, user);
    assert(switched.status === 200, "user can switch form");
    state = await stateOf(base);
    assert(state.sections.config.data.activeForm === "dark", "form is dark");
    assert(state.sections.workStatus.data.state === "working", "status survived the form switch");
    assert(!state.pets.sakura.say.data.text.includes("请稍等"), "dark voice replaced the soft line");

    const mirror = await call(base, "POST", "/dsh-pet-7340/work-status", { state: "thinking", task: "对一下接口", form: "duo" });
    assert(mirror.status === 200, "dsh-pet prefix works");
    state = await stateOf(base);
    assert(state.sections.workStatus.data.state === "thinking", "mirror wrote thinking");
    assert(state.sections.config.data.activeForm === "dark", "mirror did not switch form");

    const folded = await call(base, "POST", "/pet/work-status", { state: "organizing", task: "收尾" });
    assert(folded.status === 200 && folded.json.state === "working", "organizing folds into working");
    assert((await stateOf(base)).sections.config.data.activeForm === "dark", "fold keeps form");

    const since = (await stateOf(base)).counter;
    const started = Date.now();
    const pending = call(base, "GET", `/pet/state?since=${since}&timeout=2000`);
    await delay(40);
    await call(base, "POST", "/pet/events", { source: "webhook", event: "waiting", task: "等确认", form: "normal" });
    const polled = await pending;
    assert(polled.status === 200, "long poll returned");
    assert(Date.now() - started < 1500, "long poll woke early");
    const polledState = polled.json as unknown as PublicState;
    assert(polledState.sections.workStatus.data.state === "waiting", "long poll saw waiting");
    assert(polledState.sections.config.data.activeForm === "dark", "event did not switch form");

    const settings = (await call(base, "GET", "/pet/config")).json.settings as Settings;
    const blocked = await call(base, "PUT", "/pet/config", { ...settings, adapters: { ...settings.adapters, codex: false }, activeForm: "normal" });
    assert(blocked.status === 200, "settings saved without the user header");
    state = await stateOf(base);
    assert(state.sections.config.data.activeForm === "dark", "PUT without header ignores activeForm");
    const denied = await call(base, "POST", "/pet/events", { source: "codex", event: "error", task: "不应写入" });
    assert(denied.status === 403 && denied.json.reason === "adapter-disabled", "codex adapter can be turned off");
    assert((await stateOf(base)).sections.workStatus.data.state === "waiting", "rejected event did not change status");

    const named = await call(base, "PUT", "/pet/config", { honorific: "老板", snarkCap: 100, tone: { intensity: 90, politeness: 80 } }, user);
    assert(named.status === 200, "honorific saved");
    await call(base, "POST", "/pet/form", { form: "dark" }, user);
    await call(base, "POST", "/pet/work-status", { state: "error", task: "看上限" });
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.text.includes("别装没看见"), "snark cap lets the sharp line through");
    assert(state.pets.sakura.say.data.text.includes("老板"), "dark still uses the honorific");

    await call(base, "PUT", "/pet/config", { snarkCap: 5, tone: { intensity: 90, politeness: 80 }, darkMayAddressDirectly: true, nickname: "小前" }, user);
    await call(base, "POST", "/pet/work-status", { state: "error", task: "压住" });
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.text.includes("出岔子了"), "snark cap blocks the sharp line");
    assert(!state.pets.sakura.say.data.text.includes("别装没看见"), "sharp line absent");
    await call(base, "POST", "/pet/work-status", { state: "idle" });
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.text.includes("小前"), "direct address uses the nickname");
    assert(!state.pets.sakura.say.data.text.includes("老板"), "direct address drops the honorific");

    await call(base, "PUT", "/pet/config", { tabooWords: ["笨蛋"], darkMayAddressDirectly: false, nickname: "" }, user);
    const said = await call(base, "POST", "/pet/broadcast", { text: "你这个笨蛋呀", durationMs: 0 });
    assert(said.status === 200 && said.json.filtered === true, "taboo is filtered");
    assert(typeof said.json.text === "string" && !said.json.text.includes("笨蛋") && said.json.text.includes("※"), "taboo replaced");
    assert((await stateOf(base)).sections.config.data.activeForm === "dark", "broadcast keeps the form");

    const reserved = await call(base, "POST", "/pet/form", { form: "form4" }, user);
    assert(reserved.status === 409 && reserved.json.reason === "form-disabled", "form 4 stays disabled");

    await call(base, "POST", "/pet/form", { form: "duo" }, user);
    const both = await call(base, "POST", "/pet/broadcast", { text: "别怕。||……嗯。", durationMs: 0 });
    assert(both.status === 200, "duo broadcast");
    state = await stateOf(base);
    assert(state.sections.config.data.activeForm === "duo", "user switched to duo");
    assert(state.pets.sakura.say.data.lines.length === 2, "split speech makes two lines");
    assert(state.pets.sakura.say.data.lines[0]?.speaker === "dark", "dark line first");
    assert(state.pets.sakura.say.data.lines[1]?.speaker === "normal", "soft line second");

    const cleared = await call(base, "DELETE", "/pet/work-status");
    assert(cleared.status === 204, "delete work-status");
    state = await stateOf(base);
    assert(state.sections.workStatus.data.state === "idle", "cleared to idle");
    assert(state.sections.config.data.activeForm === "duo", "clear keeps the form");

    const settingsBytes = fs.readFileSync(path.join(dataDir, "settings.json"));
    assert(settingsBytes[0] === 0x7b, "settings.json starts with '{' (UTF-8, not a UTF-16 BOM)");
    assert(settingsBytes.includes(Buffer.from("笨蛋", "utf8")), "taboo stored as UTF-8 bytes");
    const reloaded = JSON.parse(settingsBytes.toString("utf8")) as Settings;
    assert(reloaded.honorific === "老板", "honorific persisted");
    assert(reloaded.tabooWords.includes("笨蛋"), "taboo persisted");

    const utfDir = fs.mkdtempSync(path.join(os.tmpdir(), "sakura-pet-utf8-"));
    const utfRuntime = new PetRuntime({ dataDir: utfDir, appRoot });
    utfRuntime.load();
    const utfBytes = fs.readFileSync(utfRuntime.settingsPath);
    assert(utfBytes.includes(Buffer.from("常态樱", "utf8")), "default displayName is UTF-8");
    assert(utfBytes.includes(Buffer.from("前辈", "utf8")), "default honorific is UTF-8");
    assert(utfRuntime.settings.forms.normal.displayName === "常态樱", "default displayName is 常态樱");
    assert(utfRuntime.settings.honorific === "前辈", "default honorific is 前辈");
    utfRuntime.dispose();

    const utf16Dir = fs.mkdtempSync(path.join(os.tmpdir(), "sakura-pet-utf16-"));
    const utf16Body = Buffer.from(JSON.stringify({ honorific: "前辈", schemaVersion: 1 }), "utf16le");
    fs.writeFileSync(path.join(utf16Dir, "settings.json"), Buffer.concat([Buffer.from([0xff, 0xfe]), utf16Body]));
    const utf16Runtime = new PetRuntime({ dataDir: utf16Dir, appRoot });
    utf16Runtime.load();
    assert(utf16Runtime.settings.forms.normal.displayName === "常态樱", "UTF-16 settings fall back to defaults");
    assert(Boolean(utf16Runtime.warning?.includes("UTF-8")), "UTF-16 file is reported");
    utf16Runtime.dispose();
    fs.rmSync(utfDir, { recursive: true, force: true });
    fs.rmSync(utf16Dir, { recursive: true, force: true });

    const bootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sakura-pet-boot-"));
    fs.writeFileSync(
      path.join(bootDir, "settings.json"),
      JSON.stringify({ honorific: "老板", defaultForm: "duo", activeForm: "dark", schemaVersion: 1 }),
      { encoding: "utf8" },
    );
    const boot = new PetRuntime({ dataDir: bootDir, appRoot });
    boot.load();
    assert(boot.settings.honorific === "老板", "partial file keeps the honorific");
    assert(boot.settings.defaultForm === "duo", "partial file keeps the default form");
    assert(boot.settings.activeForm === "duo", "boot uses the default form, not the stale active form");
    boot.dispose();

    await checkLlm(base, user, appRoot);
    await checkReasoningReply();
    await checkDuoPartnerRetry();
    await checkPortrait(base, appRoot);
    checkSwitchFalseAlarms();

    console.log("sakura-pet selfcheck ok");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    runtime.dispose();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function stateOf(base: string): Promise<PublicState> {
  const result = await call(base, "GET", "/pet/state");
  assert(result.status === 200, "state endpoint");
  return result.json as unknown as PublicState;
}

async function call(
  base: string,
  method: string,
  pathname: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  if (response.status === 204) return { status: 204, json: {} };
  const json = (await response.json()) as Record<string, unknown>;
  return { status: response.status, json };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** LLM calls are mocked. Work-status must not touch the mock. */
async function checkLlm(base: string, user: Record<string, string>, root: string): Promise<void> {
  const secret = "unit-test-key";
  const fresh = (await call(base, "GET", "/pet/config")).json.settings as Settings;
  assert(fresh.llm.enabled === false, "llm defaults off");
  assert(fresh.llm.provider === "openai-compatible", "default llm provider");
  assert(fresh.llm.apiKey === "", "llm key defaults empty");
  assert(fresh.llm.baseUrl === "", "llm base url defaults empty");
  assert(fresh.theme === "warm", "default theme is warm");
  assert(openAiCompatibleChatUrl("https://llm.invalid/v1") === "https://llm.invalid/v1/chat/completions", "v1 base joins chat completions");
  assert(openAiCompatibleChatUrl("https://llm.invalid/v1/") === "https://llm.invalid/v1/chat/completions", "trailing slash is stripped");
  assert(openAiCompatibleChatUrl("https://llm.invalid") === "https://llm.invalid/v1/chat/completions", "host gets /v1/chat/completions");
  assert(openAiCompatibleChatUrl("https://llm.invalid/v1/chat/completions") === "https://llm.invalid/v1/chat/completions", "full path is kept");
  const prompt = buildChatSystemPrompt(fresh);
  assert(prompt.includes("老板"), "chat prompt keeps the honorific");
  assert(prompt.includes("黑樱"), "chat prompt keeps the active form");
  assert(prompt.includes("||"), "duo chat asks both voices for a line");
  assert(prompt.includes("都是对用户说的"), "duo lines both address the user");
  assert(prompt.includes("称呼用户为「老板」"), "both lines use the configured honorific");
  assert(prompt.includes("不要互相接话") && prompt.includes("不要互相点评"), "duo lines must not talk to each other");
  assert(prompt.includes("不要介绍对方") && prompt.includes("不要评价对方"), "duo lines must not describe each other");
  assert(prompt.includes("不要出现「黑樱」") && prompt.includes("不要出现「常态樱」"), "duo lines forbid each other's names");
  assert(!prompt.includes("一句附和"), "duo prompt does not ask for an echo");

  const realFetch = globalThis.fetch;
  let externalCalls = 0;
  let lastUrl = "";
  let sawBearer = false;
  let sawModel = false;
  let sawPrompt = false;
  let mode: "ok" | "http" | "taboo" | "vision" | "duo" | "duo-nl" = "ok";
  let lastSystem = "";
  let sawImage = false;
  let sawReasoningEffort: unknown;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return realFetch(input, init);
    externalCalls += 1;
    lastUrl = url;
    const headers = new Headers(init?.headers);
    sawBearer = headers.get("authorization") === `Bearer ${secret}`;
    if (mode === "http") {
      return new Response(JSON.stringify({ error: { message: `rejected ${secret}` } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    if (mode === "vision") {
      return new Response(JSON.stringify({ error: { message: "image input is not supported" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { model?: string; messages?: { role: string; content: unknown }[]; reasoning_effort?: unknown } : {};
    sawModel = body.model === "gpt-4o-mini";
    sawReasoningEffort = body.reasoning_effort;
    const systemRaw = body.messages?.find((item) => item.role === "system")?.content;
    const system = typeof systemRaw === "string" ? systemRaw : "";
    if (system) {
      sawPrompt = system.includes("老板") && system.includes("黑樱");
      lastSystem = system;
    }
    const userRaw = body.messages?.find((item) => item.role === "user")?.content;
    if (Array.isArray(userRaw)) {
      sawImage = userRaw.some((part) => !!part && typeof part === "object" && (part as { type?: string }).type === "image_url");
    }
    const content = mode === "taboo"
      ? "你这个笨蛋"
      : mode === "duo"
        ? "别怕。||……嗯。"
        : mode === "duo-nl"
          ? "别怕呀。\n……好。"
          : "在的，老板。";
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const idle = await stateOf(base);
    const callsAtIdle = externalCalls;
    await call(base, "POST", "/pet/work-status", { state: "thinking", task: "不要问模型" });
    let state = await stateOf(base);
    assert(externalCalls === callsAtIdle, "work-status does not call the llm");
    assert(state.pets.sakura.say.data.origin === "persona", "status line stays on the template pool");
    assert(state.pets.sakura.say.data.text.includes("老板"), "template still uses the honorific");
    assert(!state.pets.sakura.say.data.text.includes(LLM_FALLBACK_LINE), "template is not the llm fallback");
    const workCounter = state.sections.workStatus.counter;

    const denied = await call(base, "POST", "/pet/llm/chat", { message: "在吗" });
    assert(denied.status === 403 && denied.json.reason === "user-only", "llm chat is user-only");
    const empty = await call(base, "POST", "/pet/llm/chat", { message: "  " }, user);
    assert(empty.status === 400 && empty.json.reason === "empty-text", "empty chat is rejected");

    const quiet = await call(base, "POST", "/pet/llm/chat", { message: "在吗" }, user);
    assert(quiet.status === 200 && quiet.json.ok === false, "disabled llm does not pretend to succeed");
    assert(quiet.json.source === "fallback" && quiet.json.reason === "disabled", "disabled llm reports why");
    assert(quiet.json.text === LLM_FALLBACK_LINE, "disabled llm speaks the local line");
    assert(externalCalls === callsAtIdle, "disabled llm does not call out");
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.text === LLM_FALLBACK_LINE, "fallback line is on the bubble");
    assert(state.sections.workStatus.counter === workCounter, "fallback chat does not change work status");
    assert(state.sections.workStatus.data.state === "thinking", "work state survived the fallback line");

    const saved = await call(base, "PUT", "/pet/config", {
      llm: {
        enabled: true,
        provider: "openai-compatible",
        baseUrl: "https://llm.invalid/v1",
        apiKey: secret,
        model: "",
        timeoutMs: 1000,
      },
    }, user);
    assert(saved.status === 200, "llm settings saved");
    const stored = (saved.json.settings as Settings).llm;
    assert(stored.enabled === true && stored.baseUrl === "https://llm.invalid/v1", "llm settings round-trip");
    assert(stored.apiKey === secret, "llm key stored locally");

    const callsBeforeStatus = externalCalls;
    await call(base, "POST", "/pet/work-status", { state: "working", task: "仍然用短句" });
    state = await stateOf(base);
    assert(externalCalls === callsBeforeStatus, "enabled llm still stays out of work-status");
    assert(state.pets.sakura.say.data.origin === "persona", "enabled llm does not replace status lines");
    assert(state.sections.config.data.activeForm === "duo", "llm settings do not switch form");
    assert(!state.pets.sakura.say.data.text.includes("在的，老板"), "status text is not an llm line");
    const workAfter = state.sections.workStatus.counter;

    const spoken = await call(base, "POST", "/pet/llm/chat", { message: "在吗" }, user);
    assert(spoken.status === 200 && spoken.json.ok === true && spoken.json.source === "llm", "chat uses the provider");
    assert(sawModel, "empty model falls back to gpt-4o-mini");
    assert(sawPrompt, "outbound system prompt has the honorific and the form");
    assert(spoken.json.text === "在的，老板。", "chat bubble is the assistant line");
    assert(lastUrl === "https://llm.invalid/v1/chat/completions", "chat posts to chat completions");
    assert(sawBearer, "chat sends the bearer token");
    assert(externalCalls === callsBeforeStatus + 1, "chat makes one provider call");
    assert(sawReasoningEffort === undefined, "a cloud model does not get reasoning_effort");
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.text === "在的，老板。", "pet shows the assistant line");
    assert(state.pets.sakura.say.data.origin === "broadcast", "chat line is not a status template");
    assert(state.sections.workStatus.counter === workAfter, "chat does not change work status");
    assert(state.sections.workStatus.data.state === "working", "work state survived the chat");

    await call(base, "POST", "/pet/work-status", { state: "idle", task: "" });
    state = await stateOf(base);
    assert(externalCalls === callsBeforeStatus + 1, "returning to a status does not call the llm");
    assert(state.pets.sakura.say.data.origin === "persona", "status template returns after chat");
    assert(state.pets.sakura.say.data.text !== "在的，老板。", "status template replaced the chat line");
    const templateAfter = state.pets.sakura.say.data.text;

    const probe = await call(base, "POST", "/pet/llm/test", {}, user);
    assert(probe.status === 200 && probe.json.ok === true && probe.json.detail === "连上了。", "test connection reports success");
    assert(externalCalls === callsBeforeStatus + 2, "test connection calls the provider");
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.text === templateAfter, "test connection does not change the bubble");

    mode = "http";
    const failed = await call(base, "POST", "/pet/llm/test", {}, user);
    assert(failed.status === 200 && failed.json.ok === false && failed.json.reason === "http", "http error is a failed test");
    const detail = String(failed.json.detail ?? "");
    assert(!detail.includes(secret), "error detail redacts the key");
    assert(detail.includes("500"), "error detail keeps the status");
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.text === templateAfter, "failed test does not change the bubble");

    mode = "taboo";
    const censored = await call(base, "POST", "/pet/llm/chat", { message: "说一个不该说的词" }, user);
    assert(censored.status === 200 && censored.json.filtered === true, "chat runs the taboo filter");
    assert(typeof censored.json.text === "string" && !censored.json.text.includes("笨蛋") && censored.json.text.includes("※"), "taboo word removed from the chat line");
    assert(externalCalls === callsBeforeStatus + 4, "taboo chat still uses the provider");

    await call(base, "PUT", "/pet/config", { llm: { apiKey: "" } }, user);
    const missing = await call(base, "POST", "/pet/llm/chat", { message: "在吗" }, user);
    assert(missing.json.reason === "missing-key" && missing.json.text === LLM_FALLBACK_LINE, "missing key uses the local line");
    const callsAfterMissing = externalCalls;
    assert(callsAfterMissing === callsBeforeStatus + 4, "missing key does not call out");

    await call(base, "PUT", "/pet/config", { llm: { apiKey: secret, baseUrl: "file:///tmp/sakura-key" } }, user);
    const badUrl = await call(base, "POST", "/pet/llm/chat", { message: "在吗" }, user);
    assert(badUrl.json.reason === "bad-base-url", "non-http base url is refused");
    assert(externalCalls === callsAfterMissing, "bad base url does not call out");

    await call(base, "PUT", "/pet/config", { llm: { baseUrl: "https://user:secret@llm.invalid/v1" } }, user);
    const userinfo = await call(base, "POST", "/pet/llm/chat", { message: "在吗" }, user);
    assert(userinfo.json.reason === "bad-base-url", "credentials in the base url are refused");
    assert(externalCalls === callsAfterMissing, "userinfo url does not call out");

    await call(base, "PUT", "/pet/config", { llm: { provider: "not-a-provider", baseUrl: "https://llm.invalid/v1" } }, user);
    const unknown = await call(base, "POST", "/pet/llm/chat", { message: "在吗" }, user);
    assert(unknown.json.reason === "unknown-provider", "unknown provider is refused");
    assert(externalCalls === callsAfterMissing, "unknown provider does not call out");

    await call(base, "PUT", "/pet/config", {
      llm: { enabled: true, provider: "openai-compatible", baseUrl: "https://llm.invalid/v1", apiKey: secret, model: "", timeoutMs: 1000 },
    }, user);
    mode = "ok";
    const beforeImage = (await stateOf(base)).pets.sakura.say.data.text;
    const pictured = await call(base, "POST", "/pet/llm/chat", { message: "看这张", image: "data:image/png;base64,aaaa" }, user);
    assert(pictured.status === 200 && pictured.json.ok === true, "image chat is sent to the provider");
    assert(sawImage, "image is attached as an image_url part");
    const afterImage = (await stateOf(base)).pets.sakura.say.data.text;
    assert(afterImage === "在的，老板。", "a supported image still speaks one line");
    mode = "vision";
    const refused = await call(base, "POST", "/pet/llm/chat", { message: "再看一张", image: "data:image/png;base64,aaaa" }, user);
    assert(refused.json.ok === false && refused.json.reason === "vision-unsupported", "unsupported vision is reported");
    assert(String(refused.json.detail ?? "").includes("不支持图片"), "vision failure is explained in Chinese");
    assert((await stateOf(base)).pets.sakura.say.data.text === afterImage, "a rejected image does not replace the bubble");
    const callsAfterImage = externalCalls;
    const badImage = await call(base, "POST", "/pet/llm/chat", { message: "外链", image: "https://example.test/a.png" }, user);
    assert(badImage.json.reason === "bad-image", "remote image urls are refused");
    assert(externalCalls === callsAfterImage, "a bad image does not call out");
    assert(beforeImage !== undefined, "bubble existed before the image");

    const named = await call(base, "PUT", "/pet/config", { llm: { provider: "openai-compatible", model: "深求" } }, user);
    assert(named.status === 200 && (named.json.settings as Settings).llm.model === "深求", "model name kept");
    const paths = named.json.paths as { settingsPath?: string };
    assert(typeof paths.settingsPath === "string", "settings path reported");
    const settingsBytes = fs.readFileSync(paths.settingsPath ?? "");
    assert(settingsBytes[0] === 0x7b, "llm settings stay UTF-8");
    assert(settingsBytes.includes(Buffer.from("深求", "utf8")), "model name stored as UTF-8");
    assert(settingsBytes.includes(Buffer.from(secret)), "key stays in the local file");
    assert(idle.sections.config.data.activeForm === "duo", "llm checks started from duo");

    mode = "duo";
    const paired = await call(base, "POST", "/pet/llm/chat", { message: "两个人都在吗" }, user);
    assert(paired.status === 200 && paired.json.ok === true, "duo chat succeeds");
    state = await stateOf(base);
    const pairedLines = state.pets.sakura.say.data.lines;
    assert(pairedLines.length === 2, "duo chat keeps two bubbles");
    assert(pairedLines[0]?.speaker === "dark" && pairedLines[0]?.text === "别怕。", "dark bubble is the first line");
    assert(pairedLines[1]?.speaker === "normal" && pairedLines[1]?.text === "……嗯。", "normal bubble is the second line");
    assert(lastSystem.includes("||"), "the live duo prompt asks for both lines");
    assert(lastSystem.includes("都是对用户说的") && lastSystem.includes("不要互相接话"), "the live duo prompt keeps both lines aimed at the user");
    assert(lastSystem.includes("不要介绍对方") && lastSystem.includes("不要出现「黑樱」"), "the live duo prompt forbids introducing the other voice");
    assert(state.pets.sakura.say.data.origin === "broadcast", "duo chat is not a status template");

    mode = "duo-nl";
    const wrapped = await call(base, "POST", "/pet/llm/chat", { message: "换行也要两句" }, user);
    assert(wrapped.json.ok === true, "a newline duo reply is accepted");
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.lines[0]?.speaker === "dark" && state.pets.sakura.say.data.lines[0]?.text === "别怕呀。", "a newline still feeds the dark bubble");
    assert(state.pets.sakura.say.data.lines[1]?.speaker === "normal" && state.pets.sakura.say.data.lines[1]?.text === "……好。", "a newline still feeds the normal bubble");

    await call(base, "PUT", "/pet/config", { duoVoice: { dualBubble: false, darkShare: 30 } }, user);
    mode = "ok";
    const softer = await call(base, "POST", "/pet/llm/chat", { message: "只留一句" }, user);
    assert(softer.json.ok === true && softer.json.text === "在的，老板。", "a single bubble still speaks one line");
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.lines.length === 1 && state.pets.sakura.say.data.lines[0]?.speaker === "normal", "the softer share gives the line to 常态樱");
    assert(lastSystem.includes("只说一句"), "a single bubble asks for one line");
    assert(!lastSystem.includes("||"), "a single bubble does not ask for a split");

    await call(base, "PUT", "/pet/config", { duoVoice: { darkShare: 80 } }, user);
    const harder = await call(base, "POST", "/pet/llm/chat", { message: "只留黑樱" }, user);
    assert(harder.json.text === "在的，老板。", "the darker share still speaks one line");
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.lines.length === 1 && state.pets.sakura.say.data.lines[0]?.speaker === "dark", "the darker share gives the line to 黑樱");
    await call(base, "PUT", "/pet/config", { duoVoice: { dualBubble: true, darkShare: 70 } }, user);
  } finally {
    globalThis.fetch = realFetch;
  }

  const partialDir = fs.mkdtempSync(path.join(os.tmpdir(), "sakura-pet-llm-"));
  fs.writeFileSync(path.join(partialDir, "settings.json"), JSON.stringify({ schemaVersion: 1, honorific: "前辈" }), { encoding: "utf8" });
  const partial = new PetRuntime({ dataDir: partialDir, appRoot: root });
  partial.load();
  assert(partial.settings.llm.enabled === false, "old settings file keeps llm off");
  assert(partial.settings.theme === "warm", "old settings file keeps the warm theme");
  const glass = await call(base, "PUT", "/pet/config", { theme: "glass" }, user);
  assert(glass.status === 200 && (glass.json.settings as Settings).theme === "glass", "glass theme persists");
  const unknown = await call(base, "PUT", "/pet/config", { theme: "neon" }, user);
  assert((unknown.json.settings as Settings).theme === "glass", "unknown theme is ignored");
  const warmed = await call(base, "PUT", "/pet/config", { theme: "warm" }, user);
  assert((warmed.json.settings as Settings).theme === "warm", "warm theme can be restored");
  assert(partial.settings.llm.provider === "openai-compatible", "old settings file gets the default provider");
  assert(partial.settings.llm.apiKey === "", "old settings file does not invent a key");
  assert(partial.settings.llm.reasoningEffort === "auto", "old settings file skips reasoning by default");
  assert(partial.settings.honorific === "前辈", "old settings file keeps the honorific");
  partial.dispose();
  fs.rmSync(partialDir, { recursive: true, force: true });
}

async function checkReasoningReply(): Promise<void> {
  const settings = defaultSettings();
  settings.llm.enabled = true;
  settings.llm.baseUrl = "http://127.0.0.1:12345/v1";
  settings.llm.apiKey = "local-placeholder";
  settings.llm.model = "qwen3.5-9b";
  const thinking = "先在心里想了很久，这段不该出现在气泡里。";

  const budgets: number[] = [];
  const efforts: unknown[] = [];
  let round = 0;
  const retrying: LlmFetch = async (_url, init) => {
    const body = JSON.parse(init.body) as { max_tokens?: number; reasoning_effort?: unknown };
    budgets.push(body.max_tokens ?? 0);
    efforts.push(body.reasoning_effort);
    round += 1;
    const message = round === 1
      ? { content: "", reasoning_content: thinking }
      : { content: `<think>${thinking}</think>在的，前辈。`, reasoning_content: thinking };
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message }] }) };
  };
  const spoken = await chatWithLlm(settings, "在吗", retrying);
  assert(budgets[0] === 2048 && budgets[1] === 4096, "a thinking reply gets one larger retry");
  assert(efforts[0] === "none" && efforts[1] === "none", "local Qwen asks the model not to think");
  assert(spoken.ok && spoken.text === "在的，前辈。", "the bubble uses the final content");
  assert(!spoken.text.includes("不该出现"), "reasoning is not spoken");

  let both = 0;
  const together: LlmFetch = async () => {
    both += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "好的。", reasoning_content: thinking } }],
      }),
    };
  };
  const direct = await chatWithLlm(settings, "在吗", together);
  assert(both === 1 && direct.ok && direct.text === "好的。", "content wins and skips the retry");

  let stuck = 0;
  const reasoningOnly: LlmFetch = async () => {
    stuck += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: null, reasoning_content: thinking } }] }),
    };
  };
  const quiet = await chatWithLlm(settings, "在吗", reasoningOnly);
  assert(stuck === 2 && !quiet.ok && quiet.text === LLM_FALLBACK_LINE, "reasoning without a line stays on the short fallback");
  assert(!quiet.detail.includes("不该出现"), "the failure detail does not paste the thinking");
  assert(quiet.detail.includes("思考"), "the failure says the model only thought");

  settings.llm.reasoningEffort = "none";
  settings.llm.baseUrl = "https://api.openai.com/v1";
  settings.llm.model = "gpt-4o-mini";
  assert(await effortOf(settings) === "none", "直接说短句 always sends reasoning_effort none");
  settings.llm.reasoningEffort = "off";
  assert(await effortOf(settings) === undefined, "允许思考 omits reasoning_effort");
  settings.llm.reasoningEffort = "auto";
  assert(await effortOf(settings) === undefined, "auto leaves cloud models alone");
  settings.llm.model = "qwen3.5-9b";
  assert(await effortOf(settings) === "none", "auto still skips thinking for Qwen");
  settings.llm.baseUrl = "http://localhost:11434/v1";
  settings.llm.model = "llama";
  assert(await effortOf(settings) === "none", "auto skips thinking on loopback");

  const kept = parseSettings({ llm: { reasoningEffort: "none" } });
  assert(kept.ok && kept.settings.llm.reasoningEffort === "none", "reasoning effort persists");
  const ignored = parseSettings({ llm: { reasoningEffort: "high" } });
  assert(ignored.ok && ignored.settings.llm.reasoningEffort === "auto", "unknown reasoning effort stays auto");
}

async function checkDuoPartnerRetry(): Promise<void> {
  const settings = defaultSettings();
  settings.activeForm = "duo";
  settings.darkMayAddressDirectly = true;
  settings.honorific = "前辈";
  settings.llm.enabled = true;
  settings.llm.baseUrl = "http://127.0.0.1:12345/v1";
  settings.llm.apiKey = "local-placeholder";
  settings.llm.model = "qwen3.5-9b";
  settings.llm.reasoningEffort = "off";

  let calls = 0;
  const named = await chatWithLlm(settings, "下午好", async () => {
    calls += 1;
    const content = calls === 1
      ? "下午好啊。||下午好，前辈！黑樱她平时虽然嘴硬心软，但其实是世界上最温柔的人呢。"
      : "下午好啊。||下午好，前辈。";
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
  });
  assert(calls === 2, "naming the other voice asks once more");
  assert(named.ok && named.text === "下午好啊。||下午好，前辈。", "the retry drops the other voice");
  assert(!named.text.includes("黑樱"), "the spoken lines do not name 黑樱");

  let cleanCalls = 0;
  const clean = await chatWithLlm(settings, "今天还顺利吗", async () => {
    cleanCalls += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "别用那种语调问我。||前辈辛苦了，今天还算顺利。" } }],
      }),
    };
  });
  assert(cleanCalls === 1 && clean.ok && clean.text.includes("前辈"), "addressing the user does not retry");
  assert(!clean.text.includes("黑樱") && !clean.text.includes("常态樱"), "a clean pair names nobody else");

  let guardCalls = 0;
  const guarding = await chatWithLlm(settings, "在吗", async () => {
    guardCalls += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "我会保护你。||在的，前辈。" } }],
      }),
    };
  });
  assert(guardCalls === 1 && guarding.ok && guarding.text.includes("前辈"), "protecting the user is not treated as mentioning the other voice");
}

async function effortOf(settings: ReturnType<typeof defaultSettings>): Promise<unknown> {
  let effort: unknown = "missing";
  const result = await chatWithLlm(settings, "在吗", async (_url, init) => {
    effort = (JSON.parse(init.body) as { reasoning_effort?: unknown }).reasoning_effort;
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "你好呀" } }] }) };
  });
  assert(result.ok && result.text === "你好呀", "a short content line is spoken");
  return effort;
}

function checkSwitchFalseAlarms(): void {
  const memory = `${JSON.stringify({ schemaVersion: 1 }, null, 2)}\n`;
  assert(judgeSettingsSnapshot("", memory) === "torn", "an empty settings read is torn");
  assert(judgeSettingsSnapshot("{\n  \"schemaVersion\": 1,", memory) === "torn", "a cut-off settings write is torn");
  assert(judgeSettingsSnapshot(memory, memory) === "same", "the finished settings file matches memory");
  const edited = `${JSON.stringify({ schemaVersion: 1, honorific: "老板" }, null, 2)}\n`;
  assert(judgeSettingsSnapshot(edited, memory) === "apply", "a complete settings edit is applied");

  const duringWrite = nextDiskReaction({ kind: "torn", streak: 0, ownWrite: true, warning: null });
  assert(duringWrite.warning === null && duringWrite.streak === 0, "a form switch does not warn on its own replace");
  const once = nextDiskReaction({ kind: "torn", streak: 0, ownWrite: false, warning: null });
  const twice = nextDiskReaction({ kind: "torn", streak: once.streak, ownWrite: false, warning: once.warning });
  assert(twice.warning === null, "two torn settings reads stay quiet");
  const stuck = nextDiskReaction({ kind: "torn", streak: twice.streak, ownWrite: false, warning: twice.warning });
  assert(stuck.warning === DISK_JSON_WARNING, "a settings file that stays unreadable is reported");
  const restored = nextDiskReaction({ kind: "same", streak: stuck.streak, ownWrite: false, warning: stuck.warning });
  assert(restored.warning === null && restored.streak === 0, "the finished file clears the false JSON warning");

  assert(pollErrorMessage(true, 1, false) === null, "one dropped poll while the figure is up stays quiet");
  assert(pollErrorMessage(true, 1, true) === null, "an aborted poll stays quiet");
  assert(pollErrorMessage(true, 2, false) === POLL_ERROR, "a poll that keeps failing is shown");
  assert(pollErrorMessage(false, 1, false) === POLL_ERROR, "boot still reports a dead API");

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sakura-switch-"));
  const runtime = new PetRuntime({ dataDir, appRoot });
  runtime.load();
  runtime.setForm("duo");
  runtime.acceptDiskText("");
  runtime.acceptDiskText("{");
  assert(runtime.warning === null, "switching form does not surface a torn settings read");
  assert(runtime.settings.activeForm === "duo", "the form switch survives the torn read");
  runtime.acceptDiskText(fs.readFileSync(runtime.settingsPath, "utf8"));
  assert(runtime.warning === null, "the written settings file leaves no warning");
  runtime.dispose();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

async function checkPortrait(base: string, root: string): Promise<void> {
  const pack = resolvePack(path.join(root, "packs", "sakura"));
  const before = await stateOf(base);
  for (const form of ["normal", "dark", "duo"] as const) {
    const library = pack.forms[form].library;
    assert((library.idle?.length ?? 0) >= 2, `${form} idle still has open and blink`);
    assert((library.click?.length ?? 0) >= 1, `${form} keeps the blush click frame`);
    assert(!library.happy, `${form} 喜 reuses click instead of a new folder`);
    for (const name of ["angry", "sad", "joyful"] as const) {
      assert((library[name]?.length ?? 0) >= 2, `${form} ${name} has an expression and a moved frame`);
    }
    const zones = zonesFor(form);
    for (const emotion of PORTRAIT_EMOTIONS) {
      assert(zones.some((zone) => zone.emotion === emotion), `${form} can play ${emotion}`);
    }
    for (const zone of zones) {
      const hit = hitZone(form, zone.x + zone.w / 2, zone.y + zone.h / 2);
      assert(hit?.id === zone.id, `${form} ${zone.id} center hit ${hit?.id ?? "nothing"}`);
      const spoken = speakTouch(defaultSettings(), zone, 0);
      assert(spoken.lines.length >= 1, `${form} ${zone.id} speaks`);
      assert(spoken.text.includes("前辈"), `${form} ${zone.id} addresses 前辈`);
      assert(!spoken.text.includes("黑樱") && !spoken.text.includes("常态樱") && !spoken.text.includes("她"), `${form} ${zone.id} does not name the other voice`);
      const again = speakTouch(defaultSettings(), zone, 1);
      const pool = zone.lines[zone.primary] ?? [];
      if (pool.length > 1) assert(again.text !== spoken.text, `${form} ${zone.id} rotates lines`);
    }
    const idle = idleTimeline("idle");
    assert(idle.repeatFrom === 0, `${form} idle loops`);
    assert(idle.steps.some((step) => step.clip === "idle" && step.index === 1), `${form} idle blinks`);
    assert(idle.steps.some((step) => step.y !== 0 || step.scale !== 1), `${form} idle breathes`);
  }
  assert((pack.forms.duo.library["sad-dark"]?.length ?? 0) >= 2, "duo can drop 黑樱's gaze on her own");

  const duoZones = zonesFor("duo");
  assert(duoZones.some((zone) => zone.primary === "dark" && zone.speakers.length === 1), "duo can address from 黑樱 alone");
  assert(duoZones.some((zone) => zone.primary === "normal" && zone.speakers.length === 1), "duo can address from 常态樱 alone");
  assert(duoZones.some((zone) => zone.speakers.length === 2), "duo shared zones can use both bubbles");
  const cheek = duoZones.find((zone) => zone.id === "cheek");
  assert(cheek?.primary === "normal" && cheek.speakers.includes("dark"), "cheek click is 常态樱's face, with 黑樱 also answering the user");
  const hair = duoZones.find((zone) => zone.id === "dark-hair");
  assert(hair?.primary === "dark" && hair.emotion === "angry", "duo hair click is 黑樱");

  assert(hitZone("normal", 0.02, 0.02) === null, "clicks in the empty margin do nothing");
  assert(hitZone("form4", 0.5, 0.5) === null, "reserved slots have no click zones");
  const duoRest = hitZone("duo", 0.92, 0.94);
  assert(duoRest?.id === "rest-normal" && duoRest.primary === "normal", "the right side of duo falls to 常态樱");
  const duoLeft = hitZone("duo", 0.06, 0.94);
  assert(duoLeft?.id === "rest-dark" && duoLeft.primary === "dark", "the left side of duo falls to 黑樱");

  const settings = defaultSettings();
  settings.darkMayAddressDirectly = true;
  settings.nickname = "小前";
  const darkFace = hitZone("dark", 0.55, 0.26);
  assert(darkFace?.id === "face", "dark face zone");
  const direct = speakTouch(settings, darkFace!, 0);
  assert(direct.text.includes("小前") && !direct.text.includes("前辈"), "dark click can use the nickname");
  settings.tabooWords = ["苹果"];
  settings.darkMayAddressDirectly = false;
  const apple = zonesFor("normal").find((zone) => zone.id === "apple");
  const censored = speakTouch(settings, apple!, 0);
  assert(censored.filtered && censored.text.includes("※") && !censored.text.includes("苹果"), "click lines still pass through taboo");

  const normalLib = pack.forms.normal.library;
  const happy = clickTimeline("click", "nod");
  const happyUrls = happy.steps.map((step) => resolveFrame(normalLib, step));
  assert(happyUrls.includes(normalLib.click?.[0] ?? ""), "喜 shows the existing blush frame");
  assert(happyUrls.includes(normalLib.idle?.[1] ?? ""), "喜 also blinks");
  assert(new Set(happyUrls).size >= 2, "喜 is more than one still");
  assert(poseSteps("click", "nod").some((step) => step.rot !== 0), "喜 nods");
  const angry = poseSteps("angry", "shake");
  assert(angry.some((step) => step.clip === "angry" && step.index === 0), "怒 uses the angry face");
  assert(angry.some((step) => step.clip === "angry" && step.index === 1), "怒 steps to the shifted frame");
  assert(angry.some((step) => step.x !== 0), "怒 shakes");
  assert(poseSteps("sad", "droop").some((step) => step.y > 0 && step.clip === "sad"), "哀 droops on the sad face");
  assert(poseSteps("joyful", "bounce").some((step) => step.clip === "joyful" && (step.y < 0 || step.scale > 1)), "乐 bounces");
  const settled = workTimeline("angry", "shake");
  assert(settled.repeatFrom != null && settled.repeatFrom > 0, "a work emotion keeps breathing after the gesture");
  assert(workPose("normal", "success", 70)?.emotion === "happy", "success plays 喜");
  assert(workPose("normal", "error", 70)?.emotion === "sad", "normal error plays 哀");
  assert(workPose("dark", "error", 70)?.emotion === "angry", "dark error plays 怒");
  assert(workPose("duo", "error", 70)?.clip === "angry", "duo error follows 黑樱 when she has the larger share");
  assert(workPose("duo", "error", 40)?.clip === "sad", "duo error follows 常态樱 when her share is larger");
  assert(workPose("normal", "idle", 70) === null, "idle stays on blink and breath");
  assert(workPose("form4", "success", 70) === null, "reserved slots do not invent a portrait");

  const files = [
    "normal/idle/01.png",
    "normal/idle/02.png",
    "normal/click/01.png",
    "normal/angry/01.png",
    "normal/sad/01.png",
    "normal/joyful/02.png",
    "dark/angry/01.png",
    "dark/sad/01.png",
    "dark/joyful/01.png",
    "duo/angry/01.png",
    "duo/sad/01.png",
    "duo/sad-dark/01.png",
    "duo/joyful/01.png",
  ];
  for (const file of files) {
    const response = await fetch(`${base}/pet/media/${file}`);
    assert(response.status === 200, `${file} is served`);
    assert(response.headers.get("content-type")?.includes("png"), `${file} is a png`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes[0] === 0x89 && bytes[1] === 0x50, `${file} has a png header`);
  }
  const after = await stateOf(base);
  assert(after.sections.workStatus.data.state === before.sections.workStatus.data.state, "reading portrait frames does not change work status");
  assert(after.sections.config.data.activeForm === before.sections.config.data.activeForm, "reading portrait frames does not change form");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
