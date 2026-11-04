import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FORM_IDS, STATUS_LABEL, type FormId, type PackClip, type PetEvent, type SpeechLine, type WorkStatusData } from "@shared/types";
import { openSettings, postForm, quitApp } from "../api";
import { useBackend } from "../useBackend";
import { PetFigure } from "./figures";

export function PetApp() {
  const backend = useBackend();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  const [reaction, setReaction] = useState(false);

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

  if (!settings || !state || !work) {
    return (
      <div className="pet-root loading">
        <div className="boot-card" data-no-drag>
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
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
        openSettings();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <div className={`bubbles count-${activeForm === "duo" ? 2 : Math.min(lines.length, 1)}`}>
        {activeForm === "duo" ? (
          <>
            <Bubble line={lines.find((line) => line.speaker === "dark")} name={settings.forms.dark.displayName} />
            <Bubble line={lines.find((line) => line.speaker === "normal")} name={settings.forms.normal.displayName} />
          </>
        ) : (
          <Bubble line={lines[0]} name={lines[0]?.speaker === "dark" ? settings.forms.dark.displayName : displayName} />
        )}
      </div>

      <div className="stage">
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

      <div className={`status-chip mood-${work.state}`} data-no-drag aria-live="polite">
        <span className={`lamp ${work.state}`} />
        <span>{STATUS_LABEL[work.state]}</span>
        <span className="chip-form">{displayName}</span>
        {sourceLabel(work) ? <span className="chip-source">{sourceLabel(work)}</span> : null}
        {work.task ? <span className="chip-task">{work.task}</span> : null}
      </div>

      <div className="hover-bar" data-no-drag>
        {enabled.map((id) => (
          <button key={id} type="button" aria-pressed={id === activeForm} onClick={() => void postForm(id)}>
            {settings.forms[id].displayName}
          </button>
        ))}
        <button type="button" onClick={openSettings}>
          设置
        </button>
      </div>

      {menu ? (
        <div
          className="menu"
          data-no-drag
          style={{ left: Math.min(menu.x, window.innerWidth - 180), top: Math.min(menu.y, window.innerHeight - 220) }}
          onPointerDown={(event) => event.stopPropagation()}
        >
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

      {backend.error ? <p className="pet-error" data-no-drag>{backend.error}</p> : null}
    </div>
  );
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
