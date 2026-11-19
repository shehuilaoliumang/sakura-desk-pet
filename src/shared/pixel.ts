import type { FormId, PetEvent, Speaker } from "./types";
import type { ClickZone, PortraitAction, PortraitEmotion, PoseStep, PoseTimeline, WorkPose } from "./portrait";
import { speakTouch } from "./portrait";
import { cycleTimeline, idleCycle, sequenceFrame } from "./frameCycle";

export { speakTouch };

const ILLUSTRATED = new Set<FormId>(["normal", "dark", "duo"]);

/**
 * Motions the 像素Q pack can ask for.
 * Folders that already exist keep their approved frames.
 * normal/dark motion sheets are cut into their own 8-frame clips.
 * Duo still borrows the closest clip when that pose has no duo sheet yet.
 * Sheets still needed are listed in PIXEL_SHEETS_NEEDED and packs/pixel-q/MOTIONS.md.
 */
export const PIXEL_MOTIONS = [
  "idle",
  "happy",
  "joyful",
  "angry",
  "sad",
  "wave",
  "nod",
  "refuse",
  "spin",
  "sit",
  "sleep",
  "stretch",
  "surprise",
  "shy",
  "tease",
  "peek",
  "bite",
  "toss",
  "clap",
  "dance",
  "headpat",
  "think",
  "work",
  "wait",
  "laugh",
] as const;

export type PixelMotion = (typeof PIXEL_MOTIONS)[number] | "sad-dark" | "book" | "lean";

/** Clips that play their own frames when the folder exists. */
export const PIXEL_SHEETS_READY = [
  "idle",
  "happy",
  "joyful",
  "angry",
  "sad",
  "sad-dark",
  "sit",
  "book",
  "lean",
  "wave",
  "nod",
  "refuse",
  "spin",
  "sleep",
  "stretch",
  "surprise",
  "shy",
  "tease",
  "peek",
  "bite",
  "toss",
  "clap",
  "dance",
  "headpat",
  "laugh",
  "think",
  "work",
  "wait",
] as const;

/** Duo think/work/wait still use the standing idle until a duo pose sheet exists. */
export const PIXEL_STAND_IN = ["duo:think", "duo:work", "duo:wait"] as const;

/** Duo pose sheets still missing. Solo sheets for these names are already packed. */
export const PIXEL_SHEETS_NEEDED = [
  "duo:wave",
  "duo:nod",
  "duo:refuse",
  "duo:spin",
  "duo:sleep",
  "duo:stretch",
  "duo:surprise",
  "duo:shy",
  "duo:tease",
  "duo:peek",
  "duo:bite",
  "duo:toss",
  "duo:clap",
  "duo:dance",
  "duo:headpat",
  "duo:laugh",
  "duo:think",
  "duo:work",
  "duo:wait",
] as const;

const ART = new Set<string>([...PIXEL_SHEETS_READY, ...PIXEL_STAND_IN]);

/** Closest approved (or stand-in) folder when the named sheet does not exist yet. */
export const PIXEL_FALLBACK: Record<string, string> = {
  wave: "joyful",
  nod: "happy",
  refuse: "angry",
  spin: "joyful",
  sit: "sad",
  sleep: "sad",
  stretch: "idle",
  surprise: "joyful",
  shy: "happy",
  tease: "happy",
  peek: "idle",
  bite: "happy",
  toss: "joyful",
  clap: "happy",
  dance: "joyful",
  headpat: "happy",
  laugh: "joyful",
  lean: "idle",
  book: "sit",
  think: "idle",
  work: "idle",
  wait: "idle",
};

export type PixelGesture = "click" | "double" | "hold";

export interface PixelReaction {
  id: string;
  form: "normal" | "dark" | "duo";
  gesture: PixelGesture;
  clip: string;
  action: PortraitAction;
  emotion: PortraitEmotion;
  intent: string;
}

type GestureSpec = {
  clip: string;
  action: PortraitAction;
  emotion: PortraitEmotion;
  intent: string;
  lines: ClickZone["lines"];
};

type Part = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  primary: Speaker;
  speakers: Speaker[];
  click: GestureSpec;
  double: GestureSpec;
  hold: GestureSpec;
};

const gestureMap = new Map<string, { click: GestureSpec; double: GestureSpec; hold: GestureSpec }>();

function n(line: string): ClickZone["lines"] {
  return { normal: [line] };
}
function d(line: string): ClickZone["lines"] {
  return { dark: [line] };
}
function both(normalLine: string, darkLine: string): ClickZone["lines"] {
  return { normal: [normalLine], dark: [darkLine] };
}

function g(
  clip: string,
  action: PortraitAction,
  emotion: PortraitEmotion,
  intent: string,
  lines: ClickZone["lines"],
): GestureSpec {
  return { clip, action, emotion, intent, lines };
}

function build(form: "normal" | "dark" | "duo", parts: Part[]): ClickZone[] {
  return parts.map((part) => {
    gestureMap.set(`${form}:${part.id}`, { click: part.click, double: part.double, hold: part.hold });
    const click = part.click;
    return {
      id: part.id,
      x: part.x,
      y: part.y,
      w: part.w,
      h: part.h,
      emotion: click.emotion,
      action: click.action,
      clip: click.clip,
      primary: part.primary,
      speakers: part.speakers,
      lines: click.lines,
    };
  });
}

const solo = (who: Speaker): Speaker[] => [who];

function normalParts(): Part[] {
  const who: Speaker = "normal";
  const sp = solo(who);
  return [
    {
      id: "ribbon", x: 0.64, y: 0.4, w: 0.15, h: 0.11, primary: who, speakers: sp,
      click: g("wave", "bounce", "joyful", "挥动头发上的红结", n("{{honorific}}，蝴蝶结会跟着挥。")),
      double: g("tease", "sway", "happy", "连点就晃结逗人", n("{{honorific}}再点，结要转晕了。")),
      hold: g("headpat", "press", "happy", "按着结，当成摸头", n("{{honorific}}，按着也可以。")),
    },
    {
      id: "hair", x: 0.26, y: 0.31, w: 0.34, h: 0.1, primary: who, speakers: sp,
      click: g("angry", "shake", "angry", "扯头发会生气", n("{{honorific}}，头发会乱的。")),
      double: g("refuse", "shake", "angry", "连扯头发就摇头拒绝", n("{{honorific}}，请别扯。")),
      hold: g("headpat", "press", "happy", "按住头发是摸头", n("{{honorific}}，这样摸就好。")),
    },
    {
      id: "face", x: 0.38, y: 0.42, w: 0.24, h: 0.055, primary: who, speakers: sp,
      click: g("nod", "nod", "happy", "点头答应", n("{{honorific}}，我在。")),
      double: g("shy", "bow", "happy", "盯着脸看就害羞", n("{{honorific}}……这样看着，我会不好意思。")),
      hold: g("sleep", "droop", "sad", "按着额头，打盹", n("{{honorific}}，我先靠一会儿。")),
    },
    {
      id: "eyes", x: 0.4, y: 0.48, w: 0.2, h: 0.045, primary: who, speakers: sp,
      click: g("peek", "sway", "happy", "眼睛左右看", n("{{honorific}}，我在看您。")),
      double: g("surprise", "bounce", "joyful", "戳眼睛旁边会吓一跳", n("{{honorific}}，太近了。")),
      hold: g("shy", "bow", "happy", "捂着眼害羞", n("{{honorific}}，别一直看。")),
    },
    {
      id: "cheek", x: 0.32, y: 0.5, w: 0.08, h: 0.07, primary: who, speakers: sp,
      click: g("shy", "bow", "happy", "碰脸颊", n("{{honorific}}，脸有点热。")),
      double: g("laugh", "bounce", "joyful", "连点脸颊就笑", n("{{honorific}}，好痒。")),
      hold: g("headpat", "press", "happy", "按着脸颊撒娇", n("{{honorific}}，可以再停一下。")),
    },
    {
      id: "mouth", x: 0.44, y: 0.53, w: 0.12, h: 0.04, primary: who, speakers: sp,
      click: g("laugh", "nod", "joyful", "笑一下", n("{{honorific}}，嗯。")),
      double: g("bite", "offer", "happy", "连点就咬苹果", n("{{honorific}}，我咬一小口。")),
      hold: g("shy", "bow", "happy", "捂嘴", n("{{honorific}}，不要说出去。")),
    },
    {
      id: "side-hair", x: 0.21, y: 0.5, w: 0.1, h: 0.16, primary: who, speakers: sp,
      click: g("peek", "sway", "happy", "拨开侧发张望", n("{{honorific}}，这边的头发挡眼。")),
      double: g("refuse", "shake", "angry", "连扯侧发就拒绝", n("{{honorific}}，那边也别扯。")),
      hold: g("headpat", "press", "happy", "顺着侧发摸", n("{{honorific}}，轻一点就好。")),
    },
    {
      id: "apple", x: 0.32, y: 0.575, w: 0.16, h: 0.075, primary: who, speakers: sp,
      click: g("happy", "offer", "happy", "把苹果递出去", n("{{honorific}}，这个苹果分您。")),
      double: g("bite", "offer", "happy", "连点就咬一口", n("{{honorific}}，我先尝一下。")),
      hold: g("toss", "bounce", "joyful", "按住再抛起苹果", n("{{honorific}}，接得住吗。")),
    },
    {
      id: "hands", x: 0.5, y: 0.575, w: 0.14, h: 0.08, primary: who, speakers: sp,
      click: g("clap", "press", "happy", "拍手", n("{{honorific}}，拍拍手。")),
      double: g("tease", "sway", "joyful", "连点手就捉弄", n("{{honorific}}，抓到了。")),
      hold: g("happy", "offer", "happy", "按着手把苹果送上", n("{{honorific}}，给您。")),
    },
    {
      id: "bow", x: 0.4, y: 0.66, w: 0.18, h: 0.045, primary: who, speakers: sp,
      click: g("nod", "bow", "happy", "点头看领结", n("{{honorific}}，领结还端正吗。")),
      double: g("refuse", "shake", "angry", "连拽领结就摇头", n("{{honorific}}，领结不能拆。")),
      hold: g("shy", "bow", "happy", "按着领结低头", n("{{honorific}}，我低头给您看。")),
    },
    {
      id: "chest", x: 0.34, y: 0.71, w: 0.32, h: 0.045, primary: who, speakers: sp,
      click: g("shy", "bow", "happy", "碰马甲就害羞", n("{{honorific}}，马甲有点紧。")),
      double: g("refuse", "shake", "angry", "连点胸口就拒绝", n("{{honorific}}，请往上看。")),
      hold: g("sleep", "droop", "sad", "按着胸口打盹", n("{{honorific}}，让我靠一下。")),
    },
    {
      id: "skirt", x: 0.28, y: 0.76, w: 0.44, h: 0.07, primary: who, speakers: sp,
      click: g("sad", "droop", "sad", "碰到裙子会低头", n("{{honorific}}，裙子不要拉。")),
      double: g("refuse", "shake", "angry", "连拉裙子就拒绝", n("{{honorific}}，请松手。")),
      hold: g("sit", "droop", "sad", "按着裙摆坐下", n("{{honorific}}，那我坐下。")),
    },
    {
      id: "legs", x: 0.36, y: 0.84, w: 0.28, h: 0.05, primary: who, speakers: sp,
      click: g("joyful", "bounce", "joyful", "跳一下", n("{{honorific}}，我跳一下。")),
      double: g("dance", "bounce", "joyful", "连点就跳舞", n("{{honorific}}，一起转吗。")),
      hold: g("stretch", "sway", "happy", "按着腿伸懒腰", n("{{honorific}}，伸个懒腰。")),
    },
    {
      id: "feet", x: 0.36, y: 0.9, w: 0.28, h: 0.04, primary: who, speakers: sp,
      click: g("joyful", "bounce", "joyful", "跺脚跳", n("{{honorific}}，脚边有点痒。")),
      double: g("dance", "bounce", "joyful", "连点脚就跳舞", n("{{honorific}}，那再跳一圈。")),
      hold: g("peek", "sway", "happy", "按着鞋尖，探头看", n("{{honorific}}，我看看地面。")),
    },
  ];
}

function darkParts(): Part[] {
  const who: Speaker = "dark";
  const sp = solo(who);
  return [
    {
      id: "ribbon", x: 0.62, y: 0.31, w: 0.16, h: 0.1, primary: who, speakers: sp,
      click: g("wave", "bounce", "joyful", "挥红结", d("{{name}}，这个结不许拆。")),
      double: g("tease", "sway", "happy", "连点就晃结", d("{{name}}，看够了再晃。")),
      hold: g("headpat", "press", "happy", "按着结", d("{{name}}，按着就行。")),
    },
    {
      id: "hair", x: 0.28, y: 0.3, w: 0.3, h: 0.1, primary: who, speakers: sp,
      click: g("angry", "shake", "angry", "扯头发会生气", d("{{name}}，头发别扯。")),
      double: g("refuse", "shake", "angry", "连扯就拒绝", d("{{name}}，松手。")),
      hold: g("headpat", "press", "happy", "顺着头发摸", d("{{name}}，只许这样。")),
    },
    {
      id: "face", x: 0.4, y: 0.41, w: 0.2, h: 0.05, primary: who, speakers: sp,
      click: g("nod", "nod", "happy", "点头", d("{{name}}。我在。")),
      double: g("shy", "bow", "happy", "盯脸就别开眼", d("{{name}}，看够了吗。")),
      hold: g("sleep", "droop", "sad", "按额头，闭眼", d("{{name}}，安静一会儿。")),
    },
    {
      id: "eyes", x: 0.42, y: 0.465, w: 0.16, h: 0.04, primary: who, speakers: sp,
      click: g("peek", "sway", "happy", "红眼左右看", d("{{name}}，我看着你。")),
      double: g("surprise", "bounce", "joyful", "戳近了会瞪眼", d("{{name}}，太近。")),
      hold: g("shy", "bow", "happy", "按着眼低头", d("{{name}}，别一直盯。")),
    },
    {
      id: "cheek", x: 0.36, y: 0.49, w: 0.07, h: 0.06, primary: who, speakers: sp,
      click: g("shy", "bow", "happy", "碰脸颊", d("{{name}}，轻一点。")),
      double: g("laugh", "bounce", "joyful", "连点就笑出声", d("{{name}}，痒。")),
      hold: g("headpat", "press", "happy", "按着脸颊", d("{{name}}，可以停一下。")),
    },
    {
      id: "mouth", x: 0.45, y: 0.51, w: 0.1, h: 0.035, primary: who, speakers: sp,
      click: g("laugh", "nod", "joyful", "冷脸松一下", d("{{name}}，嗯。")),
      double: g("bite", "offer", "happy", "连点就咬苹果", d("{{name}}，我咬一口。")),
      hold: g("shy", "bow", "happy", "捂嘴", d("{{name}}，这话到此。")),
    },
    {
      id: "side-hair", x: 0.2, y: 0.46, w: 0.12, h: 0.18, primary: who, speakers: sp,
      click: g("peek", "sway", "happy", "从白发后面看", d("{{name}}，挡着也看得见。")),
      double: g("refuse", "shake", "angry", "连扯白发就拒绝", d("{{name}}，右边左边都不行。")),
      hold: g("headpat", "press", "happy", "顺着长发摸", d("{{name}}，顺着摸。")),
    },
    {
      id: "apple", x: 0.4, y: 0.555, w: 0.15, h: 0.075, primary: who, speakers: sp,
      click: g("happy", "offer", "happy", "把苹果送上", d("{{name}}，看可以，拿走不行。")),
      double: g("bite", "offer", "happy", "连点就咬", d("{{name}}，我先咬。")),
      hold: g("toss", "bounce", "joyful", "抛起苹果", d("{{name}}，接住。")),
    },
    {
      id: "hands", x: 0.34, y: 0.56, w: 0.08, h: 0.07, primary: who, speakers: sp,
      click: g("clap", "press", "happy", "拍手", d("{{name}}，拍一下就好。")),
      double: g("tease", "sway", "joyful", "连点手就捉", d("{{name}}，抓住了。")),
      hold: g("happy", "offer", "happy", "按着手递苹果", d("{{name}}，拿去看，别拿走。")),
    },
    {
      id: "collar", x: 0.42, y: 0.64, w: 0.16, h: 0.045, primary: who, speakers: sp,
      click: g("nod", "bow", "happy", "看领口", d("{{name}}，领结还在。")),
      double: g("refuse", "shake", "angry", "连拽领口就拒绝", d("{{name}}，这里不行。")),
      hold: g("shy", "bow", "happy", "按着领口低头", d("{{name}}，只给你看一眼。")),
    },
    {
      id: "chest", x: 0.36, y: 0.69, w: 0.28, h: 0.045, primary: who, speakers: sp,
      click: g("shy", "bow", "happy", "碰礼服胸口", d("{{name}}，别按这里。")),
      double: g("refuse", "shake", "angry", "连点就赶开", d("{{name}}，松手。")),
      hold: g("sleep", "droop", "sad", "按着胸口安静", d("{{name}}，安静。")),
    },
    {
      id: "dress", x: 0.22, y: 0.74, w: 0.56, h: 0.08, primary: who, speakers: sp,
      click: g("sad", "droop", "sad", "拉到裙摆会沉下去", d("{{name}}，别拉衣服。")),
      double: g("refuse", "shake", "angry", "连拉礼服就拒绝", d("{{name}}，放开裙子。")),
      hold: g("sit", "droop", "sad", "按着裙摆坐下", d("{{name}}，那我坐下。")),
    },
    {
      id: "legs", x: 0.38, y: 0.84, w: 0.24, h: 0.05, primary: who, speakers: sp,
      click: g("joyful", "bounce", "joyful", "跳一下", d("{{name}}，我跳。")),
      double: g("dance", "bounce", "joyful", "连点就转圈", d("{{name}}，再转一圈。")),
      hold: g("stretch", "sway", "happy", "伸懒腰", d("{{name}}，伸一下。")),
    },
    {
      id: "feet", x: 0.38, y: 0.9, w: 0.24, h: 0.04, primary: who, speakers: sp,
      click: g("joyful", "bounce", "joyful", "跺脚", d("{{name}}，别踩过来。")),
      double: g("dance", "bounce", "joyful", "连点脚尖就跳舞", d("{{name}}，跳完了。")),
      hold: g("peek", "sway", "happy", "低头看鞋", d("{{name}}，鞋还在。")),
    },
  ];
}

function duoParts(): Part[] {
  const darkWho: Speaker = "dark";
  const normalWho: Speaker = "normal";
  return [
    {
      id: "dark-ribbon", x: 0.46, y: 0.29, w: 0.08, h: 0.07, primary: darkWho, speakers: [darkWho],
      click: g("wave", "bounce", "joyful", "黑樱挥头顶的结", d("{{name}}，这个结不许拆。")),
      double: g("tease", "sway", "happy", "连点红结", d("{{name}}，再点我就晃。")),
      hold: g("headpat", "press", "happy", "按着黑樱的结", d("{{name}}，按着就行。")),
    },
    {
      id: "dark-hair", x: 0.2, y: 0.3, w: 0.09, h: 0.14, primary: darkWho, speakers: [darkWho],
      click: g("angry", "shake", "angry", "扯头发会生气", d("{{name}}，头发别碰。")),
      double: g("refuse", "shake", "angry", "连扯就挡在前面", d("{{name}}，松手。")),
      hold: g("headpat", "press", "happy", "顺着白发摸", d("{{name}}，只摸头发。")),
    },
    {
      id: "dark-face", x: 0.3, y: 0.4, w: 0.12, h: 0.05, primary: darkWho, speakers: [darkWho],
      click: g("nod", "nod", "happy", "黑樱点头", d("{{name}}，看这边做什么。")),
      double: g("shy", "bow", "happy", "盯着黑樱的脸", d("{{name}}，看够了吗。")),
      hold: g("sleep", "droop", "sad", "按着黑樱的额头", d("{{name}}，安静。")),
    },
    {
      id: "dark-eyes", x: 0.3, y: 0.45, w: 0.1, h: 0.04, primary: darkWho, speakers: [darkWho],
      click: g("peek", "sway", "happy", "黑樱左右看", d("{{name}}，我看着。")),
      double: g("surprise", "bounce", "joyful", "戳到黑樱眼前", d("{{name}}，太近。")),
      hold: g("shy", "bow", "happy", "黑樱别开眼", d("{{name}}，别盯着。")),
    },
    {
      id: "dark-cheek", x: 0.26, y: 0.46, w: 0.05, h: 0.05, primary: darkWho, speakers: [darkWho],
      click: g("shy", "bow", "happy", "碰黑樱的脸颊", d("{{name}}，轻一点。")),
      double: g("laugh", "bounce", "joyful", "连点黑樱的脸", d("{{name}}，痒。")),
      hold: g("headpat", "press", "happy", "按着黑樱的脸", d("{{name}}，就一下。")),
    },
    {
      id: "normal-ribbon", x: 0.7, y: 0.45, w: 0.09, h: 0.07, primary: normalWho, speakers: [normalWho],
      click: g("wave", "bounce", "joyful", "常态樱挥蝴蝶结", n("{{honorific}}，蝴蝶结还在。")),
      double: g("tease", "sway", "happy", "连点常态樱的结", n("{{honorific}}，结要转了。")),
      hold: g("headpat", "press", "happy", "按着常态樱的结", n("{{honorific}}，按着也可以。")),
    },
    {
      id: "normal-hair", x: 0.58, y: 0.34, w: 0.12, h: 0.1, primary: normalWho, speakers: [normalWho],
      click: g("shy", "bow", "happy", "碰常态樱的头发", n("{{honorific}}，头发会乱。")),
      double: g("refuse", "shake", "angry", "连扯紫发", n("{{honorific}}，请别扯。")),
      hold: g("headpat", "press", "happy", "摸常态樱的头", n("{{honorific}}，这样就好。")),
    },
    {
      id: "normal-face", x: 0.6, y: 0.44, w: 0.1, h: 0.05, primary: normalWho, speakers: [normalWho],
      click: g("nod", "nod", "happy", "常态樱点头", n("{{honorific}}，我在。")),
      double: g("shy", "bow", "happy", "盯着常态樱", n("{{honorific}}……我会不好意思。")),
      hold: g("sleep", "droop", "sad", "按着常态樱的额头", n("{{honorific}}，我靠一下。")),
    },
    {
      id: "normal-eyes", x: 0.62, y: 0.49, w: 0.08, h: 0.04, primary: normalWho, speakers: [normalWho],
      click: g("peek", "sway", "happy", "常态樱张望", n("{{honorific}}，我在看您。")),
      double: g("surprise", "bounce", "joyful", "戳到常态樱眼前", n("{{honorific}}，太近了。")),
      hold: g("shy", "bow", "happy", "常态樱闭上眼", n("{{honorific}}，别一直看。")),
    },
    {
      id: "cheek", x: 0.5, y: 0.46, w: 0.08, h: 0.06, primary: normalWho, speakers: [normalWho, darkWho],
      click: g("shy", "press", "happy", "两人挨着的脸颊", both("{{honorific}}，脸有点热。", "{{name}}，轻一点。")),
      double: g("laugh", "bounce", "joyful", "连点中间就一起笑", both("{{honorific}}，好痒。", "{{name}}，别闹。")),
      hold: g("headpat", "press", "happy", "按在两人中间", both("{{honorific}}，我们都在。", "{{name}}，就一下。")),
    },
    {
      id: "normal-cheek", x: 0.72, y: 0.54, w: 0.06, h: 0.05, primary: normalWho, speakers: [normalWho],
      click: g("shy", "bow", "happy", "碰常态樱的脸颊", n("{{honorific}}，脸有点热。")),
      double: g("laugh", "bounce", "joyful", "连点就笑", n("{{honorific}}，好痒。")),
      hold: g("headpat", "press", "happy", "按着常态樱的脸", n("{{honorific}}，可以再停一下。")),
    },
    {
      id: "dark-hand", x: 0.4, y: 0.56, w: 0.07, h: 0.06, primary: darkWho, speakers: [darkWho],
      click: g("clap", "press", "happy", "黑樱拍手", d("{{name}}，手是温的。")),
      double: g("tease", "sway", "joyful", "连点黑樱的手", d("{{name}}，抓住了。")),
      hold: g("lean", "sway", "happy", "按着手，黑樱靠过来", d("{{name}}，靠一下。")),
    },
    {
      id: "normal-hand", x: 0.56, y: 0.58, w: 0.07, h: 0.06, primary: normalWho, speakers: [normalWho],
      click: g("clap", "press", "happy", "常态樱拍手", n("{{honorific}}，拍拍手。")),
      double: g("tease", "sway", "joyful", "连点常态樱的手", n("{{honorific}}，抓到了。")),
      hold: g("happy", "offer", "happy", "按着手把苹果递上", n("{{honorific}}，给您。")),
    },
    {
      id: "apple", x: 0.47, y: 0.58, w: 0.1, h: 0.07, primary: normalWho, speakers: [normalWho, darkWho],
      click: g("happy", "offer", "happy", "两人一起递苹果", both("{{honorific}}要的话，可以分您。", "{{name}}，看可以。")),
      double: g("bite", "offer", "happy", "连点，两人抢着咬", both("{{honorific}}，我咬一小口。", "{{name}}，我先咬。")),
      hold: g("toss", "bounce", "joyful", "按住再把苹果抛起", both("{{honorific}}，接得住吗。", "{{name}}，接住。")),
    },
    {
      id: "normal-bow", x: 0.58, y: 0.64, w: 0.08, h: 0.04, primary: normalWho, speakers: [normalWho],
      click: g("nod", "bow", "happy", "看常态樱的领结", n("{{honorific}}，领结歪了吗。")),
      double: g("refuse", "shake", "angry", "连拽领结", n("{{honorific}}，不能拆。")),
      hold: g("shy", "bow", "happy", "按着领结", n("{{honorific}}，我给您看。")),
    },
    {
      id: "dark-dress", x: 0.2, y: 0.66, w: 0.22, h: 0.1, primary: darkWho, speakers: [darkWho],
      click: g("sad", "droop", "sad", "拉黑樱的礼服", d("{{name}}，别拉衣服。")),
      double: g("refuse", "shake", "angry", "连拉就挡住", d("{{name}}，放开。")),
      hold: g("book", "droop", "sad", "按着裙摆，坐下翻书", d("{{name}}，那我们看书。")),
    },
    {
      id: "normal-skirt", x: 0.6, y: 0.68, w: 0.16, h: 0.08, primary: normalWho, speakers: [normalWho],
      click: g("sad", "droop", "sad", "碰到常态樱的裙子", n("{{honorific}}，裙子不要拉。")),
      double: g("refuse", "shake", "angry", "连拉裙子", n("{{honorific}}，请松手。")),
      hold: g("sit", "droop", "sad", "按着裙摆坐下", n("{{honorific}}，那我坐下。")),
    },
    {
      id: "book", x: 0.42, y: 0.74, w: 0.16, h: 0.06, primary: normalWho, speakers: [normalWho, darkWho],
      click: g("book", "droop", "happy", "坐下打开发光的书", both("{{honorific}}，我们看书。", "{{name}}，你也看。")),
      double: g("laugh", "bounce", "joyful", "连点书页就笑", both("{{honorific}}，这一页很好笑。", "{{name}}，别抢页。")),
      hold: g("sleep", "droop", "sad", "按着书打盹", both("{{honorific}}，我看着看着困了。", "{{name}}，安静看书。")),
    },
    {
      id: "dark-legs", x: 0.24, y: 0.84, w: 0.14, h: 0.05, primary: darkWho, speakers: [darkWho],
      click: g("joyful", "bounce", "joyful", "黑樱跳一下", d("{{name}}，脚边不行。")),
      double: g("dance", "bounce", "joyful", "连点就带着转", d("{{name}}，转一圈。")),
      hold: g("stretch", "sway", "happy", "黑樱伸懒腰", d("{{name}}，伸一下。")),
    },
    {
      id: "normal-legs", x: 0.58, y: 0.82, w: 0.14, h: 0.05, primary: normalWho, speakers: [normalWho],
      click: g("joyful", "bounce", "joyful", "常态樱跳一下", n("{{honorific}}，我跳一下。")),
      double: g("dance", "bounce", "joyful", "连点就跳舞", n("{{honorific}}，再跳一圈。")),
      hold: g("stretch", "sway", "happy", "常态樱伸懒腰", n("{{honorific}}，伸个懒腰。")),
    },
    {
      id: "dark-feet", x: 0.24, y: 0.9, w: 0.12, h: 0.04, primary: darkWho, speakers: [darkWho],
      click: g("peek", "sway", "happy", "黑樱看看鞋", d("{{name}}，鞋还在。")),
      double: g("dance", "bounce", "joyful", "连点鞋尖", d("{{name}}，跳完了。")),
      hold: g("lean", "sway", "happy", "按着鞋，黑樱侧身", d("{{name}}，我挡着。")),
    },
    {
      id: "normal-feet", x: 0.6, y: 0.9, w: 0.12, h: 0.04, primary: normalWho, speakers: [normalWho],
      click: g("joyful", "bounce", "joyful", "常态樱跺脚", n("{{honorific}}，脚边有点痒。")),
      double: g("dance", "bounce", "joyful", "连点就转", n("{{honorific}}，再转一下。")),
      hold: g("peek", "sway", "happy", "低头看鞋", n("{{honorific}}，我看看。")),
    },
  ];
}

const ZONES: Record<"normal" | "dark" | "duo", ClickZone[]> = {
  normal: build("normal", normalParts()),
  dark: build("dark", darkParts()),
  duo: build("duo", duoParts()),
};

function inside(zoneHit: ClickZone, nx: number, ny: number): boolean {
  return nx >= zoneHit.x && ny >= zoneHit.y && nx < zoneHit.x + zoneHit.w && ny < zoneHit.y + zoneHit.h;
}

function restZone(form: "normal" | "dark" | "duo", nx: number): ClickZone {
  if (form === "duo" && nx >= 0.5) {
    return {
      id: "rest-normal", x: 0, y: 0, w: 0, h: 0, emotion: "happy", action: "sway", clip: "happy", primary: "normal", speakers: ["normal"],
      lines: n("{{honorific}}，我在。"),
    };
  }
  if (form === "duo") {
    return {
      id: "rest-dark", x: 0, y: 0, w: 0, h: 0, emotion: "happy", action: "sway", clip: "happy", primary: "dark", speakers: ["dark"],
      lines: d("{{name}}。"),
    };
  }
  const who = form === "dark" ? "dark" : "normal";
  return {
    id: "rest", x: 0, y: 0, w: 0, h: 0, emotion: "happy", action: "sway", clip: "happy", primary: who, speakers: [who],
    lines: who === "dark" ? d("{{name}}。") : n("{{honorific}}，我在。"),
  };
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
    ? { x: 0.16, y: 0.26, w: 0.68, h: 0.7 }
    : form === "duo"
      ? { x: 0.16, y: 0.24, w: 0.68, h: 0.72 }
      : { x: 0.18, y: 0.28, w: 0.64, h: 0.68 };
  if (!inside({ ...bounds, id: "", emotion: "happy", action: "sway", clip: "happy", primary: "normal", speakers: [], lines: {} }, nx, ny)) {
    return null;
  }
  return restZone(form, nx);
}

export function reactionsFor(form: "normal" | "dark" | "duo"): PixelReaction[] {
  const gestures: PixelGesture[] = ["click", "double", "hold"];
  const rows: PixelReaction[] = [];
  for (const zone of ZONES[form]) {
    const stored = gestureMap.get(`${form}:${zone.id}`);
    if (!stored) continue;
    for (const gesture of gestures) {
      const spec = stored[gesture];
      rows.push({
        id: zone.id,
        form,
        gesture,
        clip: spec.clip,
        action: spec.action,
        emotion: spec.emotion,
        intent: spec.intent,
      });
    }
  }
  return rows;
}

export function gestureZone(form: FormId, zoneHit: ClickZone, gesture: PixelGesture): ClickZone {
  if (form !== "normal" && form !== "dark" && form !== "duo") return zoneHit;
  const stored = gestureMap.get(`${form}:${zoneHit.id}`);
  if (!stored || gesture === "click") return zoneHit;
  const spec = stored[gesture];
  return { ...zoneHit, clip: spec.clip, action: spec.action, emotion: spec.emotion, lines: spec.lines };
}

function step(clip: string, index: number, ms: number, x = 0, y = 0, rot = 0, scale = 1): PoseStep {
  return { clip, index, ms, x, y, rot, scale };
}

/** Bigger than the 立绘 pose nudges, played over the closest approved frames. */
function exaggerated(clip: string): PoseTimeline {
  const frames = ({
    wave: [[-6, -2, -8, 1], [8, -4, 10, 1.02], [-8, -2, -12, 1], [10, -4, 14, 1.03], [-6, 0, -8, 1], [6, -2, 8, 1.02], [0, 0, 0, 1], [0, 0, 0, 1]],
    nod: [[0, 2, 4, 1], [0, 6, 10, 0.98], [0, 9, 14, 0.96], [0, 4, 6, 0.99], [0, -2, -4, 1.02], [0, 7, 12, 0.97], [0, 2, 3, 1], [0, 0, 0, 1]],
    refuse: [[-8, 0, -10, 1], [9, 0, 12, 1], [-10, 0, -14, 1], [10, 0, 14, 1], [-7, 0, -8, 1], [6, 0, 8, 1], [0, 0, 0, 1], [0, 0, 0, 1]],
    spin: [[0, 0, 0, 1], [0, -4, 50, 1.02], [0, -8, 110, 1.04], [0, -10, 170, 1.04], [0, -8, 230, 1.03], [0, -4, 290, 1.02], [0, 0, 340, 1], [0, 0, 360, 1]],
    sit: [[0, 2, 0, 0.99], [0, 6, 2, 0.97], [0, 10, 3, 0.95], [0, 14, 4, 0.93], [0, 16, 4, 0.92], [0, 14, 3, 0.94], [0, 10, 2, 0.96], [0, 8, 0, 0.97]],
    sleep: [[0, 4, 4, 0.98], [0, 8, 8, 0.95], [0, 10, 10, 0.94], [0, 10, 8, 0.94], [0, 10, 10, 0.94], [0, 8, 6, 0.95], [0, 6, 4, 0.96], [0, 6, 4, 0.96]],
    stretch: [[0, -2, -2, 1.02], [0, -8, -4, 1.06], [0, -12, 0, 1.1], [2, -8, 4, 1.06], [0, -2, 0, 1.02], [0, -6, -2, 1.04], [0, 0, 0, 1], [0, 0, 0, 1]],
    surprise: [[0, 0, 0, 1], [0, -8, -4, 1.06], [0, -14, 0, 1.12], [0, -10, 3, 1.08], [0, -4, 0, 1.04], [0, -8, -2, 1.06], [0, -2, 0, 1.02], [0, 0, 0, 1]],
    shy: [[2, 2, 6, 0.99], [3, 4, 10, 0.97], [4, 5, 14, 0.96], [3, 4, 10, 0.97], [2, 3, 6, 0.98], [3, 4, 8, 0.97], [1, 2, 3, 0.99], [0, 0, 0, 1]],
    tease: [[-6, -2, -8, 1.02], [7, -4, 10, 1.04], [-5, -2, -6, 1.02], [8, -5, 12, 1.05], [-4, 0, -4, 1], [5, -2, 6, 1.03], [0, 0, 0, 1], [0, 0, 0, 1]],
    peek: [[0, 0, 0, 1], [-8, 0, -4, 1], [-12, -2, -6, 1.02], [-6, 0, -2, 1], [8, -2, 4, 1.02], [12, 0, 6, 1], [4, 0, 2, 1], [0, 0, 0, 1]],
    bite: [[0, 2, 0, 1], [0, 6, 2, 1.03], [0, 10, 0, 1.06], [0, 12, -2, 1.08], [0, 8, 0, 1.04], [0, 4, 0, 1.02], [0, 2, 0, 1], [0, 0, 0, 1]],
    toss: [[0, 0, 0, 1], [0, -8, 0, 1.04], [0, -16, 4, 1.08], [0, -22, 0, 1.12], [0, -12, -4, 1.06], [0, -4, 0, 1.02], [0, 3, 0, 0.98], [0, 0, 0, 1]],
    clap: [[-3, 0, 0, 1], [0, -2, 0, 1.06], [3, 0, 0, 0.98], [0, -3, 0, 1.08], [-2, 0, 0, 0.98], [2, -2, 0, 1.05], [0, 0, 0, 1], [0, 0, 0, 1]],
    dance: [[-6, -4, -12, 1.02], [8, -10, 14, 1.06], [-8, -4, -16, 1.02], [8, -12, 16, 1.08], [-4, -2, -8, 1], [6, -8, 10, 1.04], [0, -2, 0, 1], [0, 0, 0, 1]],
    headpat: [[0, 3, 2, 0.99], [0, 6, 4, 0.97], [0, 4, 2, 0.98], [0, 7, 5, 0.96], [0, 3, 2, 0.98], [0, 2, 1, 0.99], [0, 1, 0, 1], [0, 0, 0, 1]],
    laugh: [[0, -3, -4, 1.02], [0, 2, 5, 1], [0, -5, -6, 1.04], [0, 2, 6, 1], [0, -4, -4, 1.03], [0, 1, 3, 1], [0, -2, 0, 1.01], [0, 0, 0, 1]],
    lean: [[0, 0, 0, 1], [4, 2, 8, 1], [8, 3, 14, 1.01], [10, 4, 16, 1.02], [8, 3, 12, 1], [4, 2, 6, 1], [2, 1, 2, 1], [0, 0, 0, 1]],
  } as Record<string, Array<[number, number, number, number]>>)[clip] ?? [[0, -4, 0, 1.04], [0, -8, 0, 1.08], [0, 2, 0, 0.98], [0, -6, 0, 1.05], [0, 0, 0, 1], [0, -4, 0, 1.03], [0, 0, 0, 1], [0, 0, 0, 1]];
  const steps = frames.map(([x, y, rot, scale], index) => step(clip, index, index === frames.length - 1 ? 1400 : 90, x, y, rot, scale));
  return { steps, repeatFrom: null };
}

export function clickTimeline(clip: string, action: PortraitAction): PoseTimeline {
  if (ART.has(clip)) return cycleTimeline(clip, action, true);
  return exaggerated(clip);
}

export function workTimeline(clip: string, action: PortraitAction): PoseTimeline {
  if (ART.has(clip)) return cycleTimeline(clip, action, false);
  const once = exaggerated(clip);
  return { steps: once.steps.map((item) => ({ ...item, ms: 120 })), repeatFrom: 0 };
}

function ownClip(clip: string, ms: number): PoseTimeline {
  return {
    steps: Array.from({ length: 8 }, (_, index) => step(clip, index, ms)),
    repeatFrom: 0,
  };
}

export function idleTimeline(mood: PetEvent): PoseTimeline {
  if (mood === "thinking") return ownClip("think", 188);
  if (mood === "working") return ownClip("work", 96);
  if (mood === "waiting") return ownClip("wait", 220);
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

export function resolveFrame(library: Record<string, string[]> | undefined, pose: PoseStep): string | null {
  if (!library) return null;
  const own = library[pose.clip];
  if (own?.length) return own[Math.min(pose.index, own.length - 1)] ?? null;
  const via = PIXEL_FALLBACK[pose.clip];
  const alt = via ? library[via] : undefined;
  if (alt?.length) return alt[Math.min(pose.index, alt.length - 1)] ?? null;
  return sequenceFrame(library, pose);
}

export const PIXEL_AMBIENT = ["stretch", "peek", "sit", "joyful"] as const;
