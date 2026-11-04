import type { FormId, PetEvent, Settings, Speaker, SpeechLine } from "./types";

type Tier = 0 | 1 | 2;

const NORMAL: Record<PetEvent, [string, string, string]> = {
  idle: ["……在的。", "{{honorific}}，我在这儿。", "{{honorific}}，我就在旁边。有事的话，小声叫我就好。"],
  thinking: ["我想想。", "让我想一想，{{honorific}}。不会太久。", "请给我一点点时间，{{honorific}}。我想仔细一点，免得添麻烦。"],
  working: ["我在做。", "我在做了，{{honorific}}。请稍等。", "正在做，{{honorific}}。做好了就告诉您。"],
  waiting: ["我等着。", "我等着，{{honorific}}。不着急。", "我在等您，{{honorific}}。您先忙就好。"],
  success: ["好了。", "做好了，{{honorific}}。太好了。", "做好了，{{honorific}}。没有添麻烦吧。"],
  error: ["对不起。", "对不起，{{honorific}}。出了点问题。", "对不起，{{honorific}}。我再确认一次。"],
};

const DARK_TITLED: Record<PetEvent, [string, string, string]> = {
  idle: ["{{name}}。", "{{name}}，在。", "{{name}}。看也没用。"],
  thinking: ["……{{name}}，等一下。", "{{name}}，在看。", "{{name}}。别打断。"],
  working: ["{{name}}，做着。", "{{name}}，别催。", "{{name}}。催也快不了。"],
  waiting: ["{{name}}，等你。", "急什么，{{name}}。", "{{name}}。站好就行。"],
  success: ["成了，{{name}}。", "{{name}}，结束了。", "成了。{{name}}用不着道谢。"],
  error: ["{{name}}，出岔子了。", "{{name}}。谁弄的。", "出错了，{{name}}。别装没看见。"],
};

const DARK_DIRECT: Record<PetEvent, [string, string, string]> = {
  idle: ["{{name}}。在。", "在。", "看什么。"],
  thinking: ["等一下。", "在看。", "别打断。"],
  working: ["做着。", "别催。", "催也快不了。"],
  waiting: ["等你。", "急什么。", "站好就行。"],
  success: ["成了。", "结束了。", "用不着谢。"],
  error: ["出岔子了。", "谁弄的。", "出错了。别装没看见。"],
};

const ECHO: Record<PetEvent, [string, string]> = {
  idle: ["……嗯。", "{{honorific}}，我在。"],
  thinking: ["我也在想。", "让我想想，{{honorific}}。"],
  working: ["请稍等。", "我在做了，{{honorific}}。"],
  waiting: ["我不急。", "我等着，{{honorific}}。"],
  success: ["太好了。", "做好了，{{honorific}}。"],
  error: ["对不起。", "对不起，{{honorific}}。"],
};

function clampTier(n: number): Tier {
  if (n <= 0) return 0;
  if (n >= 2) return 2;
  return 1;
}

function normalTier(settings: Settings): Tier {
  let tier: Tier = settings.tone.intensity < 34 ? 0 : settings.tone.intensity < 74 ? 1 : 2;
  if (settings.tone.politeness < 25) tier = 0;
  if (settings.tone.politeness > 80 && tier === 0) tier = 1;
  return tier;
}

function darkTier(settings: Settings): Tier {
  const cap: Tier = settings.snarkCap <= 33 ? 0 : settings.snarkCap <= 66 ? 1 : 2;
  let tier = cap;
  if (settings.tone.intensity < 30) tier = clampTier(tier - 1);
  if (settings.tone.intensity > 75) tier = clampTier(tier + 1);
  return clampTier(Math.min(tier, cap));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyTaboo(text: string, words: string[]): { text: string; filtered: boolean } {
  let next = text;
  let filtered = false;
  const sorted = [...words].filter((word) => word.trim()).sort((a, b) => b.length - a.length);
  for (const word of sorted) {
    const pattern = new RegExp(escapeRegExp(word), "gi");
    if (!pattern.test(next)) continue;
    filtered = true;
    pattern.lastIndex = 0;
    next = next.replace(pattern, "※");
  }
  return { text: next, filtered };
}

function fill(template: string, settings: Settings, who: Speaker): string {
  const honorific = settings.honorific.trim() || "你";
  const nickname = settings.nickname.trim();
  const name = who === "dark" && settings.darkMayAddressDirectly ? nickname || "你" : honorific;
  return template.replaceAll("{{honorific}}", honorific).replaceAll("{{nickname}}", nickname || name).replaceAll("{{name}}", name);
}

function darkLine(settings: Settings, event: PetEvent): string {
  const table = settings.darkMayAddressDirectly ? DARK_DIRECT : DARK_TITLED;
  return fill(table[event][darkTier(settings)], settings, "dark");
}

function softLine(settings: Settings, event: PetEvent): string {
  return fill(NORMAL[event][normalTier(settings)], settings, "normal");
}

function echoLine(settings: Settings, event: PetEvent): string {
  const index = settings.tone.politeness >= 60 ? 1 : 0;
  return fill(ECHO[event][index], settings, "normal");
}

function finish(lines: SpeechLine[], words: string[]): { lines: SpeechLine[]; text: string; filtered: boolean } {
  let filtered = false;
  const next = lines.map((line) => {
    const applied = applyTaboo(line.text, words);
    if (applied.filtered) filtered = true;
    return { ...line, text: applied.text };
  });
  return { lines: next, text: next.map((line) => line.text).join("\n"), filtered };
}

export function speakFor(settings: Settings, event: PetEvent, form: FormId): { lines: SpeechLine[]; text: string; filtered: boolean } {
  if (form === "form4" || form === "form5") {
    return finish(
      [{ speaker: "normal", text: "这个槽位还没有人设。", primary: true }],
      settings.tabooWords,
    );
  }
  if (form === "normal") {
    return finish([{ speaker: "normal", text: softLine(settings, event), primary: true }], settings.tabooWords);
  }
  if (form === "dark") {
    return finish([{ speaker: "dark", text: darkLine(settings, event), primary: true }], settings.tabooWords);
  }

  const share = settings.duoVoice.darkShare;
  const dual = settings.duoVoice.dualBubble;
  const showDark = share > 0 && (dual || share >= 50);
  const showSoft = share < 100 && (dual || share < 50);
  const darkPrimary = share >= 50;
  const lines: SpeechLine[] = [];
  if (showDark) lines.push({ speaker: "dark", text: darkLine(settings, event), primary: darkPrimary || !showSoft });
  if (showSoft) lines.push({ speaker: "normal", text: echoLine(settings, event), primary: !darkPrimary || !showDark });
  if (!lines.length) lines.push({ speaker: "dark", text: darkLine(settings, event), primary: true });
  return finish(lines, settings.tabooWords);
}

export function linesFromBroadcast(
  settings: Settings,
  form: FormId,
  text: string,
  speaker?: Speaker | "both",
): { lines: SpeechLine[]; text: string; filtered: boolean } {
  const parts = text.split("||").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return finish(
      [
        { speaker: "dark", text: parts[0] ?? "", primary: settings.duoVoice.darkShare >= 50 },
        { speaker: "normal", text: parts[1] ?? "", primary: settings.duoVoice.darkShare < 50 },
      ],
      settings.tabooWords,
    );
  }

  const body = parts[0] ?? text.trim();
  let who: Speaker;
  if (speaker === "normal" || speaker === "dark") who = speaker;
  else if (form === "normal") who = "normal";
  else if (form === "duo" && settings.duoVoice.darkShare < 50) who = "normal";
  else who = "dark";

  return finish([{ speaker: who, text: body, primary: true }], settings.tabooWords);
}
