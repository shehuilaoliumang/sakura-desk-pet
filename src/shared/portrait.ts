import type { FormId, PetEvent, Settings, Speaker, SpeechLine } from "./types";
import { applyTaboo } from "./lines";

/** 喜怒哀乐. Happy reuses the existing blush click frame; the other three have their own folders. */
export const PORTRAIT_EMOTIONS = ["happy", "angry", "sad", "joyful"] as const;
export type PortraitEmotion = (typeof PORTRAIT_EMOTIONS)[number];

export const PORTRAIT_ACTIONS = ["nod", "bow", "shake", "bounce", "droop", "offer", "press", "sway"] as const;
export type PortraitAction = (typeof PORTRAIT_ACTIONS)[number];

export const EMOTION_LABEL: Record<PortraitEmotion, string> = {
  happy: "喜",
  angry: "怒",
  sad: "哀",
  joyful: "乐",
};

export interface PoseStep {
  /** Library key. `idle` index 0 is open eyes, index 1 is the blink. */
  clip: string;
  index: number;
  ms: number;
  /** Percent of the figure. Positive x moves right, positive y moves down. */
  x: number;
  y: number;
  rot: number;
  scale: number;
}

export interface PoseTimeline {
  steps: PoseStep[];
  /** 0 loops the whole timeline. A positive index loops from there after the first pass. null plays once and holds the last step. */
  repeatFrom: number | null;
}

export interface ClickZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  emotion: PortraitEmotion;
  action: PortraitAction;
  /** Expression frames. `click` is the existing blush, which is 喜. */
  clip: string;
  primary: Speaker;
  speakers: Speaker[];
  lines: Partial<Record<Speaker, readonly string[]>>;
}

export interface WorkPose {
  emotion: PortraitEmotion;
  action: PortraitAction;
  clip: string;
}

const ILLUSTRATED = new Set<FormId>(["normal", "dark", "duo"]);

function step(
  clip: string,
  index: number,
  ms: number,
  x = 0,
  y = 0,
  rot = 0,
  scale = 1,
): PoseStep {
  return { clip, index, ms, x, y, rot, scale };
}

/** One gesture. The last pose is what a click holds while the line is read. */
export function poseSteps(clip: string, action: PortraitAction): PoseStep[] {
  const face = clip;
  switch (action) {
    case "shake":
      return [
        step("idle", 0, 80),
        step(face, 0, 110, -1.6, 0, -2.2),
        step(face, 1, 110, 1.8, 0, 2.4),
        step(face, 0, 100, -1.2, 0, -1.4),
        step(face, 1, 120, 1.1, 0, 1.2),
        step(face, 0, 1600),
      ];
    case "droop":
      return [
        step("idle", 0, 120),
        step(face, 0, 200, 0, 1.1, 1.4, 0.992),
        step(face, 1, 260, 0, 2.2, 1.8, 0.978),
        step(face, 1, 1600, 0, 1.8, 1.2, 0.984),
      ];
    case "bounce":
      return [
        step("idle", 0, 80),
        step(face, 0, 130, 0, -1.8, 0, 1.02),
        step("idle", 1, 110, 0, -2.6, 0, 1.028),
        step(face, 1, 140, 0, 0.6, 0, 0.986),
        step(face, 0, 140, 0, -2.2, -1, 1.024),
        step(face, 0, 1600),
      ];
    case "bow":
      return [
        step("idle", 0, 100),
        step(face, 0, 200, 0, 2.2, 6, 0.992),
        step(face, 0, 220, 0, 3.1, 7.5, 0.984),
        step(face, 0, 1600, 0, 0.3, 0.6),
      ];
    case "offer":
      return [
        step("idle", 0, 100),
        step(face, 0, 170, 0, -2.2, -0.6, 1.02),
        step(face, 0, 200, 0, -3.2, 0, 1.032),
        step("idle", 1, 120, 0, -1.4, 0, 1.01),
        step(face, 0, 1600, 0, -0.8, 0, 1.012),
      ];
    case "press":
      return [
        step(face, 0, 150, 0, 0.4, 0, 0.986),
        step(face, 1, 170, 0, 0.8, 0, 0.972),
        step("idle", 1, 120),
        step(face, 0, 1600),
      ];
    case "sway":
      return [
        step("idle", 0, 160, -0.8, 0, -1.1),
        step(face, 0, 200, 0.8, -0.3, 1.1, 1.01),
        step(face, 0, 1500, 0, 0, 0, 1),
      ];
    case "nod":
    default:
      return [
        step("idle", 0, 100, 0, 0.3, 1.5),
        step(face, 0, 170, 0, 1.3, 3.6, 0.996),
        step(face, 0, 150, 0, -0.7, -1.2, 1.01),
        step("idle", 1, 120),
        step(face, 0, 1600, 0, 0.2, 0.4),
      ];
  }
}

export function clickTimeline(clip: string, action: PortraitAction): PoseTimeline {
  return { steps: poseSteps(clip, action), repeatFrom: null };
}

/** After the gesture, keep breathing on the expression until the work state changes. */
export function workTimeline(clip: string, action: PortraitAction): PoseTimeline {
  const steps = poseSteps(clip, action).map((item) => (item.ms > 800 ? { ...item, ms: 420 } : item));
  const tail = steps.length;
  steps.push(
    step(clip, 0, 640),
    step(clip, 0, 700, 0, -1.3, 0, 1.014),
    step(clip, 0, 640, 0, 0.35, 0, 0.994),
  );
  return { steps, repeatFrom: tail };
}

export function idleTimeline(mood: PetEvent): PoseTimeline {
  const tilt = mood === "thinking" ? -1.8 : mood === "working" ? 0.7 : 0;
  const pace = mood === "waiting" ? 1.35 : mood === "working" ? 0.82 : 1;
  const sway = mood === "working" ? 0.7 : 0;
  const ms = (value: number) => Math.round(value * pace);
  return {
    steps: [
      step("idle", 0, ms(520), 0, 0, tilt),
      step("idle", 0, ms(560), sway, -1.5, tilt, 1.016),
      step("idle", 0, ms(500), -sway, 0.35, tilt * 0.35, 0.994),
      step("idle", 1, ms(130), 0, 0.4, 0, 0.99),
      step("idle", 0, ms(180), 0, 0, tilt * 0.2),
    ],
    repeatFrom: 0,
  };
}

export function resolveFrame(library: Record<string, string[]> | undefined, pose: PoseStep): string | null {
  if (!library) return null;
  const own = library[pose.clip];
  if (own && own.length) return own[Math.min(pose.index, own.length - 1)] ?? null;
  if ((pose.clip === "happy" || pose.clip === "joyful") && library.click?.length) return library.click[0] ?? null;
  const idle = library.idle;
  if (!idle?.length) return null;
  const index = pose.index === 1 && idle.length > 1 ? 1 : 0;
  return idle[index] ?? null;
}

export function workPose(form: FormId, mood: PetEvent, darkShare: number): WorkPose | null {
  if (!ILLUSTRATED.has(form)) return null;
  if (mood === "success") return { emotion: "happy", action: "nod", clip: "click" };
  if (mood !== "error") return null;
  const angry = form === "dark" || (form === "duo" && darkShare >= 50);
  if (angry) return { emotion: "angry", action: "shake", clip: "angry" };
  return { emotion: "sad", action: "droop", clip: form === "duo" ? "sad" : "sad" };
}

function zone(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  emotion: PortraitEmotion,
  action: PortraitAction,
  clip: string,
  primary: Speaker,
  speakers: Speaker[],
  lines: Partial<Record<Speaker, readonly string[]>>,
): ClickZone {
  return { id, x, y, w, h, emotion, action, clip, primary, speakers, lines };
}

const NORMAL_ZONES: ClickZone[] = [
  zone("ribbon", 0.64, 0.15, 0.16, 0.2, "joyful", "bounce", "joyful", "normal", ["normal"], {
    normal: ["{{honorific}}注意到蝴蝶结了。", "这个结是我自己系的，{{honorific}}。", "{{honorific}}喜欢的话，我再系紧一点。"],
  }),
  zone("hair", 0.38, 0.08, 0.26, 0.1, "angry", "shake", "angry", "normal", ["normal"], {
    normal: ["{{honorific}}，头发会乱的。", "请别扯头发，{{honorific}}。", "{{honorific}}……那样会痛。"],
  }),
  zone("face", 0.4, 0.18, 0.24, 0.18, "happy", "nod", "click", "normal", ["normal"], {
    normal: ["{{honorific}}……这样看着我，我会不好意思。", "嗯，{{honorific}}。我在这儿。", "{{honorific}}，有什么事吗。"],
  }),
  zone("bow", 0.4, 0.35, 0.22, 0.14, "happy", "bow", "click", "normal", ["normal"], {
    normal: ["{{honorific}}，领结还端正吗。", "我低头给您看，{{honorific}}。", "这个结我每天都会重新系，{{honorific}}。"],
  }),
  zone("apple", 0.34, 0.54, 0.32, 0.22, "happy", "offer", "click", "normal", ["normal"], {
    normal: ["{{honorific}}，这个苹果要分您吗。", "给您，{{honorific}}。", "{{honorific}}先拿着吧。"],
  }),
  zone("sleeve-left", 0.22, 0.4, 0.16, 0.34, "sad", "droop", "sad", "normal", ["normal"], {
    normal: ["{{honorific}}，袖子那边有点痒。", "请轻一点，{{honorific}}。我有点怕。", "{{honorific}}，我往旁边让一让。"],
  }),
  zone("sleeve-right", 0.66, 0.4, 0.14, 0.3, "sad", "droop", "sad", "normal", ["normal"], {
    normal: ["{{honorific}}，这边的袖口松了。", "请别拉这边，{{honorific}}。", "{{honorific}}，袖子会皱的。"],
  }),
  zone("skirt", 0.36, 0.8, 0.28, 0.18, "sad", "droop", "sad", "normal", ["normal"], {
    normal: ["{{honorific}}，裙子不要拉。", "请往上看，{{honorific}}。", "{{honorific}}……那样我会躲开。"],
  }),
];

const DARK_ZONES: ClickZone[] = [
  zone("ribbon", 0.62, 0.08, 0.16, 0.16, "joyful", "bounce", "joyful", "dark", ["dark"], {
    dark: ["还算你会看，{{name}}。", "{{name}}，这个结不许拆。", "……喜欢就说，{{name}}。"],
  }),
  zone("face", 0.44, 0.16, 0.22, 0.2, "happy", "nod", "click", "dark", ["dark"], {
    dark: ["……看够了吗，{{name}}。", "{{name}}。看也行。", "嗯，{{name}}。我在。"],
  }),
  zone("hand", 0.42, 0.4, 0.18, 0.14, "joyful", "press", "joyful", "dark", ["dark"], {
    dark: ["只许碰这里，{{name}}。", "{{name}}。够了。", "……{{name}}，手是温的。"],
  }),
  zone("hair-left", 0.02, 0.24, 0.36, 0.36, "angry", "shake", "angry", "dark", ["dark"], {
    dark: ["松手，{{name}}。", "{{name}}。头发，别扯。", "再扯我就生气了，{{name}}。"],
  }),
  zone("hair-right", 0.64, 0.3, 0.22, 0.32, "angry", "shake", "angry", "dark", ["dark"], {
    dark: ["那边也别扯，{{name}}。", "{{name}}。右边也不行。", "松手，{{name}}。头发。"],
  }),
  zone("skirt", 0.32, 0.64, 0.4, 0.3, "sad", "droop", "sad", "dark", ["dark"], {
    dark: ["……别扯那边，{{name}}。", "{{name}}。下面不行。", "……{{name}}，别看那里。"],
  }),
  zone("body", 0.38, 0.5, 0.28, 0.16, "happy", "sway", "click", "dark", ["dark"], {
    dark: ["{{name}}。", "在，{{name}}。", "……{{name}}，我在。"],
  }),
];

const DUO_ZONES: ClickZone[] = [
  zone("dark-face", 0.44, 0.1, 0.18, 0.2, "happy", "nod", "click", "dark", ["dark"], {
    dark: ["{{name}}，看这边做什么。", "……{{name}}。我看着你。", "{{name}}。在。"],
  }),
  zone("normal-ribbon", 0.82, 0.28, 0.14, 0.16, "joyful", "bounce", "joyful", "normal", ["normal"], {
    normal: ["{{honorific}}，蝴蝶结还在。", "{{honorific}}喜欢这个颜色吗。", "{{honorific}}，这个结我系得很紧。"],
  }),
  zone("cheek", 0.6, 0.3, 0.14, 0.12, "happy", "press", "click", "normal", ["normal", "dark"], {
    normal: ["{{honorific}}，脸有点热。", "{{honorific}}……请轻一点。"],
    dark: ["{{name}}，轻一点。", "……{{name}}。就一下。"],
  }),
  zone("normal-face", 0.7, 0.26, 0.12, 0.14, "happy", "nod", "click", "normal", ["normal"], {
    normal: ["{{honorific}}，我在。", "{{honorific}}……您找我吗。", "嗯，{{honorific}}。"],
  }),
  zone("bow", 0.56, 0.42, 0.16, 0.12, "happy", "bow", "click", "normal", ["normal"], {
    normal: ["{{honorific}}，领结歪了吗。", "我给您看，{{honorific}}。"],
  }),
  zone("apple", 0.46, 0.56, 0.22, 0.16, "joyful", "offer", "joyful", "normal", ["normal", "dark"], {
    normal: ["{{honorific}}要的话，可以分您。", "这个苹果，{{honorific}}先拿。"],
    dark: ["{{name}}，这个不能拿走。", "{{name}}。看可以，拿走不行。"],
  }),
  zone("dark-hair", 0, 0.14, 0.4, 0.34, "angry", "shake", "angry", "dark", ["dark"], {
    dark: ["松手，{{name}}。", "{{name}}，头发别碰。", "再扯我就生气，{{name}}。"],
  }),
  zone("normal-sleeve", 0.78, 0.46, 0.16, 0.24, "sad", "droop", "sad", "normal", ["normal"], {
    normal: ["{{honorific}}，袖子有点紧。", "请轻一点，{{honorific}}。"],
  }),
  zone("dark-dress", 0.08, 0.5, 0.34, 0.4, "sad", "droop", "sad-dark", "dark", ["dark"], {
    dark: ["……{{name}}，手拿开。", "{{name}}。那边凉。", "……{{name}}，别拉衣服。"],
  }),
];

const ZONES: Record<"normal" | "dark" | "duo", ClickZone[]> = {
  normal: NORMAL_ZONES,
  dark: DARK_ZONES,
  duo: DUO_ZONES,
};

function inside(zoneHit: ClickZone, nx: number, ny: number): boolean {
  return nx >= zoneHit.x && ny >= zoneHit.y && nx < zoneHit.x + zoneHit.w && ny < zoneHit.y + zoneHit.h;
}

function restZone(form: "normal" | "dark" | "duo", nx: number): ClickZone {
  if (form === "duo" && nx >= 0.48) {
    return zone("rest-normal", 0, 0, 0, 0, "happy", "sway", "click", "normal", ["normal"], {
      normal: ["{{honorific}}，我在。", "嗯，{{honorific}}。"],
    });
  }
  if (form === "duo") {
    return zone("rest-dark", 0, 0, 0, 0, "happy", "sway", "click", "dark", ["dark"], {
      dark: ["{{name}}。", "在，{{name}}。"],
    });
  }
  const who: Speaker = form === "dark" ? "dark" : "normal";
  return zone("rest", 0, 0, 0, 0, "happy", "sway", "click", who, [who], {
    [who]: who === "dark" ? ["{{name}}。", "在，{{name}}。"] : ["{{honorific}}，我在。", "嗯，{{honorific}}。"],
  });
}

export function zonesFor(form: FormId): readonly ClickZone[] {
  if (form === "normal" || form === "dark" || form === "duo") return ZONES[form];
  return [];
}

/** Image-space hit, 0–1 of the figure. Transparent margins return null. Clicks do not change work status. */
export function hitZone(form: FormId, nx: number, ny: number): ClickZone | null {
  if (form !== "normal" && form !== "dark" && form !== "duo") return null;
  if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null;
  for (const item of ZONES[form]) {
    if (inside(item, nx, ny)) return item;
  }
  const bounds = form === "dark"
    ? { x: 0.04, y: 0.06, w: 0.88, h: 0.92 }
    : form === "duo"
      ? { x: 0.02, y: 0.05, w: 0.96, h: 0.93 }
      : { x: 0.2, y: 0.06, w: 0.62, h: 0.92 };
  if (!inside({ ...bounds, id: "", emotion: "happy", action: "sway", clip: "click", primary: "normal", speakers: [], lines: {} }, nx, ny)) {
    return null;
  }
  return restZone(form, nx);
}

function fill(template: string, settings: Settings, who: Speaker): string {
  const honorific = settings.honorific.trim() || "你";
  const nickname = settings.nickname.trim();
  const name = who === "dark" && settings.darkMayAddressDirectly ? nickname || "你" : honorific;
  return template.replaceAll("{{honorific}}", honorific).replaceAll("{{nickname}}", nickname || name).replaceAll("{{name}}", name);
}

export function speakTouch(
  settings: Settings,
  zoneHit: ClickZone,
  pick: number,
): { lines: SpeechLine[]; text: string; filtered: boolean } {
  const both = zoneHit.speakers.length > 1;
  const speakers = zoneHit.speakers.filter((who) => !both || settings.duoVoice.dualBubble || who === zoneHit.primary);
  const lines: SpeechLine[] = [];
  for (const who of speakers) {
    const pool = zoneHit.lines[who];
    if (!pool?.length) continue;
    const template = pool[Math.abs(pick) % pool.length] ?? pool[0] ?? "";
    lines.push({ speaker: who, text: fill(template, settings, who), primary: who === zoneHit.primary });
  }
  let filtered = false;
  const next = lines.map((line) => {
    const applied = applyTaboo(line.text, settings.tabooWords);
    if (applied.filtered) filtered = true;
    return { ...line, text: applied.text };
  });
  return { lines: next, text: next.map((line) => line.text).join("\n"), filtered };
}
