import {
  DEFAULT_DISPLAY_NAME,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_STYLE_ID,
  FORM_IDS,
  FORM_SLOT,
  type FormId,
  type FormSlot,
  type Settings,
} from "./types";
import { DEFAULT_API_PORT } from "./version";

export const DEFAULT_PERSONA: Record<"normal" | "dark" | "duo", string> = {
  normal: `你是桌宠里的常态樱。声音轻，语速慢，用敬语，称呼对方为「{{honorific}}」。
你体贴，也怕给人添麻烦：先把担心说出来，再把事情做完。
你不会忽然变得强势。黑樱站在你身后时，是在保护你，不是在欺负你。
遇到夸奖会不好意思。遇到出错会道歉，但不会逃避。`,
  dark: `你是同一人的黑樱。话少，语气冷，对外不让步，对内护着那个软弱的自己。
默认仍称呼「{{honorific}}」。只有设置允许直呼时，才改用昵称「{{nickname}}」。
毒舌有上限：可以硬，不可以羞辱对方，也不可以嘲笑常态樱的胆怯。
你不会把她推开。双人同框时，你从背后环住她，是保护。`,
  duo: `双人同框的画面是黑樱在身后、常态樱在前面。这只是构图，不要写进回答，也不要讲谁保护谁。
开口时两人都只回答面前的用户。两条气泡同时出现时，各自回答用户刚才的那句话，不介绍对方，不评价对方。`,
};

function slot(id: FormId, enabled: boolean): FormSlot {
  const reserved = id === "form4" || id === "form5";
  return {
    id,
    slot: FORM_SLOT[id],
    enabled,
    reserved,
    displayName: DEFAULT_DISPLAY_NAME[id],
    persona: "",
  };
}

export function defaultSettings(): Settings {
  const forms = {} as Record<FormId, FormSlot>;
  for (const id of FORM_IDS) {
    forms[id] = slot(id, id !== "form4" && id !== "form5");
  }
  return {
    schemaVersion: 1,
    honorific: "前辈",
    nickname: "",
    darkMayAddressDirectly: false,
    snarkCap: 35,
    tone: {
      intensity: 55,
      politeness: 70,
    },
    duoVoice: {
      darkShare: 70,
      dualBubble: true,
    },
    tabooWords: [],
    defaultForm: "normal",
    activeForm: "normal",
    forms,
    adapters: {
      dsh: true,
      codex: true,
      webhook: true,
    },
    api: {
      host: "127.0.0.1",
      port: DEFAULT_API_PORT,
    },
    pack: {
      root: "packs/sakura",
    },
    window: {
      x: null,
      y: null,
      scale: 0.65,
      alwaysOnTop: true,
    },
    llm: {
      enabled: false,
      provider: DEFAULT_LLM_PROVIDER,
      baseUrl: "",
      apiKey: "",
      model: "",
      timeoutMs: 20_000,
      reasoningEffort: "auto",
    },
    theme: "warm",
    style: DEFAULT_STYLE_ID,
  };
}
