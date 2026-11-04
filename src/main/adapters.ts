import { isFormId, type PetEvent } from "../shared/types";

/**
 * Thin adapter map shared by Codex notify, DSH session stubs, and generic webhooks.
 * Unknown names are rejected. Form ids are never accepted as events.
 *
 * v0 has no separate「整理」tier. organizing / settling fold into working.
 * DSH itself is not connected; a future host should POST /pet/events with source "dsh".
 */
const ALIASES: Record<string, PetEvent> = {
  idle: "idle",
  stop: "idle",
  thinking: "thinking",
  think: "thinking",
  thought: "thinking",
  "thought-start": "thinking",
  working: "working",
  work: "working",
  tool: "working",
  "tool-start": "working",
  organizing: "working",
  organize: "working",
  settle: "working",
  settling: "working",
  waiting: "waiting",
  wait: "waiting",
  approval: "waiting",
  "approval-requested": "waiting",
  permission: "waiting",
  success: "success",
  ok: "success",
  done: "success",
  "turn-complete": "success",
  "agent-turn-complete": "success",
  error: "error",
  fail: "error",
  failed: "error",
};

export function normalizeEventKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

export function mapIncomingEvent(raw: string): PetEvent | "form" | null {
  const key = normalizeEventKey(raw);
  if (!key) return null;
  if (isFormId(key)) return "form";
  return ALIASES[key] ?? null;
}
