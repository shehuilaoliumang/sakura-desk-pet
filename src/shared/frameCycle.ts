import type { PetEvent } from "./types";
import type { PortraitAction, PoseStep, PoseTimeline } from "./portrait";

/** Short cycles. A pack with fewer files still plays: the resolver clamps the index. */
export const CYCLE_FRAMES = 8;

function step(clip: string, index: number, ms: number): PoseStep {
  return { clip, index, ms, x: 0, y: 0, rot: 0, scale: 1 };
}

const PACE: Record<PortraitAction, number> = {
  shake: 70,
  bounce: 78,
  droop: 120,
  nod: 90,
  bow: 100,
  offer: 90,
  press: 96,
  sway: 110,
};

/** Frame motion lives in the pictures. These steps do not nudge the sprite in CSS. */
export function cycleTimeline(clip: string, action: PortraitAction, once: boolean): PoseTimeline {
  const pace = PACE[action] ?? 90;
  const steps = Array.from({ length: CYCLE_FRAMES }, (_, index) => step(clip, index, pace));
  if (once) {
    const last = CYCLE_FRAMES - 1;
    steps[last] = step(clip, last, 1500);
    return { steps, repeatFrom: null };
  }
  return { steps, repeatFrom: 0 };
}

export function idleCycle(mood: PetEvent): PoseTimeline {
  const pace = mood === "working" ? 0.7 : mood === "thinking" ? 1.35 : mood === "waiting" ? 1.5 : 1;
  return {
    steps: Array.from({ length: CYCLE_FRAMES }, (_, index) => {
      const blink = index === 2 || index === 6;
      return step("idle", index, Math.round((blink ? 90 : 140) * pace));
    }),
    repeatFrom: 0,
  };
}

export function sequenceFrame(library: Record<string, string[]> | undefined, pose: PoseStep): string | null {
  if (!library) return null;
  const own = library[pose.clip];
  if (own?.length) return own[Math.min(pose.index, own.length - 1)] ?? null;
  const idle = library.idle;
  if (!idle?.length) return null;
  return idle[Math.min(pose.index, idle.length - 1)] ?? null;
}
