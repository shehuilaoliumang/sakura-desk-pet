import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { defaultSettings } from "../shared/defaults";
import { linesFromBroadcast, speakFor } from "../shared/lines";
import { effectivePersonas } from "../shared/persona";
import { parseSettings } from "../shared/schema";
import type {
  AdapterId,
  AnimData,
  ConfigResponse,
  FormId,
  PetEvent,
  PublicState,
  ResolvedPack,
  SayData,
  Settings,
  Speaker,
  WorkStatusData,
} from "../shared/types";
import { isFormId } from "../shared/types";
import { clipLoop, resolvePack } from "./pack";

interface Leaf<T> {
  counter: number;
  data: T;
}

export type ChangeReason = "status" | "settings" | "form" | "reload" | "pack";

export class PetRuntime extends EventEmitter {
  readonly settingsPath: string;
  settings: Settings = defaultSettings();
  warning: string | null = null;
  pack: ResolvedPack;
  version = 0;
  private revision = 0;
  private boundPort = 7341;
  private playbackSeq = 0;
  private playback = new Map<string, AnimData>();
  private dirWatcher: fs.FSWatcher | null = null;
  private packWatcher: fs.FSWatcher | null = null;
  private packTimer: NodeJS.Timeout | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;
  private bubbleTimer: NodeJS.Timeout | null = null;
  private work: WorkStatusData = {
    state: "idle",
    task: "",
    source: "boot",
    adapter: null,
    at: Date.now(),
  };
  private say: SayData = blankSay("normal", "idle");
  private anim: AnimData = blankAnim("normal", "idle", "pb_0");
  private leaves = {
    workStatus: { counter: 0, data: this.work } as Leaf<WorkStatusData>,
    config: { counter: 0, data: { activeForm: "normal" as FormId, defaultForm: "normal" as FormId, revision: 0 } },
    say: { counter: 0, data: this.say } as Leaf<SayData>,
    anim: { counter: 0, data: this.anim } as Leaf<AnimData>,
  };

  constructor(
    private readonly opts: { dataDir: string; appRoot: string },
  ) {
    super();
    this.settingsPath = path.join(opts.dataDir, "settings.json");
    this.pack = resolvePack(this.packRoot());
  }

  load(): void {
    fs.mkdirSync(this.opts.dataDir, { recursive: true });
    if (fs.existsSync(this.settingsPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.settingsPath, "utf8")) as unknown;
        const result = parseSettings(parsed);
        if (!result.ok) {
          this.warning = `配置无法读取，已改用默认并备份。${result.issues.join("；")}`;
          const bak = `${this.settingsPath}.${Date.now()}.bak`;
          try {
            fs.copyFileSync(this.settingsPath, bak);
          } catch {
            // keep going with defaults
          }
          this.settings = defaultSettings();
        } else {
          this.settings = result.settings;
        }
      } catch {
        this.warning = "配置不是合法 JSON，已改用默认。";
        this.settings = defaultSettings();
      }
    } else {
      this.settings = defaultSettings();
    }

    const bootForm = this.settings.forms[this.settings.defaultForm].enabled ? this.settings.defaultForm : "normal";
    this.settings.activeForm = bootForm;
    this.persist();
    this.refreshPack(true);
    this.work = { state: "idle", task: "", source: "boot", adapter: null, at: Date.now() };
    this.pushWork(this.work);
    this.pushAnim(this.work.state, null, null);
    this.pushPersona(this.work.state);
    this.touchConfig();
    this.watchSettings();
    this.watchPack();
  }

  dispose(): void {
    this.dirWatcher?.close();
    this.packWatcher?.close();
    if (this.packTimer) clearTimeout(this.packTimer);
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.dirWatcher = null;
    this.packWatcher = null;
    this.emit("change", "dispose");
  }

  setBoundPort(port: number): void {
    this.boundPort = port;
  }

  wait(since: number, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (since !== this.version) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.off("change", onChange);
        signal?.removeEventListener("abort", finish);
        resolve();
      };
      const onChange = () => finish();
      const timer = setTimeout(finish, timeoutMs);
      this.on("change", onChange);
      signal?.addEventListener("abort", finish, { once: true });
      if (this.version !== since) finish();
    });
  }

  getState(): PublicState {
    return {
      counter: this.version,
      petId: "sakura",
      sections: {
        workStatus: this.leaves.workStatus,
        config: this.leaves.config,
      },
      pets: {
        sakura: {
          say: this.leaves.say,
          anim: this.leaves.anim,
        },
      },
    };
  }

  getConfig(): ConfigResponse {
    return {
      ok: true,
      settings: this.settings,
      effective: effectivePersonas(this.settings),
      api: {
        host: "127.0.0.1",
        port: this.boundPort,
        base: `http://127.0.0.1:${this.boundPort}`,
      },
      paths: {
        settingsPath: this.settingsPath,
        packPath: this.pack.root,
        root: this.opts.appRoot,
      },
      warning: this.warning,
    };
  }

  getPack(): ResolvedPack {
    return this.pack;
  }

  getPlayback(id: string): AnimData | null {
    return this.playback.get(id) ?? null;
  }

  replaceSettings(input: unknown, reason: ChangeReason = "settings"): { ok: true; settings: Settings } | { ok: false; issues: string[] } {
    const parsed = parseSettings(input, this.settings);
    if (!parsed.ok) return parsed;
    const prev = this.settings;
    this.settings = parsed.settings;
    this.warning = null;
    this.persist();
    this.afterSettings(prev, reason);
    return { ok: true, settings: this.settings };
  }

  resetSettings(): Settings {
    const window = this.settings.window;
    const port = this.settings.api.port;
    this.settings = defaultSettings();
    this.settings.window = window;
    this.settings.api.port = port;
    this.settings.activeForm = this.settings.defaultForm;
    this.warning = null;
    this.persist();
    this.afterSettings(null, "settings");
    return this.settings;
  }

  setForm(id: FormId): { ok: true; activeForm: FormId } | { ok: false; reason: string } {
    if (!isFormId(id)) return { ok: false, reason: "unknown-form" };
    if (!this.settings.forms[id].enabled) return { ok: false, reason: "form-disabled" };
    if (this.settings.activeForm === id) return { ok: true, activeForm: id };
    const prev = this.settings;
    this.settings = { ...this.settings, activeForm: id };
    this.persist();
    this.afterSettings(prev, "form");
    return { ok: true, activeForm: id };
  }

  setWindowPosition(x: number, y: number): void {
    this.settings.window.x = Math.round(x);
    this.settings.window.y = Math.round(y);
    this.persist();
  }

  applyWorkStatus(
    state: PetEvent,
    task: string,
    source: WorkStatusData["source"],
    adapter: AdapterId | null,
    speech?: { text: string; speaker?: Speaker | "both"; durationMs?: number },
  ): void {
    this.clearBubbleTimer();
    this.work = { state, task: task.slice(0, 200), source, adapter, at: Date.now() };
    this.pushWork(this.work);
    this.pushAnim(state, null, this.anim.facing);
    if (speech) this.setBroadcast(speech.text, speech.speaker, speech.durationMs ?? 0, false);
    else this.pushPersona(state);
    this.emit("change", "status");
  }

  clearWorkStatus(): void {
    this.applyWorkStatus("idle", "", "clear", null);
  }

  playAnim(input: { name?: PetEvent; url?: string | null; facing?: "left" | "right" | null }): AnimData {
    const name = input.name ?? this.anim.name;
    const url = input.url === undefined ? this.anim.url : input.url;
    const facing = input.facing === undefined ? this.anim.facing : input.facing;
    this.pushAnim(name, url, facing);
    this.emit("change", "status");
    return this.anim;
  }

  broadcast(text: string, speaker: Speaker | "both" | undefined, durationMs: number): SayData {
    this.clearBubbleTimer();
    this.setBroadcast(text, speaker, durationMs, true);
    this.emit("change", "status");
    return this.say;
  }

  clearBubble(): void {
    this.clearBubbleTimer();
    this.say = {
      ...this.say,
      origin: "broadcast",
      lines: [],
      text: "",
      filtered: false,
      cleared: true,
    };
    this.bump(this.leaves.say, this.say);
    this.emit("change", "status");
  }

  reloadPack(): ResolvedPack {
    this.refreshPack(true);
    this.touchConfig();
    this.emit("change", "pack");
    return this.pack;
  }

  mediaFile(form: FormId, relative: string): string | null {
    if (!relative || relative.includes("..") || relative.includes("\\") || path.isAbsolute(relative)) return null;
    const animRoot = path.resolve(this.pack.root, "animations");
    const formRoot = path.resolve(animRoot, form);
    const full = path.resolve(formRoot, relative);
    if (full !== formRoot && !full.startsWith(formRoot + path.sep)) return null;
    try {
      if (!fs.statSync(full).isFile()) return null;
    } catch {
      return null;
    }
    return full;
  }

  private setBroadcast(text: string, speaker: Speaker | "both" | undefined, durationMs: number, armTimer: boolean): void {
    const spoken = linesFromBroadcast(this.settings, this.settings.activeForm, text, speaker);
    this.say = {
      origin: "broadcast",
      form: this.settings.activeForm,
      event: this.work.state,
      lines: spoken.lines,
      text: spoken.text,
      filtered: spoken.filtered,
      cleared: spoken.lines.length === 0,
    };
    this.bump(this.leaves.say, this.say);
    if (armTimer && durationMs > 0) {
      this.bubbleTimer = setTimeout(() => {
        this.bubbleTimer = null;
        this.pushPersona(this.work.state);
        this.emit("change", "status");
      }, durationMs);
    }
  }

  private clearBubbleTimer(): void {
    if (!this.bubbleTimer) return;
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = null;
  }

  private afterSettings(prev: Settings | null, reason: ChangeReason): void {
    const rootChanged = !prev || prev.pack.root !== this.settings.pack.root;
    this.refreshPack(rootChanged);
    if (rootChanged) this.watchPack();
    const formChanged = !prev || prev.activeForm !== this.settings.activeForm;
    const voiceChanged =
      !prev ||
      prev.honorific !== this.settings.honorific ||
      prev.nickname !== this.settings.nickname ||
      prev.darkMayAddressDirectly !== this.settings.darkMayAddressDirectly ||
      prev.snarkCap !== this.settings.snarkCap ||
      prev.tone.intensity !== this.settings.tone.intensity ||
      prev.tone.politeness !== this.settings.tone.politeness ||
      prev.duoVoice.darkShare !== this.settings.duoVoice.darkShare ||
      prev.duoVoice.dualBubble !== this.settings.duoVoice.dualBubble ||
      prev.tabooWords.join("\0") !== this.settings.tabooWords.join("\0") ||
      prev.forms.normal.persona !== this.settings.forms.normal.persona ||
      prev.forms.dark.persona !== this.settings.forms.dark.persona ||
      prev.forms.duo.persona !== this.settings.forms.duo.persona;
    if (formChanged) this.pushAnim(this.anim.name, this.anim.url, this.anim.facing);
    if (formChanged || (voiceChanged && this.say.origin === "persona" && !this.say.cleared)) {
      this.clearBubbleTimer();
      this.pushPersona(this.work.state);
    }
    this.touchConfig();
    this.emit("change", reason);
  }

  private pushPersona(event: PetEvent): void {
    const spoken = speakFor(this.settings, event, this.settings.activeForm);
    this.say = {
      origin: "persona",
      form: this.settings.activeForm,
      event,
      lines: spoken.lines,
      text: spoken.text,
      filtered: spoken.filtered,
      cleared: false,
    };
    this.bump(this.leaves.say, this.say);
  }

  private pushWork(data: WorkStatusData): void {
    this.work = data;
    this.bump(this.leaves.workStatus, data);
  }

  private pushAnim(name: PetEvent, url: string | null, facing: "left" | "right" | null): void {
    this.playbackSeq += 1;
    const playbackId = `pb_${this.playbackSeq}`;
    this.anim = {
      name,
      form: this.settings.activeForm,
      playbackId,
      facing,
      loop: clipLoop(name),
      url,
    };
    this.playback.set(playbackId, this.anim);
    if (this.playback.size > 20) {
      const oldest = this.playback.keys().next().value;
      if (oldest) this.playback.delete(oldest);
    }
    this.bump(this.leaves.anim, this.anim);
  }

  private touchConfig(): void {
    this.revision += 1;
    this.bump(this.leaves.config, {
      activeForm: this.settings.activeForm,
      defaultForm: this.settings.defaultForm,
      revision: this.revision,
    });
  }

  private bump<T>(leaf: Leaf<T>, data: T): void {
    this.version += 1;
    leaf.counter = this.version;
    leaf.data = data;
  }

  private packRoot(): string {
    const root = this.settings.pack.root.trim() || "packs/sakura";
    return path.isAbsolute(root) ? root : path.join(this.opts.appRoot, root);
  }

  private refreshPack(forceWatch = false): void {
    this.pack = resolvePack(this.packRoot());
    if (forceWatch) this.watchPack();
  }

  private persist(): void {
    fs.mkdirSync(this.opts.dataDir, { recursive: true });
    const text = `${JSON.stringify(this.settings, null, 2)}\n`;
    const tmp = `${this.settingsPath}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, this.settingsPath);
  }

  private serialized(): string {
    return `${JSON.stringify(this.settings, null, 2)}\n`;
  }

  private watchSettings(): void {
    this.dirWatcher?.close();
    try {
      this.dirWatcher = fs.watch(this.opts.dataDir, (_event, filename) => {
        if (filename && filename !== "settings.json") return;
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        this.reloadTimer = setTimeout(() => this.reloadFromDisk(), 80);
      });
    } catch (error) {
      this.warning = `无法监视配置目录：${error instanceof Error ? error.message : "unknown"}`;
    }
  }

  private reloadFromDisk(): void {
    let text = "";
    try {
      text = fs.readFileSync(this.settingsPath, "utf8");
    } catch {
      return;
    }
    if (text === this.serialized()) return;
    try {
      const parsed = JSON.parse(text) as unknown;
      const result = parseSettings(parsed);
      if (!result.ok) {
        this.warning = `磁盘上的配置没有通过校验：${result.issues.join("；")}`;
        this.emit("change", "reload");
        return;
      }
      const prev = this.settings;
      this.settings = result.settings;
      this.warning = null;
      this.afterSettings(prev, "reload");
    } catch {
      this.warning = "磁盘上的配置不是合法 JSON。";
      this.emit("change", "reload");
    }
  }

  private watchPack(): void {
    this.packWatcher?.close();
    this.packWatcher = null;
    const animRoot = path.join(this.pack.root, "animations");
    if (!fs.existsSync(animRoot)) return;
    try {
      this.packWatcher = fs.watch(animRoot, { recursive: true }, () => {
        if (this.packTimer) clearTimeout(this.packTimer);
        this.packTimer = setTimeout(() => {
          this.pack = resolvePack(this.pack.root);
          this.touchConfig();
          this.emit("change", "pack");
        }, 150);
      });
    } catch {
      // a missing watcher only means new files wait until the next reload
    }
  }
}

function blankSay(form: FormId, event: PetEvent): SayData {
  return { origin: "persona", form, event, lines: [], text: "", filtered: false, cleared: false };
}

function blankAnim(form: FormId, name: PetEvent, playbackId: string): AnimData {
  return { name, form, playbackId, facing: null, loop: true, url: null };
}
