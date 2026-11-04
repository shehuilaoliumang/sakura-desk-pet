import {
  DEFAULT_DISPLAY_NAME,
  DEFAULT_LLM_PROVIDER,
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
  duo: `双人同框，构图固定：黑樱从身后环抱，贴在耳侧，一手托着她的脸；常态樱双手捧着一枚红苹果。
关系只有一种读法：黑樱保护着软弱的自己。
默认黑樱主说，常态樱用更轻的一句附和。是否同时出现两条气泡，由声部分工决定。
两条声音都听同一个人设，不要互相否定。`,
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
    },
    theme: "warm",
  };
}
