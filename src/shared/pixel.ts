import type { FormId, PetEvent, Settings } from "./types";
import type { ClickZone, PortraitEmotion, PortraitAction, WorkPose } from "./portrait";
import { speakTouch } from "./portrait";
import { cycleTimeline, idleCycle, sequenceFrame } from "./frameCycle";

export { speakTouch };

const ILLUSTRATED = new Set<FormId>(["normal", "dark", "duo"]);

function zone(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  emotion: PortraitEmotion,
  action: PortraitAction,
  clip: string,
  primary: ClickZone["primary"],
  speakers: ClickZone["speakers"],
  lines: ClickZone["lines"],
): ClickZone {
  return { id, x, y, w, h, emotion, action, clip, primary, speakers, lines };
}

/** Fractions of the full-body pixel canvas. Specific parts are listed before the broad ones. */
const NORMAL_ZONES: ClickZone[] = [
  zone("ribbon", 0.56, 0.2, 0.26, 0.2, "joyful", "bounce", "joyful", "normal", ["normal"], {
    normal: ["{{honorific}}，蝴蝶结会跟着跳。", "{{honorific}}看这边，结还在。", "这个结是我自己系的，{{honorific}}。"],
  }),
  zone("face", 0.36, 0.32, 0.28, 0.16, "happy", "nod", "happy", "normal", ["normal"], {
    normal: ["{{honorific}}……这样看着，我会不好意思。", "嗯，{{honorific}}。我在。", "{{honorific}}，有什么事吗。"],
  }),
  zone("hair", 0.22, 0.18, 0.32, 0.14, "angry", "shake", "angry", "normal", ["normal"], {
    normal: ["{{honorific}}，头发会乱的。", "请轻一点，{{honorific}}。", "{{honorific}}……那样会痛。"],
  }),
  zone("bow", 0.4, 0.5, 0.2, 0.1, "happy", "bow", "happy", "normal", ["normal"], {
    normal: ["{{honorific}}，领结还端正吗。", "我低头给您看，{{honorific}}。"],
  }),
  zone("apple", 0.4, 0.64, 0.22, 0.12, "happy", "offer", "happy", "normal", ["normal"], {
    normal: ["{{honorific}}，这个苹果分您吗。", "给您，{{honorific}}。", "{{honorific}}先拿着吧。"],
  }),
  zone("skirt", 0.26, 0.74, 0.48, 0.1, "sad", "droop", "sad", "normal", ["normal"], {
    normal: ["{{honorific}}，裙子不要拉。", "请往上看，{{honorific}}。"],
  }),
  zone("legs", 0.34, 0.84, 0.32, 0.12, "joyful", "bounce", "joyful", "normal", ["normal"], {
    normal: ["{{honorific}}，脚边有点痒。", "{{honorific}}……我跳一下。"],
  }),
];

const DARK_ZONES: ClickZone[] = [
  zone("ribbon", 0.56, 0.2, 0.28, 0.22, "joyful", "bounce", "joyful", "dark", ["dark"], {
    dark: ["还算你会看，{{name}}。", "{{name}}，这个结不许拆。", "……喜欢就说，{{name}}。"],
  }),
  zone("face", 0.36, 0.3, 0.28, 0.16, "happy", "nod", "happy", "dark", ["dark"], {
    dark: ["……看够了吗，{{name}}。", "{{name}}。我在。", "嗯，{{name}}。看也行。"],
  }),
  zone("hand", 0.38, 0.52, 0.24, 0.12, "joyful", "press", "joyful", "dark", ["dark"], {
    dark: ["只许碰这里，{{name}}。", "{{name}}。够了。", "……{{name}}，手是温的。"],
  }),
  zone("hair-left", 0.16, 0.28, 0.18, 0.36, "angry", "shake", "angry", "dark", ["dark"], {
    dark: ["松手，{{name}}。", "{{name}}。头发，别扯。", "再扯我就生气了，{{name}}。"],
  }),
  zone("hair-right", 0.72, 0.42, 0.18, 0.28, "angry", "shake", "angry", "dark", ["dark"], {
    dark: ["那边也别扯，{{name}}。", "{{name}}。右边也不行。"],
  }),
  zone("dress", 0.22, 0.66, 0.56, 0.16, "sad", "droop", "sad", "dark", ["dark"], {
    dark: ["……别扯那边，{{name}}。", "{{name}}。下面不行。", "……{{name}}，别拉衣服。"],
  }),
  zone("legs", 0.34, 0.84, 0.32, 0.12, "angry", "shake", "angry", "dark", ["dark"], {
    dark: ["{{name}}。别踩过来。", "{{name}}，脚边不行。"],
  }),
];

const DUO_ZONES: ClickZone[] = [
  zone("normal-ribbon", 0.7, 0.34, 0.18, 0.12, "joyful", "bounce", "joyful", "normal", ["normal"], {
    normal: ["{{honorific}}，蝴蝶结还在。", "{{honorific}}喜欢这个颜色吗。", "{{honorific}}，这个结我系得很紧。"],
  }),
  zone("dark-face", 0.24, 0.4, 0.2, 0.14, "happy", "nod", "happy", "dark", ["dark"], {
    dark: ["{{name}}，看这边做什么。", "……{{name}}。我在。", "{{name}}。在。"],
  }),
  zone("cheek", 0.5, 0.44, 0.1, 0.1, "happy", "press", "happy", "normal", ["normal", "dark"], {
    normal: ["{{honorific}}，脸有点热。", "{{honorific}}……请轻一点。"],
    dark: ["{{name}}，轻一点。", "……{{name}}。就一下。"],
  }),
  zone("normal-face", 0.6, 0.4, 0.14, 0.14, "happy", "nod", "happy", "normal", ["normal"], {
    normal: ["{{honorific}}，我在。", "{{honorific}}……您找我吗。", "嗯，{{honorific}}。"],
  }),
  zone("bow", 0.56, 0.54, 0.14, 0.08, "happy", "bow", "happy", "normal", ["normal"], {
    normal: ["{{honorific}}，领结歪了吗。", "我给您看，{{honorific}}。"],
  }),
  zone("apple", 0.5, 0.64, 0.18, 0.12, "joyful", "offer", "joyful", "normal", ["normal", "dark"], {
    normal: ["{{honorific}}要的话，可以分您。", "这个苹果，{{honorific}}先拿。"],
    dark: ["{{name}}，这个不能拿走。", "{{name}}。看可以。"],
  }),
  zone("dark-hair", 0.06, 0.32, 0.16, 0.28, "angry", "shake", "angry", "dark", ["dark"], {
    dark: ["松手，{{name}}。", "{{name}}，头发别碰。", "再扯我就生气，{{name}}。"],
  }),
  zone("normal-skirt", 0.62, 0.68, 0.2, 0.12, "sad", "droop", "sad", "normal", ["normal"], {
    normal: ["{{honorific}}，裙子有点紧。", "请轻一点，{{honorific}}。"],
  }),
  zone("dark-dress", 0.16, 0.62, 0.24, 0.16, "sad", "droop", "sad-dark", "dark", ["dark"], {
    dark: ["……{{name}}，手拿开。", "{{name}}。别拉衣服。"],
  }),
  zone("normal-legs", 0.58, 0.8, 0.18, 0.1, "joyful", "bounce", "joyful", "normal", ["normal"], {
    normal: ["{{honorific}}，这边会痒。", "{{honorific}}……我跳一下。"],
  }),
  zone("dark-legs", 0.22, 0.8, 0.18, 0.1, "angry", "shake", "angry", "dark", ["dark"], {
    dark: ["{{name}}。脚边不行。", "{{name}}，别踩过来。"],
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
  if (form === "duo" && nx >= 0.5) {
    return zone("rest-normal", 0, 0, 0, 0, "happy", "sway", "happy", "normal", ["normal"], {
      normal: ["{{honorific}}，我在。", "嗯，{{honorific}}。"],
    });
  }
  if (form === "duo") {
    return zone("rest-dark", 0, 0, 0, 0, "happy", "sway", "happy", "dark", ["dark"], {
      dark: ["{{name}}。", "在，{{name}}。"],
    });
  }
  const who = form === "dark" ? "dark" : "normal";
  return zone("rest", 0, 0, 0, 0, "happy", "sway", "happy", who, [who], {
    [who]: who === "dark" ? ["{{name}}。", "在，{{name}}。"] : ["{{honorific}}，我在。", "嗯，{{honorific}}。"],
  });
}

export function zonesFor(form: FormId): readonly ClickZone[] {
  if (form === "normal" || form === "dark" || form === "duo") return ZONES[form];
  return [];
}

export function hitZone(form: FormId, nx: number, ny: number): ClickZone | null {
  if (form !== "normal" && form !== "dark" && form !== "duo") return null;
  if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null;
  for (const item of ZONES[form]) {
    if (inside(item, nx, ny)) return item;
  }
  const bounds = form === "dark"
    ? { x: 0.08, y: 0.1, w: 0.84, h: 0.86 }
    : form === "duo"
      ? { x: 0.02, y: 0.22, w: 0.96, h: 0.74 }
      : { x: 0.14, y: 0.1, w: 0.74, h: 0.86 };
  if (!inside({ ...bounds, id: "", emotion: "happy", action: "sway", clip: "happy", primary: "normal", speakers: [], lines: {} }, nx, ny)) {
    return null;
  }
  return restZone(form, nx);
}

export function clickTimeline(clip: string, action: PortraitAction) {
  return cycleTimeline(clip, action, true);
}

export function workTimeline(clip: string, action: PortraitAction) {
  return cycleTimeline(clip, action, false);
}

export function idleTimeline(mood: PetEvent) {
  return idleCycle(mood);
}

export function workPose(form: FormId, mood: PetEvent, darkShare: number): WorkPose | null {
  if (!ILLUSTRATED.has(form)) return null;
  if (mood === "success") return { emotion: "happy", action: "nod", clip: "happy" };
  if (mood !== "error") return null;
  const angry = form === "dark" || (form === "duo" && darkShare >= 50);
  if (angry) return { emotion: "angry", action: "shake", clip: "angry" };
  return { emotion: "sad", action: "droop", clip: "sad" };
}

export const resolveFrame = sequenceFrame;
