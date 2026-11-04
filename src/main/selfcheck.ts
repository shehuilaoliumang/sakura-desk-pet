import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LLM_FALLBACK_LINE, buildChatSystemPrompt, openAiCompatibleChatUrl } from "../shared/llm";
import { PetRuntime } from "./runtime";
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

  const realFetch = globalThis.fetch;
  let externalCalls = 0;
  let lastUrl = "";
  let sawBearer = false;
  let sawModel = false;
  let sawPrompt = false;
  let mode: "ok" | "http" | "taboo" = "ok";
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
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { model?: string; messages?: { role: string; content: string }[] } : {};
    sawModel = body.model === "gpt-4o-mini";
    const system = body.messages?.find((item) => item.role === "system")?.content ?? "";
    if (system) sawPrompt = system.includes("老板") && system.includes("黑樱");
    const content = mode === "taboo" ? "你这个笨蛋" : "在的，老板。";
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

    const named = await call(base, "PUT", "/pet/config", { llm: { provider: "openai-compatible", model: "深求" } }, user);
    assert(named.status === 200 && (named.json.settings as Settings).llm.model === "深求", "model name kept");
    const paths = named.json.paths as { settingsPath?: string };
    assert(typeof paths.settingsPath === "string", "settings path reported");
    const settingsBytes = fs.readFileSync(paths.settingsPath ?? "");
    assert(settingsBytes[0] === 0x7b, "llm settings stay UTF-8");
    assert(settingsBytes.includes(Buffer.from("深求", "utf8")), "model name stored as UTF-8");
    assert(settingsBytes.includes(Buffer.from(secret)), "key stays in the local file");
    assert(idle.sections.config.data.activeForm === "duo", "llm checks started from duo");
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
  assert(partial.settings.honorific === "前辈", "old settings file keeps the honorific");
  partial.dispose();
  fs.rmSync(partialDir, { recursive: true, force: true });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
