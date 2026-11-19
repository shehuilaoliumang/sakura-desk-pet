import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { PORTRAIT_METRICS, bubbleStackReserve, type PetLayoutEvent } from "@shared/screenLayout";
import { playFor } from "@shared/stylePlay";
import { PIXEL_AMBIENT, gestureZone, type PixelGesture } from "@shared/pixel";
import type { ClickZone, PoseTimeline } from "@shared/portrait";
import { FORM_IDS, STATUS_LABEL, type FormId, type PetEvent, type SpeechLine, type WorkStatusData } from "@shared/types";
import { ChatPanel } from "../chat/ChatPanel";
import { openSettings, postForm, putWindowScale, quitApp } from "../api";
import { useBackend } from "../useBackend";
import { PetFigure } from "./figures";

export function PetApp() {
  const backend = useBackend();
  const [menu, setMenu] = useState<{ x: number; y: number; side: string; clampH: number; menuH?: number; menuW?: number } | null>(null);
  const [menuPad, setMenuPad] = useState<{ left: number; right: number; top: number; bottom: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pressed, setPressed] = useState(false);
  const draggingRef = useRef(false);
  const portraitRef = useRef<HTMLDivElement | null>(null);
  const touchPick = useRef(0);
  const [touch, setTouch] = useState<{ zone: ClickZone; pick: number; nonce: number } | null>(null);
  const [ambient, setAmbient] = useState<string | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const [zoomHint, setZoomHint] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTall, setChatTall] = useState(false);
  const [chatBox, setChatBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [layout, setLayout] = useState<PetLayoutEvent | null>(null);
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
  const library = backend.pack?.forms[activeForm]?.library;
  const illustrated = (library?.idle?.length ?? 0) > 0;
  const styleId = backend.pack?.style?.id ?? settings?.style ?? "portrait";
  const play = playFor(styleId);
  const figureLayout = backend.pack?.style?.layout ?? PORTRAIT_METRICS;

  useEffect(() => {
    if (styleId !== "pixel-q" || mood !== "idle" || touch) {
      setAmbient(null);
      return;
    }
    const timer = window.setInterval(() => {
      const clip = PIXEL_AMBIENT[Math.floor(Math.random() * PIXEL_AMBIENT.length)] ?? "peek";
      setAmbient(clip);
    }, 16000);
    return () => window.clearInterval(timer);
  }, [styleId, mood, touch]);

  const openDialogue = () => {
    setMenu(null);
    setMenuPad(null);
    void window.sakuraPet?.restoreMenu?.();
    if (window.sakuraPet?.openChat) {
      window.sakuraPet.openChat();
      return;
    }
    setChatOpen((open) => {
      if (open) setChatTall(false);
      return !open;
    });
  };

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme === "glass" ? "glass" : "warm";
  }, [settings?.theme]);

  useEffect(() => {
    if (!chatOpen || window.sakuraPet?.openChat) return;
    const place = () => {
      const stage = stageRef.current?.getBoundingClientRect();
      if (!stage) return;
      const gap = 16;
      const wantW = 420;
      const wantH = chatTall ? 440 : 300;
      const roomRight = window.innerWidth - stage.right - gap;
      const roomLeft = stage.left - gap;
      const height = Math.min(wantH, Math.max(220, window.innerHeight - 24));
      const top = Math.max(8, Math.min(stage.top, window.innerHeight - height - 8));
      if (roomRight >= 260) {
        setChatBox({
          left: Math.round(stage.right + gap),
          top: Math.round(top),
          width: Math.round(Math.min(wantW, roomRight - 8)),
          height: Math.round(height),
        });
        return;
      }
      if (roomLeft >= 260) {
        const width = Math.min(wantW, roomLeft - 8);
        setChatBox({
          left: Math.round(stage.left - gap - width),
          top: Math.round(top),
          width: Math.round(width),
          height: Math.round(height),
        });
        return;
      }
      const width = Math.min(wantW, window.innerWidth - 16);
      setChatBox({
        left: Math.round(Math.max(8, stage.left + (stage.width - width) / 2)),
        top: Math.round(Math.min(window.innerHeight - height - 8, stage.bottom + gap)),
        width: Math.round(width),
        height: Math.round(height),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [chatOpen, chatTall, activeForm, settings?.window.scale]);

  useEffect(() => {
    if (!chatOpen || window.sakuraPet?.openChat) return;
    const close = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".chat-dock") || target?.closest(".menu")) return;
      setChatOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [chatOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "Escape") {
        setChatOpen(false);
        setMenu(null);
        setMenuPad(null);
        void window.sakuraPet?.restoreMenu?.();
        window.sakuraPet?.closeChat?.();
        return;
      }
      if ((event.key === "l" || event.key === "L") && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        event.preventDefault();
        openDialogue();
        return;
      }
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings]);

  useEffect(() => {
    setTouch(null);
  }, [activeForm, styleId]);

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
    const pet = window.sakuraPet;
    if (!pet?.getLayout && !pet?.onLayout) return;
    let alive = true;
    void pet.getLayout?.().then((value) => {
      if (alive && value) setLayout(value);
    });
    const stop = pet.onLayout?.((value) => setLayout(value));
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

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
      if (draggingRef.current) return;
      const el = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const hit = !!(el && el.closest("[data-hit]"));
      apply(!hit);
    };
    const onLeave = () => {
      if (draggingRef.current) return;
      apply(true);
    };
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
  const touchSpeech = touch ? play.speakTouch(settings, touch.zone, touch.pick) : null;
  const lines = touchSpeech?.lines ?? say?.lines ?? [];
  const statusPose = touch ? null : play.workPose(activeForm, mood, settings.duoVoice.darkShare);
  const pose = touch
    ? play.clickTimeline(touch.zone.clip, touch.zone.action)
    : ambient && styleId === "pixel-q" && mood === "idle"
      ? play.clickTimeline(ambient, "sway")
      : statusPose
        ? play.workTimeline(statusPose.clip, statusPose.action)
        : play.idleTimeline(mood);
  const layoutScale = layout?.scale ?? settings.window.scale;
  const stackedDuo = activeForm === "duo" && layout?.bubbleRows === 2;
  const bubbleCount =
    activeForm === "duo" ? (layout ? (layout.bubbleRows === 1 ? 2 : 1) : bubbleCols(activeForm, lines.length, layoutScale)) : 1;
  const bubbleReserve = stackedDuo ? bubbleStackReserve(2) : undefined;
  const enabled = FORM_IDS.filter((id) => settings.forms[id].enabled);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    // This click dismisses the menu. Starting a drag here races restoreMenu's setBounds.
    if (menu) return;
    const cap = (event.target as HTMLElement).closest("[data-hit]") as HTMLElement | null;
    const originX = event.clientX;
    const originY = event.clientY;
    const downAt = performance.now();
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) > 5) moved = true;
    };
    const end = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setPressed(false);
      window.sakuraPet?.endDrag();
      const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      window.sakuraPet?.setMouseIgnore(!(under && under.closest("[data-hit]")));
      if (!moved) {
        const rect = portraitRef.current?.getBoundingClientRect();
        if (rect && rect.width > 8 && rect.height > 8) {
          const zone = play.hitZone(activeForm, (ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height);
          if (zone) {
            let gesture: PixelGesture = "click";
            if (styleId === "pixel-q") {
              const held = performance.now() - downAt > 480;
              const previous = lastTap.current;
              const repeat = !held && previous && previous.id === zone.id && performance.now() - previous.at < 420;
              gesture = held ? "hold" : repeat ? "double" : "click";
              lastTap.current = { id: zone.id, at: performance.now() };
              setAmbient(null);
            }
            const next = styleId === "pixel-q" ? gestureZone(activeForm, zone, gesture) : zone;
            const pick = touchPick.current++;
            setTouch({ zone: next, pick, nonce: pick });
          }
        }
      }
    };
    draggingRef.current = true;
    setPressed(true);
    // Capture stays on for the gesture. The main process places the window from
    // the DIP cursor, so screenX deltas never cross a scaleFactor boundary.
    window.sakuraPet?.setMouseIgnore(false);
    window.sakuraPet?.beginDrag();
    try {
      cap?.setPointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <div
      className={`pet-root ${pressed ? "pressed" : ""}`}
      data-render={backend.pack?.style?.render === "pixel" ? "pixel" : "paint"}
      style={{
        ["--pet-scale" as string]: String(layoutScale),
        ["--figure-w" as string]: `${figureLayout.baseW}px`,
        ["--figure-h" as string]: `${figureLayout.stageH}px`,
        ["--bubble-reserve" as string]: bubbleReserve != null ? `${bubbleReserve}px` : undefined,
        paddingLeft: menuPad?.left ? menuPad.left : undefined,
        paddingRight: menuPad?.right ? menuPad.right : undefined,
        paddingTop: menuPad?.top ? menuPad.top : undefined,
        paddingBottom: menuPad?.bottom ? menuPad.bottom : undefined,
        boxSizing: "border-box",
      } as CSSProperties}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
        if (styleId === "pixel-q") {
          const rect = portraitRef.current?.getBoundingClientRect();
          if (rect && rect.width > 8 && rect.height > 8) {
            const zone = play.hitZone(activeForm, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
            if (zone) return;
          }
        }
        openSettings();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        void (async () => {
          const prepared = await window.sakuraPet?.prepareMenu?.({ width: 188, height: 280 });
          if (prepared) {
            setMenuPad(prepared.pad);
            setMenu({
              x: prepared.menu.x,
              y: prepared.menu.y,
              side: prepared.side,
              clampH: prepared.clampH,
              menuH: prepared.menuH,
              menuW: prepared.menuW,
            });
            return;
          }
          // fallback: local clamp
          const stage = stageRef.current?.getBoundingClientRect();
          setMenu({
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196)),
            y: Math.max(8, Math.min(event.clientY, window.innerHeight - 240)),
            side: "right",
            clampH: window.innerHeight - 8,
            menuW: Math.min(188, Math.max(96, window.innerWidth - 16)),
            menuH: Math.min(280, Math.max(140, window.innerHeight - 16)),
          });
          void stage;
        })();
      }}
    >
      <div className={`bubbles count-${bubbleCount}`} data-hit>
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
        <PosePlayer
          slotRef={portraitRef}
          form={activeForm}
          mood={mood}
          name={displayName}
          facing={anim?.facing ?? null}
          library={illustrated ? library : undefined}
          timeline={pose}
          styleId={styleId}
          resolve={play.resolveFrame}
          onEnded={
            touch
              ? () => {
                  const nonce = touch.nonce;
                  setTouch((current) => (current && current.nonce === nonce ? null : current));
                }
              : ambient
                ? () => setAmbient(null)
                : undefined
          }
        />
      </div>

      {menu ? (
        <div
          className={`menu side-${menu.side}`}
          ref={menuRef}
          data-no-drag
          data-hit
          style={{
            left: menu.x,
            top: menu.y,
            width: menu.menuW,
            maxHeight: menu.menuH ?? menu.clampH,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <div className="menu-status" aria-live="polite">
            <span className={`lamp ${work.state}`} />
            <span>{STATUS_LABEL[work.state]}</span>
            <span className="chip-form">{displayName}</span>
            {sourceLabel(work) ? <span className="chip-source">{sourceLabel(work)}</span> : null}
            {work.task ? <span className="chip-task">{work.task}</span> : null}
          </div>
          {enabled.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === activeForm}
              onClick={() => { void postForm(id); setMenu(null); setMenuPad(null); void window.sakuraPet?.restoreMenu?.(); }}
            >
              <span>{settings.forms[id].displayName}</span>
              <span className="hint-key">{formShortcut(id)}</span>
            </button>
          ))}
          <hr />
          <button
            type="button"
            onClick={() => openDialogue()}
          >
            <span>对话</span>
            <span className="hint-key">L</span>
          </button>
          <button type="button" onClick={() => { openSettings(); setMenu(null); setMenuPad(null); void window.sakuraPet?.restoreMenu?.(); }}>
            <span>设置</span>
            <span className="hint-key">,</span>
          </button>
          {window.sakuraPet ? (
            <button type="button" onClick={() => quitApp()}>
              <span>退出</span>
            </button>
          ) : (
            <button type="button" onClick={() => { window.location.hash = "#/settings"; }}>
              <span>在这页打开设置</span>
            </button>
          )}
        </div>
      ) : null}

      {chatOpen && !window.sakuraPet?.openChat && chatBox ? (
        <div className="chat-dock-slot" style={{ left: chatBox.left, top: chatBox.top, width: chatBox.width, height: chatBox.height }}>
          <ChatPanel
            onClose={() => { setChatOpen(false); setChatTall(false); }}
            onPreview={setChatTall}
          />
        </div>
      ) : null}
      {zoomHint != null ? <div className="zoom-hint" data-no-drag data-hit>{zoomHint}%</div> : null}
      {backend.error ? <p className="pet-error" data-no-drag>{backend.error}</p> : null}
    </div>
  );
}



function formShortcut(id: FormId): string {
  if (id === "normal") return "1";
  if (id === "dark") return "2";
  if (id === "duo") return "3";
  if (id === "form4") return "4";
  return "5";
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

function PosePlayer({
  slotRef,
  form,
  mood,
  name,
  facing,
  library,
  timeline,
  styleId,
  resolve,
  onEnded,
}: {
  slotRef: { current: HTMLDivElement | null };
  form: FormId;
  mood: PetEvent;
  name: string;
  facing: "left" | "right" | null;
  library: Record<string, string[]> | undefined;
  timeline: PoseTimeline;
  styleId: string;
  resolve: (library: Record<string, string[]> | undefined, pose: PoseTimeline["steps"][number]) => string | null;
  onEnded?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  const steps = timeline.steps;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const repeatRef = useRef(timeline.repeatFrom);
  repeatRef.current = timeline.repeatFrom;
  const signature = `${styleId}|${timeline.repeatFrom ?? "hold"}|${steps
    .map((item) => `${item.clip}:${item.index}:${item.ms}:${item.x}:${item.y}:${item.rot}:${item.scale}`)
    .join(";")}|${library?.idle?.[0] ?? ""}|${library?.click?.[0] ?? ""}|${library?.angry?.[0] ?? ""}|${library?.sad?.[0] ?? ""}|${library?.joyful?.[0] ?? ""}|${library?.happy?.[0] ?? ""}`;

  useEffect(() => {
    setIndex(0);
  }, [signature]);

  useEffect(() => {
    const list = stepsRef.current;
    if (!library || !list.length) return;
    const current = list[Math.min(index, list.length - 1)];
    if (!current) return;
    const atEnd = index >= list.length - 1;
    const timer = window.setTimeout(() => {
      if (!atEnd) {
        setIndex((value) => value + 1);
        return;
      }
      if (repeatRef.current != null) setIndex(repeatRef.current);
      else ended.current?.();
    }, current.ms);
    return () => window.clearTimeout(timer);
  }, [index, library, signature]);

  const pose = steps[Math.min(index, Math.max(steps.length - 1, 0))];
  const url = pose && library ? resolve(library, pose) : null;
  const video = url ? /\.(webm|mov)(\?|$)/i.test(url) : false;
  const moved = pose ? pose.x !== 0 || pose.y !== 0 || pose.rot !== 0 || pose.scale !== 1 : false;
  const transform = moved && pose
    ? `translate(${pose.x}%, ${pose.y}%) rotate(${pose.rot}deg) scale(${pose.scale})`
    : undefined;
  const src = url ? `${url}${url.includes("?") ? "&" : "?"}pack=${encodeURIComponent(styleId)}` : null;

  return (
    <div className={`${facing === "left" ? "mirror " : ""}mood-${mood}`} ref={slotRef}>
      {!url ? (
        <PetFigure form={form} mood={mood} name={name} />
      ) : video ? (
        <video key={src} className="portrait-frame" src={src ?? undefined} autoPlay muted playsInline loop={timeline.repeatFrom != null} />
      ) : (
        <img className="portrait-frame" src={src ?? undefined} alt="" draggable={false} style={transform ? { transform } : undefined} />
      )}
    </div>
  );
}

function sourceLabel(work: WorkStatusData): string {
  if (work.adapter === "codex") return "Codex";
  if (work.adapter === "dsh") return "DSH";
  if (work.adapter === "webhook") return "Webhook";
  if (work.source === "work-status") return "外部";
  return "";
}
