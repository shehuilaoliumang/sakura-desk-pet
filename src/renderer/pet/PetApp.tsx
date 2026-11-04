import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { FORM_IDS, STATUS_LABEL, type FormId, type PackClip, type PetEvent, type SpeechLine, type WorkStatusData } from "@shared/types";
import { openSettings, postForm, putWindowScale, quitApp } from "../api";
import { useBackend } from "../useBackend";
import { PetFigure } from "./figures";

export function PetApp() {
  const backend = useBackend();
  const [menu, setMenu] = useState<MenuPlacement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pressed, setPressed] = useState(false);
  const [reaction, setReaction] = useState(false);
  const [zoomHint, setZoomHint] = useState<number | null>(null);
  const scaleRef = useRef(1);
  const zoomTimer = useRef<number | null>(null);
  const hintTimer = useRef<number | null>(null);

  const settings = backend.settings;
  const state = backend.state;
  const activeForm = state?.sections.config.data.activeForm ?? settings?.activeForm ?? "normal";
  const work = state?.sections.workStatus.data;
  const say = state?.pets.sakura.say.data;
  const anim = state?.pets.sakura.anim.data;
  const mood = anim?.name ?? work?.state ?? "idle";
  const formPack = backend.pack?.forms[activeForm];
  const poseFrames = framesFor(formPack?.clips.find((item) => item.state === mood), formPack?.clips.find((item) => item.state === "idle"));
  const clickFrames = formPack?.click?.frames ?? [];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const byKey: Record<string, FormId | undefined> = {
        "1": "normal",
        "2": "dark",
        "3": "duo",
        "4": "form4",
        "5": "form5",
      };
      const form = byKey[event.key];
      if (form && settings?.forms[form].enabled) {
        void postForm(form);
        setMenu(null);
      }
      if (event.key === ",") openSettings();
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings]);

  useEffect(() => {
    setReaction(false);
  }, [activeForm]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const mw = Math.max(160, el.offsetWidth || menu.menuW);
    const mh = Math.max(120, el.offsetHeight || menu.menuH);
    const next = finalizeMenuPlacement(menu, mw, mh);
    const maxH = Math.max(120, next.clampH - 8);
    el.style.maxHeight = maxH + "px";
    el.style.overflowY = mh > maxH ? "auto" : "hidden";
    if (Math.abs(next.x - menu.x) > 0.5 || Math.abs(next.y - menu.y) > 0.5 || next.side !== menu.side) {
      setMenu(next);
    }
  }, [menu]);


  useEffect(() => {
    if (settings?.window.scale != null) scaleRef.current = settings.window.scale;
  }, [settings?.window.scale]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      const steps = event.deltaMode === 0 ? event.deltaY / 100 : event.deltaY;
      const delta = steps > 0 ? -0.05 : 0.05;
      const next = Math.round(Math.min(2, Math.max(0.4, scaleRef.current + delta)) * 100) / 100;
      if (next === scaleRef.current) return;
      scaleRef.current = next;
      setZoomHint(Math.round(next * 100));
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setZoomHint(null), 900);
      if (zoomTimer.current) window.clearTimeout(zoomTimer.current);
      zoomTimer.current = window.setTimeout(() => {
        void putWindowScale(scaleRef.current);
      }, 40);
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", onWheel, true);
      if (zoomTimer.current) window.clearTimeout(zoomTimer.current);
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!window.sakuraPet?.setMouseIgnore) return;
    let last = true;
    const apply = (ignore: boolean) => {
      if (ignore === last) return;
      last = ignore;
      window.sakuraPet?.setMouseIgnore(ignore);
    };
    const onMove = (event: MouseEvent) => {
      const el = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const hit = !!(el && el.closest("[data-hit]"));
      apply(!hit);
    };
    const onLeave = () => apply(true);
    window.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    apply(true);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      apply(true);
    };
  }, []);

  if (!settings || !state || !work) {
    return (
      <div className="pet-root loading">
        <div className="boot-card" data-no-drag data-hit>
          <span className="boot-apple" />
          <p>{backend.error ?? "樱正在过来…"}</p>
        </div>
      </div>
    );
  }

  const displayName = settings.forms[activeForm].displayName;
  const lines = say?.lines ?? [];
  const enabled = FORM_IDS.filter((id) => settings.forms[id].enabled);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    let lastX = event.screenX;
    let lastY = event.screenY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.screenX - lastX;
      const dy = ev.screenY - lastY;
      lastX = ev.screenX;
      lastY = ev.screenY;
      if (dx || dy) moved = true;
      window.sakuraPet?.moveBy(dx, dy);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPressed(false);
      if (moved) window.sakuraPet?.moveEnd();
      else setReaction(true);
    };
    setPressed(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className={`pet-root ${pressed ? "pressed" : ""}`}
      style={{ ["--pet-scale" as string]: String(settings.window.scale) } as CSSProperties}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
        openSettings();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const stage = stageRef.current?.getBoundingClientRect();
        const cx = event.clientX;
        const cy = event.clientY;
        void (async () => {
          const geo = (await window.sakuraPet?.getWorkArea?.()) ?? null;
          setMenu(placeContextMenu(cx, cy, stage, geo));
        })();
      }}
    >
      <div className={`bubbles count-${bubbleCols(activeForm, lines.length, settings.window.scale)}`} data-hit>
        {activeForm === "duo" ? (
          <>
            <Bubble line={lines.find((line) => line.speaker === "dark")} name={settings.forms.dark.displayName} />
            <Bubble line={lines.find((line) => line.speaker === "normal")} name={settings.forms.normal.displayName} />
          </>
        ) : (
          <Bubble line={lines[0]} name={lines[0]?.speaker === "dark" ? settings.forms.dark.displayName : displayName} />
        )}
      </div>

      <div className="stage" data-hit ref={stageRef}>
        <Figure
          form={activeForm}
          mood={mood}
          name={displayName}
          facing={anim?.facing ?? null}
          frames={poseFrames}
          clickFrames={clickFrames}
          reacting={reaction}
          onReactionEnd={() => setReaction(false)}
        />
      </div>

      {menu ? (
        <div
          className={`menu side-${menu.side}`}
          ref={menuRef}
          data-no-drag
          data-hit
          style={{ left: menu.x, top: menu.y, maxHeight: Math.max(120, menu.clampH - 8) }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="menu-status" aria-live="polite">
            <span className={`lamp ${work.state}`} />
            <span>{STATUS_LABEL[work.state]}</span>
            <span className="chip-form">{displayName}</span>
            {sourceLabel(work) ? <span className="chip-source">{sourceLabel(work)}</span> : null}
            {work.task ? <span className="chip-task">{work.task}</span> : null}
          </div>
          {enabled.map((id) => (
            <button key={id} type="button" onClick={() => { void postForm(id); setMenu(null); }}>
              {settings.forms[id].displayName}
            </button>
          ))}
          <hr />
          <button type="button" onClick={() => { openSettings(); setMenu(null); }}>
            设置
          </button>
          {window.sakuraPet ? (
            <button type="button" onClick={() => quitApp()}>
              退出
            </button>
          ) : (
            <button type="button" onClick={() => { window.location.hash = "#/settings"; }}>
              在这页打开设置
            </button>
          )}
        </div>
      ) : null}

      {zoomHint != null ? <div className="zoom-hint" data-no-drag data-hit>{zoomHint}%</div> : null}
      {backend.error ? <p className="pet-error" data-no-drag>{backend.error}</p> : null}
    </div>
  );
}



type MenuGeo = {
  workArea: { x: number; y: number; width: number; height: number };
  bounds: { x: number; y: number; width: number; height: number };
} | null;

type MenuPlacement = {
  x: number;
  y: number;
  side: string;
  menuW: number;
  menuH: number;
  clampX: number;
  clampY: number;
  clampW: number;
  clampH: number;
  winX: number;
  winY: number;
  area: { x: number; y: number; width: number; height: number };
  anchor: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  clickX: number;
  clickY: number;
};

function visibleClamp(geo: MenuGeo) {
  const winX = geo?.bounds.x ?? window.screenX;
  const winY = geo?.bounds.y ?? window.screenY;
  const area = geo?.workArea ?? {
    x: window.screen.availLeft,
    y: window.screen.availTop,
    width: window.screen.availWidth,
    height: window.screen.availHeight,
  };
  const vx0 = Math.max(0, area.x - winX);
  const vy0 = Math.max(0, area.y - winY);
  const vx1 = Math.min(window.innerWidth, area.x + area.width - winX);
  const vy1 = Math.min(window.innerHeight, area.y + area.height - winY);
  return {
    winX,
    winY,
    area,
    clamp: {
      x: Math.max(4, vx0 + 4),
      y: Math.max(4, vy0 + 4),
      w: Math.max(40, vx1 - vx0 - 8),
      h: Math.max(40, vy1 - vy0 - 8),
    },
  };
}

/** Keep the whole panel inside window∩workArea; near bottom open upward. */
function finalizeMenuPlacement(menu: MenuPlacement, menuW: number, menuH: number): MenuPlacement {
  const { clampX: cx, clampY: cy, clampW: cw, clampH: ch, anchor, clickX, clickY } = menu;
  const gap = 8;
  const usableH = Math.min(menuH, Math.max(120, ch - 8));
  const clampPosX = (v: number) => Math.max(cx, Math.min(v, Math.max(cx, cx + cw - menuW)));
  const clampPosY = (v: number) => Math.max(cy, Math.min(v, Math.max(cy, cy + ch - usableH)));

  const room = {
    right: menu.area.x + menu.area.width - (menu.winX + anchor.right),
    left: menu.winX + anchor.left - menu.area.x,
    bottom: menu.area.y + menu.area.height - (menu.winY + anchor.bottom),
    top: menu.winY + anchor.top - menu.area.y,
  };

  // Slide vertically so a side-docked menu never spills past the work area.
  const yBeside = clampPosY(Math.min(Math.max(anchor.top, clickY - 24), cy + ch - usableH));
  const cands = [
    { side: "right", x: clampPosX(anchor.right + gap), y: yBeside, score: room.right },
    { side: "left", x: clampPosX(anchor.left - gap - menuW), y: yBeside, score: room.left },
    { side: "top", x: clampPosX(anchor.left + (anchor.width - menuW) / 2), y: clampPosY(anchor.top - gap - usableH), score: room.top + (room.bottom < usableH ? 200 : 0) },
    { side: "bottom", x: clampPosX(anchor.left + (anchor.width - menuW) / 2), y: clampPosY(anchor.bottom + gap), score: room.bottom },
  ];

  for (const c of cands) {
    const sx = menu.winX + c.x;
    const sy = menu.winY + c.y;
    const fully =
      sx >= menu.area.x - 1 &&
      sy >= menu.area.y - 1 &&
      sx + menuW <= menu.area.x + menu.area.width + 1 &&
      sy + usableH <= menu.area.y + menu.area.height + 1;
    c.score += fully ? 1000 : 0;
    const overlapW = Math.max(0, Math.min(c.x + menuW, anchor.right) - Math.max(c.x, anchor.left));
    const overlapH = Math.max(0, Math.min(c.y + usableH, anchor.bottom) - Math.max(c.y, anchor.top));
    c.score -= (overlapW * overlapH) / Math.max(1, menuW * usableH) * 500;
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  return { ...menu, x: best.x, y: best.y, side: best.side, menuW, menuH: usableH };
}

function placeContextMenu(
  clickX: number,
  clickY: number,
  stage: DOMRect | undefined,
  geo: MenuGeo,
  menuW = 188,
  menuH = 280,
): MenuPlacement {
  const { clamp, winX, winY, area } = visibleClamp(geo);
  const r = stage ?? new DOMRect(clickX - 40, clickY - 40, 80, 80);
  const seed: MenuPlacement = {
    x: clickX,
    y: clickY,
    side: "right",
    menuW,
    menuH,
    clampX: clamp.x,
    clampY: clamp.y,
    clampW: clamp.w,
    clampH: clamp.h,
    winX,
    winY,
    area,
    anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    clickX,
    clickY,
  };
  return finalizeMenuPlacement(seed, menuW, menuH);
}

function bubbleCols(form: FormId, lineCount: number, scale: number): number {
  if (form === "duo") return scale >= 0.6 ? 2 : 1;
  return Math.min(Math.max(lineCount, 0), 1);
}
function Bubble({ line, name }: { line?: SpeechLine; name: string }) {
  if (!line || !line.text) return <div className="bubble ghost" />;
  return (
    <blockquote className={`bubble ${line.speaker} ${line.primary ? "primary" : "echo"}`}>
      <span className="who">{name}</span>
      <p>{line.text}</p>
    </blockquote>
  );
}

function framesFor(primary: PackClip | undefined, idle: PackClip | undefined): string[] {
  if (primary && primary.frames.length) return primary.frames;
  if (idle && idle.frames.length) return idle.frames;
  return [];
}

function Figure({
  form,
  mood,
  name,
  facing,
  frames,
  clickFrames,
  reacting,
  onReactionEnd,
}: {
  form: FormId;
  mood: PetEvent;
  name: string;
  facing: "left" | "right" | null;
  frames: string[];
  clickFrames: string[];
  reacting: boolean;
  onReactionEnd: () => void;
}) {
  const showClick = reacting && clickFrames.length > 0;
  const urls = showClick ? clickFrames : frames;
  const video = urls[0] ? /\.(webm|mov)(\?|$)/i.test(urls[0]) : false;
  return (
    <div className={`${facing === "left" ? "mirror " : ""}mood-${mood}`}>
      {urls.length === 0 ? (
        <PetFigure form={form} mood={mood} name={name} />
      ) : video ? (
        <video key={urls[0]} src={urls[0]} autoPlay muted playsInline loop={!showClick} />
      ) : (
        <FrameSequence urls={urls} loop={!showClick} onEnded={showClick ? onReactionEnd : undefined} />
      )}
    </div>
  );
}

function FrameSequence({ urls, loop, onEnded }: { urls: string[]; loop: boolean; onEnded?: () => void }) {
  const [index, setIndex] = useState(0);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  const signature = urls.join("|");

  useEffect(() => {
    setIndex(0);
  }, [signature]);

  useEffect(() => {
    if (!urls.length) return;
    const atEnd = index >= urls.length - 1;
    const timer = window.setTimeout(() => {
      if (atEnd) {
        if (loop) setIndex(0);
        else ended.current?.();
        return;
      }
      setIndex((current) => current + 1);
    }, atEnd ? 180 : 340);
    return () => window.clearTimeout(timer);
  }, [index, loop, signature, urls.length]);

  return <img src={urls[Math.min(index, urls.length - 1)]} alt="" draggable={false} />;
}

function sourceLabel(work: WorkStatusData): string {
  if (work.adapter === "codex") return "Codex";
  if (work.adapter === "dsh") return "DSH";
  if (work.adapter === "webhook") return "Webhook";
  if (work.source === "work-status") return "外部";
  return "";
}
