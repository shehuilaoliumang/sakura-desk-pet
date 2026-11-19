import type { FormId, PetEvent, Settings, Speaker } from "./types";
import {
  clickTimeline as portraitClick,
  hitZone as portraitHit,
  idleTimeline as portraitIdle,
  resolveFrame as portraitFrame,
  speakTouch as portraitSpeak,
  workPose as portraitWorkPose,
  workTimeline as portraitWork,
  zonesFor as portraitZones,
  type ClickZone,
  type PoseTimeline,
  type WorkPose,
} from "./portrait";
import {
  clickTimeline as pixelClick,
  hitZone as pixelHit,
  idleTimeline as pixelIdle,
  resolveFrame as pixelFrame,
  speakTouch as pixelSpeak,
  workPose as pixelWorkPose,
  workTimeline as pixelWork,
  zonesFor as pixelZones,
} from "./pixel";
import { cycleTimeline, idleCycle, sequenceFrame } from "./frameCycle";

export interface StylePlay {
  id: string;
  zonesFor: (form: FormId) => readonly ClickZone[];
  hitZone: (form: FormId, nx: number, ny: number) => ClickZone | null;
  clickTimeline: (clip: string, action: ClickZone["action"]) => PoseTimeline;
  workTimeline: (clip: string, action: ClickZone["action"]) => PoseTimeline;
  idleTimeline: (mood: PetEvent) => PoseTimeline;
  workPose: (form: FormId, mood: PetEvent, darkShare: number) => WorkPose | null;
  speakTouch: typeof portraitSpeak;
  resolveFrame: typeof portraitFrame;
}

const registry = new Map<string, StylePlay>();

export function registerStylePlay(play: StylePlay): void {
  registry.set(play.id, play);
}

registerStylePlay({
  id: "portrait",
  zonesFor: portraitZones,
  hitZone: portraitHit,
  clickTimeline: portraitClick,
  workTimeline: portraitWork,
  idleTimeline: portraitIdle,
  workPose: portraitWorkPose,
  speakTouch: portraitSpeak,
  resolveFrame: portraitFrame,
});

registerStylePlay({
  id: "pixel-q",
  zonesFor: pixelZones,
  hitZone: pixelHit,
  clickTimeline: pixelClick,
  workTimeline: pixelWork,
  idleTimeline: pixelIdle,
  workPose: pixelWorkPose,
  speakTouch: pixelSpeak,
  resolveFrame: pixelFrame,
});

const genericCache = new Map<string, StylePlay>();

function genericZone(form: FormId, nx: number): ClickZone {
  const who: Speaker = form === "dark" || (form === "duo" && nx < 0.5) ? "dark" : "normal";
  const both = form === "duo" && nx > 0.42 && nx < 0.58;
  const speakers: Speaker[] = both ? ["normal", "dark"] : [who];
  return {
    id: both ? "shared" : who,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    emotion: "happy",
    action: "sway",
    clip: "happy",
    primary: who,
    speakers,
    lines: {
      normal: ["{{honorific}}，我在。", "嗯，{{honorific}}。"],
      dark: ["{{name}}。", "在，{{name}}。"],
    },
  };
}

/** A style with no dedicated module still bobs through its frame folders and answers a click. */
function genericPlay(id: string): StylePlay {
  const cached = genericCache.get(id);
  if (cached) return cached;
  const play: StylePlay = {
    id,
    zonesFor: () => [],
    hitZone: (form, nx, ny) => {
      if (form !== "normal" && form !== "dark" && form !== "duo") return null;
      if (nx < 0.08 || ny < 0.06 || nx > 0.92 || ny > 0.96) return null;
      return genericZone(form, nx);
    },
    clickTimeline: (clip, action) => cycleTimeline(clip, action, true),
    workTimeline: (clip, action) => cycleTimeline(clip, action, false),
    idleTimeline: idleCycle,
    workPose: (form, mood, darkShare) => {
      if (form !== "normal" && form !== "dark" && form !== "duo") return null;
      if (mood === "success") return { emotion: "happy", action: "nod", clip: "happy" };
      if (mood !== "error") return null;
      const angry = form === "dark" || (form === "duo" && darkShare >= 50);
      if (angry) return { emotion: "angry", action: "shake", clip: "angry" };
      return { emotion: "sad", action: "droop", clip: "sad" };
    },
    speakTouch: (settings: Settings, zoneHit: ClickZone, pick: number) => portraitSpeak(settings, zoneHit, pick),
    resolveFrame: sequenceFrame,
  };
  genericCache.set(id, play);
  return play;
}

export function playFor(styleId: string | null | undefined): StylePlay {
  if (!styleId || styleId === "portrait") return registry.get("portrait")!;
  return registry.get(styleId) ?? genericPlay(styleId);
}
