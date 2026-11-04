import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PERSONA } from "@shared/defaults";
import { speakFor } from "@shared/lines";
import { materializePersona } from "@shared/persona";
import {
  FORM_IDS,
  PET_EVENTS,
  STATUS_LABEL,
  type FormId,
  type PetEvent,
  type Settings,
} from "@shared/types";
import { INSPIRATION_URL } from "@shared/version";
import { postForm, postReset, putSettings, quitApp, reloadPack, reveal } from "../api";
import { useBackend } from "../useBackend";

type SaveState = "idle" | "saving" | "saved" | "error";

export function SettingsApp() {
  const backend = useBackend();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<PetEvent>("thinking");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [tabooDraft, setTabooDraft] = useState("");
  const [armReset, setArmReset] = useState(false);
  const dirty = useRef(false);
  const seq = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (backend.settings && !dirty.current) setDraft(backend.settings);
  }, [backend.settings]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const speechKey = draft
    ? JSON.stringify({
        preview,
        form: draft.activeForm,
        honorific: draft.honorific,
        nickname: draft.nickname,
        direct: draft.darkMayAddressDirectly,
        snark: draft.snarkCap,
        intensity: draft.tone.intensity,
        politeness: draft.tone.politeness,
        share: draft.duoVoice.darkShare,
        dual: draft.duoVoice.dualBubble,
        taboo: draft.tabooWords,
      })
    : "";
  const spoken = useMemo(
    () => (draft ? speakFor(draft, preview, draft.activeForm) : null),
    // speechKey already folds in every field that changes the line.
    [speechKey],
  );

  if (!draft || !backend.state || !spoken) {
    return (
      <main className="settings-root">
        <div className="settings-wrap">
          <p className="lede">{backend.error ?? "正在读配置…"}</p>
        </div>
      </main>
    );
  }

  const serverForm = backend.state.sections.config.data.activeForm;
  const work = backend.state.sections.workStatus.data;

  const schedule = (next: Settings) => {
    dirty.current = true;
    setArmReset(false);
    const id = ++seq.current;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSaveState("saving");
      void putSettings(next).then((result) => {
        if (id !== seq.current) return;
        if (!result.ok) {
          setSaveState("error");
          setSaveError("issues" in result && result.issues ? result.issues.join(" ") : result.reason ?? "没有写上");
          return;
        }
        dirty.current = false;
        setDraft(result.settings);
        setSaveState("saved");
        setSaveError("");
      }).catch(() => {
        if (id !== seq.current) return;
        setSaveState("error");
        setSaveError("接口没有应答");
      });
    }, 350);
  };

  const edit = (mutator: (current: Settings) => Settings) => {
    setDraft((current) => {
      if (!current) return current;
      const next = mutator(current);
      schedule(next);
      return next;
    });
  };

  const chooseForm = (id: FormId) => {
    setDraft((current) => (current ? { ...current, activeForm: id } : current));
    void postForm(id).then((result) => {
      if (!result.ok) {
        setSaveState("error");
        setSaveError(result.reason === "form-disabled" ? "这个槽位还没启用" : result.reason ?? "没有切换");
      }
    });
  };

  const addTaboo = () => {
    const word = tabooDraft.trim();
    if (!word) return;
    edit((current) => ({ ...current, tabooWords: current.tabooWords.includes(word) ? current.tabooWords : [...current.tabooWords, word] }));
    setTabooDraft("");
  };

  return (
    <main className="settings-root">
      <div className="settings-wrap">
        <header className="settings-header">
          <p className="eyebrow">桌宠 · 三形态 · 还有两个空槽</p>
          <div className="title-row">
            <h1>樱</h1>
            <p className={`save-state ${saveState}`}>
              {saveState === "saving" ? "正在写入…" : saveState === "saved" ? "已写入配置" : saveState === "error" ? saveError : "改动会自己保存"}
            </p>
          </div>
          <p className="lede">
            黑樱保护着软弱的自己。形态只在这里手动换，外面的 agent 只能改当前形态里的状态和台词。
            内置人设是默认值，下面的空栏留空就继续用它。
          </p>
          <div className="live-strip" aria-live="polite">
            <span className={`lamp ${work.state}`} />
            <strong>{STATUS_LABEL[work.state]}</strong>
            <span>{backend.settings?.forms[serverForm].displayName ?? serverForm}</span>
            {work.task ? <span className="task">{work.task}</span> : <span className="task quiet">还没有任务说明</span>}
          </div>
          {backend.warning ? <p className="banner">{backend.warning}</p> : null}
          {backend.pack?.warning ? <p className="banner">{backend.pack.warning}</p> : null}
        </header>

        <div className="settings-grid">
          <section className="panel">
            <h2>称呼</h2>
            <p className="hint">称谓是常态樱的叫法，黑樱在不允许直呼时也用它。昵称只在打开直呼之后交给黑樱。</p>
            <label className="field">
              <span>称谓</span>
              <input value={draft.honorific} maxLength={24} onChange={(event) => edit((current) => ({ ...current, honorific: event.target.value }))} />
            </label>
            <label className="field">
              <span>昵称</span>
              <input
                value={draft.nickname}
                maxLength={24}
                placeholder="留空则直呼时说「你」"
                onChange={(event) => edit((current) => ({ ...current, nickname: event.target.value }))}
              />
            </label>
          </section>

          <section className="panel">
            <h2>形态</h2>
            <p className="hint">当前形态马上生效。开机默认要到下次启动。第 4、第 5 槽启用后也只是占位，方便以后接动画包。</p>
            <p className="field-label">当前</p>
            <div className="segmented">
              {FORM_IDS.filter((id) => draft.forms[id].enabled).map((id) => (
                <button key={id} type="button" aria-pressed={draft.activeForm === id} onClick={() => chooseForm(id)}>
                  {draft.forms[id].displayName}
                </button>
              ))}
            </div>
            <label className="field">
              <span>开机默认</span>
              <select
                value={draft.defaultForm}
                onChange={(event) => edit((current) => ({ ...current, defaultForm: event.target.value as FormId }))}
              >
                {FORM_IDS.filter((id) => draft.forms[id].enabled).map((id) => (
                  <option key={id} value={id}>{draft.forms[id].displayName}</option>
                ))}
              </select>
            </label>
            <div className="name-grid">
              {FORM_IDS.map((id) => (
                <label key={id} className="field">
                  <span>{id === "form4" || id === "form5" ? `槽 ${draft.forms[id].slot}` : "显示名"}</span>
                  <input
                    value={draft.forms[id].displayName}
                    maxLength={16}
                    onChange={(event) => edit((current) => ({
                      ...current,
                      forms: { ...current.forms, [id]: { ...current.forms[id], displayName: event.target.value } },
                    }))}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>语气</h2>
            <p className="hint">这些旋钮决定现在这几句短台词。强度拉高会把句子说完整，敬语倾向压低时常态樱会收着敬语。毒舌上限是黑樱的天花板，强度不能把它顶破。</p>
            <Slider label="语气强度" value={draft.tone.intensity} onChange={(value) => edit((current) => ({ ...current, tone: { ...current.tone, intensity: value } }))} />
            <Slider label="敬语倾向" value={draft.tone.politeness} onChange={(value) => edit((current) => ({ ...current, tone: { ...current.tone, politeness: value } }))} />
            <Slider label="黑樱毒舌上限" value={draft.snarkCap} onChange={(value) => edit((current) => ({ ...current, snarkCap: value }))} />
            <Switch
              on={draft.darkMayAddressDirectly}
              label="允许黑樱直呼"
              onChange={(value) => edit((current) => ({ ...current, darkMayAddressDirectly: value }))}
            />
          </section>

          <section className="panel">
            <h2>双人声部</h2>
            <p className="hint">默认黑樱主说。关掉双气泡时，只留下占比不低于一半的那一方；正好一半时由黑樱说。两条句子用 || 分开时，广播会同时给两边。</p>
            <div className="split-readout">
              <span>常态樱 {100 - draft.duoVoice.darkShare}%</span>
              <span>黑樱 {draft.duoVoice.darkShare}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={draft.duoVoice.darkShare}
              aria-label="黑樱声部占比"
              onChange={(event) => edit((current) => ({ ...current, duoVoice: { ...current.duoVoice, darkShare: Number(event.target.value) } }))}
            />
            <Switch
              on={draft.duoVoice.dualBubble}
              label="双气泡"
              onChange={(value) => edit((current) => ({ ...current, duoVoice: { ...current.duoVoice, dualBubble: value } }))}
            />
            <div className="preview">
              <div className="segmented slim">
                {PET_EVENTS.map((event) => (
                  <button key={event} type="button" aria-pressed={preview === event} onClick={() => setPreview(event)}>
                    {STATUS_LABEL[event]}
                  </button>
                ))}
              </div>
              <p className="preview-note">预听当前旋钮，不会改桌宠身上的状态。桌宠每次换状态，会从这一档里另抽一句。</p>
              {spoken.lines.map((line) => (
                <div key={`${line.speaker}-${line.text}`}>
                  <span className="who">{line.speaker === "dark" ? draft.forms.dark.displayName : draft.forms.normal.displayName}</span>
                  <p>{line.text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="panel span">
          <h2>人设补充</h2>
          <p className="hint">
            写在这里的文字会盖过内置默认，并出现在 <code>GET /pet/config</code> 的 effective 里，给以后的对话适配器读。
            可以用 <code>{"{{honorific}}"}</code> 和 <code>{"{{nickname}}"}</code>。眼前的短台词仍由上面的旋钮决定。
          </p>
          <div className="persona-grid">
            {(["normal", "dark", "duo"] as const).map((id) => (
              <label key={id} className="field">
                <span>{draft.forms[id].displayName}</span>
                <textarea
                  value={draft.forms[id].persona}
                  maxLength={2000}
                  placeholder="留空则使用内置默认"
                  onChange={(event) => edit((current) => ({
                    ...current,
                    forms: { ...current.forms, [id]: { ...current.forms[id], persona: event.target.value } },
                  }))}
                />
                <details>
                  <summary>内置默认</summary>
                  <pre>{materializePersona(DEFAULT_PERSONA[id], draft)}</pre>
                </details>
              </label>
            ))}
          </div>
          <div className="reserved-row">
            {(["form4", "form5"] as const).map((id) => (
              <div key={id} className="reserved">
                <Switch
                  on={draft.forms[id].enabled}
                  label={`启用${draft.forms[id].displayName}`}
                  onChange={(value) => edit((current) => ({
                    ...current,
                    forms: { ...current.forms, [id]: { ...current.forms[id], enabled: value } },
                  }))}
                />
                <label className="field">
                  <span>补充人设</span>
                  <textarea
                    value={draft.forms[id].persona}
                    maxLength={2000}
                    disabled={!draft.forms[id].enabled}
                    placeholder="启用后可以先写人设，立绘以后再补"
                    onChange={(event) => edit((current) => ({
                      ...current,
                      forms: { ...current.forms, [id]: { ...current.forms[id], persona: event.target.value } },
                    }))}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

        <div className="settings-grid">
          <section className="panel">
            <h2>禁忌词</h2>
            <p className="hint">短台词和外面投来的气泡都会把这些词换成 ※。回车添加。</p>
            <div className="chips">
              {draft.tabooWords.map((word) => (
                <span key={word} className="chip">
                  {word}
                  <button
                    type="button"
                    aria-label={`去掉 ${word}`}
                    onClick={() => edit((current) => ({ ...current, tabooWords: current.tabooWords.filter((item) => item !== word) }))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tabooDraft}
              maxLength={32}
              placeholder="不想听到的词"
              onChange={(event) => setTabooDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addTaboo();
                }
              }}
            />
          </section>

          <section className="panel">
            <h2>窗口与动画包</h2>
            <Slider
              label={`缩放 % · 约 ${Math.round(360 * draft.window.scale)}×${Math.round(480 * draft.window.scale)}`}
              value={Math.round(draft.window.scale * 100)}
              min={40}
              max={200}
              onChange={(value) => edit((current) => ({ ...current, window: { ...current.window, scale: value / 100 } }))}
            />
            <div className="row-actions">
              <button type="button" onClick={() => edit((current) => ({ ...current, window: { ...current.window, scale: 0.5 } }))}>小</button>
              <button type="button" onClick={() => edit((current) => ({ ...current, window: { ...current.window, scale: 0.65 } }))}>中</button>
              <button type="button" onClick={() => edit((current) => ({ ...current, window: { ...current.window, scale: 1 } }))}>大</button>
            </div>
            <Switch
              on={draft.window.alwaysOnTop}
              label="置顶"
              onChange={(value) => edit((current) => ({ ...current, window: { ...current.window, alwaysOnTop: value } }))}
            />
            <label className="field">
              <span>动画包路径</span>
              <input
                value={draft.pack.root}
                onChange={(event) => edit((current) => ({ ...current, pack: { root: event.target.value } }))}
              />
            </label>
            <p className="hint">
              把 <code>idle.webm</code>、<code>thinking.gif</code> 这类文件放进 <code>animations/&lt;形态&gt;/</code>，文件名用六个状态名。没有文件时用内置矢量。
            </p>
            <div className="row-actions">
              <button type="button" onClick={() => void reloadPack()}>重新扫描</button>
              <button type="button" onClick={() => reveal("pack")}>打开动画包</button>
            </div>
            {backend.pack ? <p className="hint">{backend.pack.name} · {backend.pack.credit}</p> : null}
          </section>
        </div>

        <section className="panel span">
          <h2>适配器</h2>
          <p className="hint">
            <code>POST /pet/work-status</code> 是外部状态槽，最后写入者生效，不受下面的开关影响，也绝不会换形态。
            开关管的是 <code>POST /pet/events</code> 的 source。
          </p>
          <Adapter
            title="DSH"
            body="v0 不连接 DSH 本体。会话事件以后译成 source=dsh 再投进来。整理档会并进工作。"
            on={draft.adapters.dsh}
            onChange={(value) => edit((current) => ({ ...current, adapters: { ...current.adapters, dsh: value } }))}
          />
          <Adapter
            title="Codex"
            body="examples/codex-notify.mjs 在回合结束时回报完成。关掉之后脚本会得到 403。"
            on={draft.adapters.codex}
            onChange={(value) => edit((current) => ({ ...current, adapters: { ...current.adapters, codex: value } }))}
          />
          <Adapter
            title="通用 Webhook"
            body="任何本机脚本都可以 POST /pet/events，source 填 webhook。"
            on={draft.adapters.webhook}
            onChange={(value) => edit((current) => ({ ...current, adapters: { ...current.adapters, webhook: value } }))}
          />
          <label className="field">
            <span>接口端口（改完要重启）</span>
            <input
              type="number"
              min={1024}
              max={65535}
              value={draft.api.port}
              onChange={(event) => edit((current) => ({ ...current, api: { ...current.api, port: Number(event.target.value) } }))}
            />
          </label>
          {backend.api ? (
            <p className="endpoint">
              <code>{backend.api.base}</code>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(backend.api?.base ?? "")}
              >
                复制
              </button>
            </p>
          ) : null}
        </section>

        <footer className="settings-footer">
          <div>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                if (!armReset) {
                  setArmReset(true);
                  return;
                }
                void postReset().then((result) => {
                  dirty.current = false;
                  setArmReset(false);
                  if (result.ok) setDraft(result.settings);
                });
              }}
            >
              {armReset ? "再点一次，恢复全部默认" : "恢复全部默认"}
            </button>
            {armReset ? <button type="button" className="quiet" onClick={() => setArmReset(false)}>取消</button> : null}
          </div>
          <div className="footer-meta">
            {backend.paths ? <button type="button" className="quiet" onClick={() => reveal("settings")}>{backend.paths.settingsPath}</button> : null}
            {window.sakuraPet ? <button type="button" className="quiet" onClick={quitApp}>退出桌宠</button> : <button type="button" className="quiet" onClick={() => { window.location.hash = "#/pet"; }}>看桌宠</button>}
            <a href={INSPIRATION_URL} target="_blank" rel="noreferrer">架构启发自 dsh-pet</a>
          </div>
        </footer>
        {!window.sakuraPet ? <p className="hint">这是浏览器里的同一套界面。透明置顶窗由 Electron 打开。</p> : null}
        <p className="hint">双击桌宠、底栏或逗号键也能打开这份设置。数字键 1 到 3 换形态。</p>
      </div>
    </main>
  );
}

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field slider">
      <span>{label}<b>{Math.round(value)}</b></span>
      <input type="range" min={min} max={max} value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Switch({
  on,
  label,
  onChange,
  hideLabel = false,
}: {
  on: boolean;
  label: string;
  onChange: (value: boolean) => void;
  hideLabel?: boolean;
}) {
  return (
    <div className={hideLabel ? "switch-row bare" : "switch-row"}>
      {hideLabel ? null : <span>{label}</span>}
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? "switch on" : "switch"} onClick={() => onChange(!on)}>
        <span className="knob" />
      </button>
    </div>
  );
}

function Adapter({ title, body, on, onChange }: { title: string; body: string; on: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="adapter">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <Switch on={on} label={title} hideLabel onChange={onChange} />
    </div>
  );
}
