import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { FORM_IDS, STATUS_LABEL, type FormId, type PackClip, type PetEvent, type SpeechLine, type WorkStatusData } from "@shared/types";
import { openSettings, postForm, putWindowScale, quitApp } from "../api";
import { useBackend } from "../useBackend";
import { PetFigure } from "./figures";

export function PetApp() {
  const backend = useBackend();
  const [menu, setMenu] = useState<{ x: number; y: number; side: string; clampH: number; menuH?: number } | null>(null);
  const [menuPad, setMenuPad] = useState<{ left: number; right: number; top: number; bottom: number } | null>(null);
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
        setMenu(null); setMenuPad(null); void window.sakuraPet?.restoreMenu?.();
      }
      if (event.key === ",") openSettings();
      if (event.key === "Escape") setMenu(null); setMenuPad(null); void window.sakuraPet?.restoreMenu?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings]);

  useEffect(() => {
    setReaction(false);
  }, [activeForm]);

  useEffect(() => {
    if (!menu) return;
    const close = () => {
      setMenu(null);
      setMenuPad(null);
      void window.sakuraPet?.restoreMenu?.();
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
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
      style={{
        ["--pet-scale" as string]: String(settings.window.scale),
        paddingLeft: menuPad?.left ? menuPad.left : undefined,
        paddingRight: menuPad?.right ? menuPad.right : undefined,
        paddingTop: menuPad?.top ? menuPad.top : undefined,
        paddingBottom: menuPad?.bottom ? menuPad.bottom : undefined,
        boxSizing: "border-box",
      } as CSSProperties}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
        openSettings();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        void (async () => {
          const prepared = await window.sakuraPet?.prepareMenu?.({ width: 188, height: 300 });
          if (prepared) {
            setMenuPad(prepared.pad);
            setMenu({ x: prepared.menu.x, y: prepared.menu.y, side: prepared.side, clampH: prepared.clampH, menuH: prepared.menuH });
            return;
          }
          // fallback: local clamp
          const stage = stageRef.current?.getBoundingClientRect();
          setMenu({
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196)),
            y: Math.max(8, Math.min(event.clientY, window.innerHeight - 260)),
            side: "right",
            clampH: window.innerHeight - 8,
          });
          void stage;
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
          style={{ left: menu.x, top: menu.y, maxHeight: Math.max(140, Math.min(menu.menuH ?? 300, menu.clampH - 8)) }}
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
            <button key={id} type="button" onClick={() => { void postForm(id); setMenu(null); setMenuPad(null); void window.sakuraPet?.restoreMenu?.(); }}>
              {settings.forms[id].displayName}
            </button>
          ))}
          <hr />
          <button type="button" onClick={() => { openSettings(); setMenu(null); setMenuPad(null); void window.sakuraPet?.restoreMenu?.(); }}>
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
