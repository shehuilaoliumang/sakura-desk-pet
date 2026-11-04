import http from "node:http";
import fs from "node:fs";
import { mapIncomingEvent } from "./adapters";
import type { PetRuntime } from "./runtime";
import { isAdapterId, isFormId, type AdapterId, type FormId, type PetEvent, type Speaker } from "../shared/types";
import { APP_NAME, APP_VERSION, INSPIRATION_URL, PET_ID } from "../shared/version";

const PREFIXES = ["/dsh-pet-7340", "/pet"];
const MEDIA_RE = /^\/media\/(normal|dark|duo|form4|form5)\/((?:idle|thinking|working|waiting|success|error|click)(?:\/[A-Za-z0-9_-]+)?\.(?:webm|gif|png|webp|mov))$/;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type, x-sakura-user",
  "access-control-max-age": "600",
};

const CONTENT_TYPE: Record<string, string> = {
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".png": "image/png",
  ".mov": "video/quicktime",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(reason);
  }
}

export function startServer(runtime: PetRuntime, port: number): Promise<http.Server> {
  const started = Date.now();
  const server = http.createServer((req, res) => {
    void handle(runtime, req, res, started).catch((error: unknown) => {
      if (res.writableEnded || res.destroyed) return;
      const httpError = error instanceof HttpError ? error : new HttpError(500, "internal");
      if (!(error instanceof HttpError)) console.error("[sakura-pet] request failed", error);
      send(res, httpError.status, { ok: false, reason: httpError.reason, ...httpError.extra });
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const bound = typeof addr === "object" && addr ? addr.port : port;
      runtime.setBoundPort(bound);
      resolve(server);
    });
  });
}

async function handle(runtime: PetRuntime, req: http.IncomingMessage, res: http.ServerResponse, started: number): Promise<void> {
  if (!req.url || !req.method) throw new HttpError(400, "bad-request");
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    send(res, 200, health(runtime, started));
    return;
  }

  const stripped = stripPrefix(url.pathname);
  if (!stripped) throw new HttpError(404, "not-found");
  const pet = url.searchParams.get("pet");
  if (pet && pet !== PET_ID) throw new HttpError(404, "unknown-pet");

  if (req.method === "GET" && stripped === "/") {
    send(res, 200, {
      ok: true,
      petId: PET_ID,
      routes: ["state", "config", "config/meta", "anim", "broadcast", "bubble/clear", "work-status", "events", "form", "pack", "llm/chat", "llm/test", "playback/{id}", "media/{form}/{file}"],
    });
    return;
  }

  if (req.method === "GET" && stripped === "/state") {
    await maybeWait(runtime, req, url);
    if (res.writableEnded || res.destroyed || req.socket?.destroyed) return;
    send(res, 200, runtime.getState());
    return;
  }

  if (req.method === "GET" && stripped === "/config") {
    send(res, 200, runtime.getConfig());
    return;
  }

  if (req.method === "GET" && stripped === "/config/meta") {
    const config = runtime.getConfig();
    send(res, 200, { ok: true, ...config.paths, api: config.api, warning: config.warning });
    return;
  }

  if (req.method === "PUT" && stripped === "/config") {
    const body = await readJson(req);
    if (!isUser(req) && isRecord(body)) {
      delete body.activeForm;
      delete body.defaultForm;
    }
    const result = runtime.replaceSettings(body, "settings");
    if (!result.ok) throw new HttpError(400, "invalid-settings", { issues: result.issues });
    log(req.method, url.pathname, `form=${result.settings.activeForm}`);
    send(res, 200, runtime.getConfig());
    return;
  }

  if (req.method === "POST" && stripped === "/config/reset") {
    if (!isUser(req)) throw new HttpError(403, "user-only");
    runtime.resetSettings();
    log(req.method, url.pathname, `form=${runtime.settings.activeForm}`);
    send(res, 200, runtime.getConfig());
    return;
  }

  if (req.method === "POST" && stripped === "/form") {
    if (!isUser(req)) throw new HttpError(403, "user-only");
    const body = await readJson(req);
    const form = isRecord(body) && typeof body.form === "string" ? body.form : "";
    if (!isFormId(form)) throw new HttpError(400, "unknown-form");
    const result = runtime.setForm(form);
    if (!result.ok) throw new HttpError(result.reason === "form-disabled" ? 409 : 400, result.reason);
    log(req.method, url.pathname, `form=${result.activeForm}`);
    send(res, 200, { ok: true, activeForm: result.activeForm });
    return;
  }

  if (req.method === "POST" && stripped === "/work-status") {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body.state !== "string") throw new HttpError(400, "state-required");
    const mapped = mapIncomingEvent(body.state);
    if (mapped === "form") throw new HttpError(400, "form-switch-forbidden");
    if (!mapped) throw new HttpError(400, "unknown-state");
    const task = typeof body.task === "string" ? body.task : "";
    runtime.applyWorkStatus(mapped, task, "work-status", null);
    log(req.method, url.pathname, `state=${mapped} form=${runtime.settings.activeForm}`);
    send(res, 200, { ok: true, state: mapped, activeForm: runtime.settings.activeForm });
    return;
  }

  if (req.method === "DELETE" && stripped === "/work-status") {
    runtime.clearWorkStatus();
    log(req.method, url.pathname, `state=idle form=${runtime.settings.activeForm}`);
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === "POST" && stripped === "/events") {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body.source !== "string" || !isAdapterId(body.source)) throw new HttpError(400, "source-required");
    if (!runtime.settings.adapters[body.source]) throw new HttpError(403, "adapter-disabled", { adapter: body.source });
    if (typeof body.event !== "string") throw new HttpError(400, "event-required");
    const mapped = mapIncomingEvent(body.event);
    if (mapped === "form") throw new HttpError(400, "form-switch-forbidden");
    if (!mapped) throw new HttpError(400, "unknown-event");
    const task = typeof body.task === "string" ? body.task : "";
    const speaker = readSpeaker(body.speaker);
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 400) : "";
    runtime.applyWorkStatus(
      mapped,
      task,
      "event",
      body.source,
      text ? { text, speaker, durationMs: 0 } : undefined,
    );
    log(req.method, url.pathname, `source=${body.source} state=${mapped} form=${runtime.settings.activeForm}`);
    send(res, 200, { ok: true, state: mapped, activeForm: runtime.settings.activeForm, adapter: body.source satisfies AdapterId });
    return;
  }

  if (req.method === "POST" && stripped === "/anim") {
    const body = await readJson(req);
    if (!isRecord(body)) throw new HttpError(400, "bad-json");
    const hasName = typeof body.name === "string" && body.name.trim().length > 0;
    const hasUrl = typeof body.url === "string" && body.url.trim().length > 0;
    if (!hasName && !hasUrl) throw new HttpError(400, "anim-required");
    let eventName: PetEvent | undefined;
    if (hasName && typeof body.name === "string") {
      const mapped = mapIncomingEvent(body.name);
      if (mapped === "form") throw new HttpError(400, "form-switch-forbidden");
      if (!mapped) throw new HttpError(400, "unknown-anim");
      eventName = mapped;
    }
    let media: string | null | undefined;
    if (hasUrl && typeof body.url === "string") {
      if (!mediaUrlAllowed(body.url, runtime.getConfig().api.port)) throw new HttpError(400, "url-not-allowed");
      media = body.url;
    } else if (hasName) media = null;
    let facing: "left" | "right" | undefined;
    if (body.facing == null) facing = undefined;
    else if (body.facing === "left" || body.facing === "right") facing = body.facing;
    else throw new HttpError(400, "bad-facing");
    const anim = runtime.playAnim({ name: eventName, url: media, facing });
    log(req.method, url.pathname, `anim=${anim.name} form=${anim.form}`);
    send(res, 200, { ok: true, playbackId: anim.playbackId, name: anim.name, activeForm: anim.form });
    return;
  }

  if (req.method === "GET" && stripped.startsWith("/playback/")) {
    const id = decodeURIComponent(stripped.slice("/playback/".length));
    const playback = runtime.getPlayback(id);
    if (!playback) throw new HttpError(404, "unknown-playback");
    send(res, 200, { ok: true, ...playback, status: "accepted" });
    return;
  }

  if (req.method === "POST" && stripped === "/broadcast") {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body.text !== "string" || !body.text.trim()) throw new HttpError(400, "empty-text");
    const speaker = readSpeaker(body.speaker);
    const text = body.text.trim().slice(0, 400);
    const say = runtime.broadcast(text, speaker, resolveDuration(body));
    log(req.method, url.pathname, `broadcast form=${runtime.settings.activeForm}`);
    send(res, 200, { ok: true, text: say.text, filtered: say.filtered, activeForm: runtime.settings.activeForm });
    return;
  }

  if (req.method === "POST" && stripped === "/bubble/clear") {
    runtime.clearBubble();
    log(req.method, url.pathname, "clear");
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && stripped === "/llm/test") {
    if (!isUser(req)) throw new HttpError(403, "user-only");
    await readJson(req);
    const result = await runtime.testLlm();
    log(req.method, url.pathname, `source=${result.source} reason=${result.reason ?? "ok"}`);
    send(res, 200, {
      ok: result.ok,
      source: result.source,
      text: result.text,
      detail: result.detail,
      reason: result.reason,
    });
    return;
  }

  if (req.method === "POST" && stripped === "/llm/chat") {
    if (!isUser(req)) throw new HttpError(403, "user-only");
    const body = await readJson(req);
    if (!isRecord(body) || typeof body.message !== "string" || !body.message.trim()) throw new HttpError(400, "empty-text");
    const result = await runtime.speakWithLlm(body.message);
    log(req.method, url.pathname, `source=${result.source} reason=${result.reason ?? "ok"} form=${runtime.settings.activeForm}`);
    send(res, 200, {
      ok: result.ok,
      source: result.source,
      text: result.text,
      detail: result.detail,
      reason: result.reason,
      filtered: result.filtered,
      activeForm: runtime.settings.activeForm,
    });
    return;
  }

  if (req.method === "GET" && stripped === "/pack") {
    send(res, 200, runtime.getPack());
    return;
  }

  if (req.method === "POST" && stripped === "/pack/reload") {
    if (!isUser(req)) throw new HttpError(403, "user-only");
    send(res, 200, { ok: true, pack: runtime.reloadPack() });
    return;
  }

  const media = stripped.match(MEDIA_RE);
  if (req.method === "GET" && media) {
    const form = media[1] as FormId;
    const relative = media[2] ?? "";
    const file = runtime.mediaFile(form, relative);
    if (!file) throw new HttpError(404, "not-found");
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, {
      ...CORS,
      "content-type": CONTENT_TYPE[ext] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
    return;
  }

  throw new HttpError(404, "not-found");
}

function health(runtime: PetRuntime, started: number) {
  const config = runtime.getConfig();
  return {
    ok: true,
    name: APP_NAME,
    version: APP_VERSION,
    mode: "standalone",
    host: "127.0.0.1",
    port: config.api.port,
    uptimeSec: Math.round((Date.now() - started) / 1000),
    petId: PET_ID,
    activeForm: runtime.settings.activeForm,
    inspiration: INSPIRATION_URL,
  };
}

async function maybeWait(runtime: PetRuntime, req: http.IncomingMessage, url: URL): Promise<void> {
  const sinceRaw = url.searchParams.get("since");
  const timeoutRaw = url.searchParams.get("timeout");
  if (sinceRaw == null && timeoutRaw == null) return;
  if (sinceRaw == null || timeoutRaw == null) throw new HttpError(400, "since-and-timeout");
  if (!/^-?\d+$/.test(sinceRaw) || !/^\d+$/.test(timeoutRaw)) throw new HttpError(400, "bad-poll");
  const since = Number(sinceRaw);
  const timeout = Math.min(10_000, Math.max(0, Number(timeoutRaw)));
  const ac = new AbortController();
  const onClose = () => ac.abort();
  req.socket?.on("close", onClose);
  try {
    await runtime.wait(since, timeout, ac.signal);
  } finally {
    req.socket?.off("close", onClose);
  }
}

function stripPrefix(pathname: string): string | null {
  for (const prefix of PREFIXES) {
    if (pathname === prefix) return "/";
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return null;
}

function isUser(req: http.IncomingMessage): boolean {
  const value = req.headers["x-sakura-user"];
  return value === "1" || (Array.isArray(value) && value.includes("1"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readSpeaker(value: unknown): Speaker | "both" | undefined {
  if (value == null) return undefined;
  if (value === "normal" || value === "dark" || value === "both") return value;
  throw new HttpError(400, "bad-speaker");
}

function resolveDuration(body: Record<string, unknown>): number {
  if (typeof body.durationMs === "number" && Number.isFinite(body.durationMs)) {
    return Math.min(120_000, Math.max(0, body.durationMs));
  }
  if (typeof body.duration === "number" && Number.isFinite(body.duration)) {
    return Math.min(120_000, Math.max(0, body.duration * 1000));
  }
  return 8000;
}

function mediaUrlAllowed(url: string, port: number): boolean {
  const pathOnly = /^\/pet\/media\/(normal|dark|duo|form4|form5)\/(?:idle|thinking|working|waiting|success|error|click)(?:\/[A-Za-z0-9_-]+)?\.(?:webm|gif|png|webp|mov)$/;
  if (url.startsWith("/pet/media/")) return pathOnly.test(url);
  try {
    const parsed = new URL(url);
    const hostOk = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (!hostOk) return false;
    if (parsed.port && parsed.port !== String(port)) return false;
    return pathOnly.test(parsed.pathname);
  } catch {
    return false;
  }
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (error?: HttpError) => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch {
        reject(new HttpError(400, "bad-json"));
      }
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65_536) {
        finish(new HttpError(413, "too-large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    };
    if (req.readableEnded) {
      finish();
      return;
    }
    req.on("data", onData);
    req.on("end", () => finish());
    req.on("error", () => finish(new HttpError(400, "bad-request")));
    req.resume();
  });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    connection: "close",
    "content-length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

function log(method: string, pathname: string, detail: string): void {
  console.log(`[sakura-pet] ${method} ${pathname} ${detail}`);
}
