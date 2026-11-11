export const FORM_IDS = ["normal", "dark", "duo", "form4", "form5"] as const;
export type FormId = (typeof FORM_IDS)[number];

export const PET_EVENTS = ["idle", "thinking", "working", "waiting", "success", "error"] as const;
export type PetEvent = (typeof PET_EVENTS)[number];

export const ADAPTER_IDS = ["dsh", "codex", "webhook"] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];

/** Known ids live in the provider registry. Stored as a string so a new provider does not need a settings migration. */
export const DEFAULT_LLM_PROVIDER = "openai-compatible";

/** Built-in default. Other styles are discovered from pack.json, not listed here. */
export const DEFAULT_STYLE_ID = "portrait";

export interface FigureLayout {
  baseW: number;
  baseH: number;
  stageH: number;
}

export interface PackStyle {
  id: string;
  name: string;
  order: number;
  default: boolean;
  /** "paint" keeps smooth scaling. "pixel" uses crisp pixels. Other values stay smooth until a renderer knows them. */
  render: string;
  layout: FigureLayout;
}

export interface StyleDescriptor extends PackStyle {
  /** Relative to the app root, for example packs/sakura. */
  root: string;
}

export const THEME_IDS = ["warm", "glass"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

/** auto = none on loopback or Qwen; none = always send; off = omit the field. */
export const REASONING_EFFORTS = ["auto", "none", "off"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

export interface LlmSettings {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  reasoningEffort: ReasoningEffort;
}

export type Speaker = "normal" | "dark";

export function isFormId(value: string): value is FormId {
  return (FORM_IDS as readonly string[]).includes(value);
}

export function isPetEvent(value: string): value is PetEvent {
  return (PET_EVENTS as readonly string[]).includes(value);
}

export function isAdapterId(value: string): value is AdapterId {
  return (ADAPTER_IDS as readonly string[]).includes(value);
}

export const FORM_SLOT: Record<FormId, 1 | 2 | 3 | 4 | 5> = {
  normal: 1,
  dark: 2,
  duo: 3,
  form4: 4,
  form5: 5,
};

export const DEFAULT_DISPLAY_NAME: Record<FormId, string> = {
  normal: "常态樱",
  dark: "黑樱",
  duo: "双人",
  form4: "预留形态四",
  form5: "预留形态五",
};

export const STATUS_LABEL: Record<PetEvent, string> = {
  idle: "空闲",
  thinking: "思考",
  working: "工作中",
  waiting: "等待",
  success: "完成",
  error: "出错",
};

export interface Tone {
  intensity: number;
  politeness: number;
}

export interface FormSlot {
  id: FormId;
  slot: 1 | 2 | 3 | 4 | 5;
  enabled: boolean;
  reserved: boolean;
  displayName: string;
  persona: string;
}

export interface Settings {
  schemaVersion: 1;
  honorific: string;
  nickname: string;
  darkMayAddressDirectly: boolean;
  snarkCap: number;
  tone: Tone;
  duoVoice: {
    darkShare: number;
    dualBubble: boolean;
  };
  tabooWords: string[];
  defaultForm: FormId;
  activeForm: FormId;
  forms: Record<FormId, FormSlot>;
  adapters: Record<AdapterId, boolean>;
  api: {
    host: "127.0.0.1";
    port: number;
  };
  pack: {
    root: string;
  };
  window: {
    x: number | null;
    y: number | null;
    scale: number;
    alwaysOnTop: boolean;
  };
  llm: LlmSettings;
  /** warm = 经典暖色, glass = 浅色毛玻璃 */
  theme: ThemeId;
  /** Active illustration style. The id comes from a pack's style.id. */
  style: string;
}

export interface SpeechLine {
  speaker: Speaker;
  text: string;
  primary: boolean;
}

export interface EffectiveFormPersona {
  source: "default" | "override" | "empty";
  text: string;
}

export interface EffectivePersonas {
  honorific: string;
  nickname: string;
  forms: Record<FormId, EffectiveFormPersona>;
}

export interface StateLeaf<T> {
  counter: number;
  data: T;
}

export interface WorkStatusData {
  state: PetEvent;
  task: string;
  source: "boot" | "work-status" | "event" | "clear";
  adapter: AdapterId | null;
  at: number;
}

export interface ConfigLeafData {
  activeForm: FormId;
  defaultForm: FormId;
  revision: number;
}

export interface SayData {
  origin: "persona" | "broadcast";
  form: FormId;
  event: PetEvent;
  lines: SpeechLine[];
  text: string;
  filtered: boolean;
  cleared: boolean;
}

export interface AnimData {
  name: PetEvent;
  form: FormId;
  playbackId: string;
  facing: "left" | "right" | null;
  loop: boolean;
  url: string | null;
}

export interface PublicState {
  counter: number;
  petId: "sakura";
  sections: {
    workStatus: StateLeaf<WorkStatusData>;
    config: StateLeaf<ConfigLeafData>;
  };
  pets: {
    sakura: {
      say: StateLeaf<SayData>;
      anim: StateLeaf<AnimData>;
    };
  };
}

export interface PackClip {
  state: PetEvent;
  label: string;
  loop: boolean;
  file: string | null;
  mediaUrl: string | null;
  /** Playback order. Repeated urls hold a frame longer without duplicating files. */
  frames: string[];
}

export interface ClickClip {
  name: "click";
  label: string;
  loop: false;
  file: string | null;
  mediaUrl: string | null;
  frames: string[];
}

export interface ResolvedPack {
  id: string;
  name: string;
  version: string;
  credit: string;
  root: string;
  warning: string | null;
  style: PackStyle | null;
  forms: Record<FormId, {
    clips: PackClip[];
    click: ClickClip | null;
    /** Action folder → frame urls in filename order. `idle` is the raw open/blink pair, not the paced loop. */
    library: Record<string, string[]>;
  }>;
}

export interface ConfigResponse {
  ok: true;
  settings: Settings;
  effective: EffectivePersonas;
  api: {
    host: "127.0.0.1";
    port: number;
    base: string;
  };
  paths: {
    settingsPath: string;
    packPath: string;
    root: string;
  };
  warning: string | null;
  styles: StyleDescriptor[];
}
