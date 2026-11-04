import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSettings } from "../shared/defaults";
import { speakFor } from "../shared/lines";
import { PetRuntime } from "./runtime";
import { startServer } from "./server";
import type { PetEvent, PublicState, Settings } from "../shared/types";

const appRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SPEECH_EVENTS: readonly PetEvent[] = ["idle", "thinking", "working", "waiting", "success", "error"];

function chars(text: string): number {
  return Array.from(text).length;
}

function collect(settings: Settings, event: PetEvent, form: Settings["activeForm"], draws: number): string[] {
  const seen: string[] = [];
  for (let index = 0; index < draws; index += 1) seen.push(speakFor(settings, event, form).text);
  return seen;
}

function assertLineVariety(): void {
  const base = defaultSettings();
  for (const event of SPEECH_EVENTS) {
    const lines = collect(base, event, "normal", 24);
    const distinct = new Set(lines);
    assert(distinct.size >= 6, `normal ${event} has many lines, saw ${distinct.size}`);
    assert(lines.some((text, index) => index > 0 && text !== lines[index - 1]), `normal ${event} changes across speaks`);
    for (const text of distinct) {
      assert(text.includes("前辈"), `normal ${event} keeps the honorific`);
      assert(chars(text) <= 36, `normal ${event} stays short: ${text}`);
    }
  }

  for (const event of SPEECH_EVENTS) {
    const lines = collect(base, event, "dark", 24);
    const distinct = new Set(lines);
    assert(distinct.size >= 6, `dark ${event} has many lines, saw ${distinct.size}`);
    for (const text of distinct) {
      assert(text.includes("前辈"), `dark ${event} uses the honorific`);
      assert(!text.includes("请稍等"), `dark ${event} is not the soft line`);
      assert(!text.includes("别装没看见"), `default snark stays under the sharp line: ${text}`);
      assert(chars(text) <= 24, `dark ${event} stays short: ${text}`);
    }
  }

  const echoSettings: Settings = { ...base, duoVoice: { darkShare: 0, dualBubble: false } };
  for (const event of SPEECH_EVENTS) {
    const lines = collect(echoSettings, event, "duo", 24);
    const distinct = new Set(lines);
    assert(distinct.size >= 6, `echo ${event} has many lines, saw ${distinct.size}`);
    for (const text of distinct) assert(chars(text) <= 16, `echo ${event} stays short: ${text}`);
  }

  const direct: Settings = {
    ...base,
    darkMayAddressDirectly: true,
    nickname: "小前",
    snarkCap: 100,
    tone: { intensity: 90, politeness: 80 },
  };
  for (const event of SPEECH_EVENTS) {
    const lines = collect(direct, event, "dark", 24);
    const distinct = new Set(lines);
    assert(distinct.size >= 6, `direct ${event} has many lines, saw ${distinct.size}`);
    for (const text of distinct) {
      assert(text.includes("小前"), `direct ${event} uses the nickname`);
      assert(!text.includes("前辈"), `direct ${event} drops the honorific`);
    }
  }

  const sharp = collect(
    { ...base, honorific: "老板", snarkCap: 100, tone: { intensity: 90, politeness: 80 } },
    "error",
    "dark",
    24,
  );
  assert(new Set(sharp).size >= 6, "high snark error has many lines");
  assert(sharp.some((text) => text.includes("别装没看见")), "snark cap lets the sharp line through");
  assert(sharp.every((text) => text.includes("老板")), "high snark still uses the honorific");

  const capped = collect(
    { ...base, snarkCap: 5, tone: { intensity: 90, politeness: 80 }, darkMayAddressDirectly: true, nickname: "小前" },
    "error",
    "dark",
    24,
  );
  assert(new Set(capped).size >= 4, "low snark error still varies");
  assert(capped.every((text) => !text.includes("别装没看见")), "snark cap blocks the sharp line");
  assert(capped.every((text) => text.includes("小前") && !text.includes("老板")), "low snark direct address stays on the nickname");
  assert(capped.some((text) => text.includes("出岔子了")), "low snark still has the mild fault line");
}

async function main(): Promise<void> {
  assertLineVariety();
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
    assert(state.pets.sakura.say.data.text.includes("老板"), "dark still uses the honorific");
    assert(!state.pets.sakura.say.data.text.includes("请稍等"), "dark error is not the soft line");

    await call(base, "PUT", "/pet/config", { snarkCap: 5, tone: { intensity: 90, politeness: 80 }, darkMayAddressDirectly: true, nickname: "小前" }, user);
    await call(base, "POST", "/pet/work-status", { state: "error", task: "压住" });
    state = await stateOf(base);
    assert(state.pets.sakura.say.data.text.includes("小前"), "capped dark uses the nickname");
    assert(!state.pets.sakura.say.data.text.includes("别装没看见"), "sharp line absent");
    assert(!state.pets.sakura.say.data.text.includes("老板"), "capped dark drops the honorific");
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

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
