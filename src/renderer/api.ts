import type { ConfigResponse, FormId, Settings } from "@shared/types";

const userHeaders = {
  "content-type": "application/json",
  "x-sakura-user": "1",
};

export function openSettings(): void {
  if (window.sakuraPet) window.sakuraPet.openSettings();
  else window.location.hash = "#/settings";
}

export function quitApp(): void {
  window.sakuraPet?.quit();
}

export function reveal(target: "settings" | "pack"): void {
  window.sakuraPet?.reveal(target);
}

export async function putSettings(settings: Settings): Promise<ConfigResponse | { ok: false; reason?: string; issues?: string[] }> {
  const response = await fetch("/pet/config", {
    method: "PUT",
    headers: userHeaders,
    body: JSON.stringify({
      ...settings,
      window: { ...settings.window, x: null, y: null },
    }),
  });
  return response.json() as Promise<ConfigResponse | { ok: false; reason?: string; issues?: string[] }>;
}


export async function putWindowScale(scale: number): Promise<ConfigResponse | { ok: false; reason?: string; issues?: string[] }> {
  const response = await fetch("/pet/config", {
    method: "PUT",
    headers: userHeaders,
    body: JSON.stringify({ window: { scale } }),
  });
  return response.json() as Promise<ConfigResponse | { ok: false; reason?: string; issues?: string[] }>;
}
export async function postForm(form: FormId): Promise<{ ok: boolean; activeForm?: FormId; reason?: string }> {
  const response = await fetch("/pet/form", {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({ form }),
  });
  return response.json() as Promise<{ ok: boolean; activeForm?: FormId; reason?: string }>;
}

export async function postReset(): Promise<ConfigResponse | { ok: false; reason?: string }> {
  const response = await fetch("/pet/config/reset", { method: "POST", headers: userHeaders });
  return response.json() as Promise<ConfigResponse | { ok: false; reason?: string }>;
}

export async function reloadPack(): Promise<{ ok: boolean }> {
  const response = await fetch("/pet/pack/reload", { method: "POST", headers: userHeaders });
  return response.json() as Promise<{ ok: boolean }>;
}

export interface LlmRouteResult {
  ok: boolean;
  source?: "llm" | "fallback";
  text?: string;
  detail?: string;
  reason?: string | null;
  filtered?: boolean;
}

export async function postLlmTest(): Promise<LlmRouteResult> {
  const response = await fetch("/pet/llm/test", { method: "POST", headers: userHeaders, body: "{}" });
  return response.json() as Promise<LlmRouteResult>;
}

export async function postLlmChat(message: string, image?: string): Promise<LlmRouteResult> {
  const response = await fetch("/pet/llm/chat", {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify(image ? { message, image } : { message }),
  });
  return response.json() as Promise<LlmRouteResult>;
}
