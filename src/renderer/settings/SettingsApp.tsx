import { useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_PERSONA } from "@shared/defaults";
import { listLlmProviders } from "@shared/llm";
import { speakFor } from "@shared/lines";
import { materializePersona } from "@shared/persona";
import {
  FORM_IDS,
  PET_EVENTS,
  STATUS_LABEL,
  type FormId,
  type PetEvent,
  type Settings,
  type ThemeId,
} from "@shared/types";
import { INSPIRATION_URL } from "@shared/version";
import { postForm, postLlmChat, postLlmTest, postReset, putSettings, quitApp, reloadPack, reveal } from "../api";
import { useBackend } from "../useBackend";

type SaveState = "idle" | "saving" | "saved" | "error";
type FoldId = "basic" | "chat" | "advanced";

const FOLD_DEFAULT: Record<FoldId, boolean> = {
  basic: true,
  chat: true,
  advanced: false,
};

export function SettingsApp() {
  const backend = useBackend();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<PetEvent>("thinking");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [tabooDraft, setTabooDraft] = useState("");
  const [armReset, setArmReset] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [llmBusy, setLlmBusy] = useState<"test" | "chat" | null>(null);
  const [llmNote, setLlmNote] = useState("");
  const [llmNoteOk, setLlmNoteOk] = useState(false);
  const [chatDraft, setChatDraft] = useState("在吗");
  const [openSections, setOpenSections] = useState(FOLD_DEFAULT);
  const dirty = useRef(false);
  const seq = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (backend.settings && !dirty.current) setDraft(backend.settings);
  }, [backend.settings]);

  useEffect(() => {
    const theme = draft?.theme ?? backend.settings?.theme;
    document.documentElement.dataset.theme = theme === "glass" ? "glass" : "warm";
  }, [draft?.theme, backend.settings?.theme]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  if (!draft || !backend.state) {
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
  const spoken = speakFor(draft, preview, draft.activeForm);
  const personaNotes = (["normal", "dark", "duo", "form4", "form5"] as const).filter((id) => draft.forms[id].persona.trim()).length;
  const toggleSection = (id: FoldId) => {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  };

  const finishSave = (id: number, result: Awaited<ReturnType<typeof putSettings>>): boolean => {
    if (id !== seq.current) return false;
    if (!result.ok) {
      setSaveState("error");
      setSaveError("issues" in result && result.issues ? result.issues.join(" ") : result.reason ?? "没有写上");
      return false;
    }
    dirty.current = false;
    setDraft(result.settings);
    setSaveState("saved");
    setSaveError("");
    return true;
  };

  const failSave = (id: number): boolean => {
    if (id !== seq.current) return false;
    setSaveState("error");
    setSaveError("接口没有应答");
    return false;
  };

  const flush = (next: Settings): Promise<boolean> => {
    dirty.current = true;
    setArmReset(false);
    const id = ++seq.current;
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setSaveState("saving");
    return putSettings(next).then((result) => finishSave(id, result)).catch(() => failSave(id));
  };

  const schedule = (next: Settings) => {
    dirty.current = true;
    setArmReset(false);
    const id = ++seq.current;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSaveState("saving");
      void putSettings(next).then((result) => finishSave(id, result)).catch(() => failSave(id));
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

  const askLlm = async () => {
    const message = chatDraft.trim();
    if (!message) return;
    setLlmBusy("chat");
    setLlmNote("");
    try {
      const saved = await flush(draft);
      if (!saved) {
        setLlmNoteOk(false);
        setLlmNote("配置还没写上，这句话没有发出。");
        return;
      }
      const result = await postLlmChat(message);
      setLlmNoteOk(result.ok === true && result.source === "llm");
      const line = result.text || "没有回音。";
      const why = result.source === "fallback" && result.detail ? `（${result.detail}）` : "";
      setLlmNote(`${line}${why}`);
    } catch {
      setLlmNoteOk(false);
      setLlmNote("接口没有应答");
    } finally {
      setLlmBusy(null);
    }
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

        <Section id="basic" title="基础设置" summary={draft.forms[draft.activeForm].displayName} open={openSections.basic} onToggle={toggleSection}>
          <div className="subblock">
            <h3>配色</h3>
            <label className="field">
              <span>主题</span>
              <select
                value={draft.theme}
                onChange={(event) => edit((current) => ({ ...current, theme: event.target.value as ThemeId }))}
              >
                <option value="warm">经典暖色</option>
                <option value="glass">浅色毛玻璃</option>
              </select>
            </label>
          </div>
          <div className="subblock">
            <h3>称呼</h3>
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
          </div>
          <div className="subblock">
            <h3>形态</h3>
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
          </div>
        </Section>

        <Section id="chat" title="对话设置" summary={draft.llm.enabled ? "已打开" : "未打开"} open={openSections.chat} onToggle={toggleSection}>
          <p className="hint">
            空闲、工作、等待这些状态气泡仍用内置短句，不会在每次状态变化时去问模型。
            桌宠平时只留立绘和气泡。右键「对话」或按 L，在立绘旁边打开一块对话面板，不盖住人物。发出去后面板留着，输入框清空，可以接着问。按 Esc、点关闭，或再点一次「对话」就收起。托盘「试对话」只发送「在吗」，不打开面板。
            没打开、没填密钥或接口地址、或请求失败时，气泡改说「……这会儿说不了。」，工作状态不动。
            密钥只写在本机配置里。
          </p>
          <Switch
            on={draft.llm.enabled}
            label="启用智能对话"
            onChange={(value) => edit((current) => ({ ...current, llm: { ...current.llm, enabled: value } }))}
          />
          <label className="field">
            <span>提供方</span>
            <select
              value={draft.llm.provider}
              onChange={(event) => edit((current) => ({ ...current, llm: { ...current.llm, provider: event.target.value } }))}
            >
              {listLlmProviders().map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.label}</option>
              ))}
              {listLlmProviders().some((provider) => provider.id === draft.llm.provider) ? null : (
                <option value={draft.llm.provider}>{draft.llm.provider}</option>
              )}
            </select>
          </label>
          <label className="field">
            <span>接口地址</span>
            <input
              value={draft.llm.baseUrl}
              maxLength={500}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://api.openai.com/v1"
              onChange={(event) => edit((current) => ({ ...current, llm: { ...current.llm, baseUrl: event.target.value } }))}
            />
          </label>
          <p className="hint">
            例子：<code>https://api.openai.com/v1</code>、<code>https://api.deepseek.com</code>、<code>http://127.0.0.1:11434/v1</code>。
            程序会补上 <code>/chat/completions</code>。本地服务若也要密钥，可以填任意占位。
          </p>
          <label className="field">
            <span>密钥</span>
            <input
              type={showKey ? "text" : "password"}
              value={draft.llm.apiKey}
              maxLength={2000}
              spellCheck={false}
              autoComplete="off"
              placeholder="只保存在本机 settings.json"
              onChange={(event) => edit((current) => ({ ...current, llm: { ...current.llm, apiKey: event.target.value } }))}
            />
          </label>
          <div className="row-actions">
            <button type="button" onClick={() => setShowKey((value) => !value)}>{showKey ? "隐藏密钥" : "显示密钥"}</button>
          </div>
          <label className="field">
            <span>模型（可留空）</span>
            <input
              value={draft.llm.model}
              maxLength={128}
              spellCheck={false}
              autoComplete="off"
              placeholder="留空则用 gpt-4o-mini"
              onChange={(event) => edit((current) => ({ ...current, llm: { ...current.llm, model: event.target.value } }))}
            />
          </label>
          <label className="field">
            <span>思考</span>
            <select
              value={draft.llm.reasoningEffort}
              onChange={(event) => {
                const value = event.target.value;
                if (value !== "auto" && value !== "none" && value !== "off") return;
                edit((current) => ({ ...current, llm: { ...current.llm, reasoningEffort: value } }));
              }}
            >
              <option value="auto">自动（本机或 Qwen 直接说短句）</option>
              <option value="none">直接说短句</option>
              <option value="off">允许思考</option>
            </select>
          </label>
          <p className="hint">
            「直接说短句」会在请求里加上 reasoning_effort: none。LM Studio 的 Qwen 会少写思考、马上回一句。
            云端接口若不认识这项，选「允许思考」。
          </p>
          <label className="field">
            <span>超时（毫秒）</span>
            <input
              type="number"
              min={500}
              max={120000}
              value={draft.llm.timeoutMs}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                edit((current) => ({ ...current, llm: { ...current.llm, timeoutMs: value } }));
              }}
            />
          </label>
          <div className="row-actions">
            <button
              type="button"
              disabled={llmBusy !== null}
              onClick={() => {
                setLlmBusy("test");
                setLlmNote("");
                void flush(draft).then(async (saved) => {
                  if (!saved) {
                    setLlmNoteOk(false);
                    setLlmNote("配置还没写上，连接没有发出。");
                    return;
                  }
                  const result = await postLlmTest();
                  setLlmNoteOk(result.ok);
                  setLlmNote(result.detail || result.reason || (result.ok ? "连上了。" : "没有连上。"));
                }).catch(() => {
                  setLlmNoteOk(false);
                  setLlmNote("接口没有应答");
                }).finally(() => setLlmBusy(null));
              }}
            >
              {llmBusy === "test" ? "正在测试…" : "测试连接"}
            </button>
          </div>
          <p className="hint">测试连接不要求先打开开关，也不会改桌宠身上的气泡。</p>
          <label className="field">
            <span>试对话</span>
            <input
              value={chatDraft}
              maxLength={400}
              placeholder="问一句"
              onChange={(event) => setChatDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void askLlm();
              }}
            />
          </label>
          <div className="row-actions">
            <button type="button" disabled={llmBusy !== null || !chatDraft.trim()} onClick={() => void askLlm()}>
              {llmBusy === "chat" ? "正在问…" : "试对话"}
            </button>
          </div>
          {llmNote ? <p className={llmNoteOk ? "llm-note ok" : "llm-note bad"}>{llmNote}</p> : null}
        </Section>


        <Section id="advanced" title="进阶设置" summary={personaNotes ? `${personaNotes} 处人设补充` : "语气、窗口、适配器"} open={openSections.advanced} onToggle={toggleSection}>
          <div className="settings-grid">
          <div className="subblock">
            <h3>语气</h3>
            <p className="hint">这些旋钮决定现在这几句短台词。强度拉高会把句子说完整，敬语倾向压低时常态樱会收着敬语。毒舌上限是黑樱的天花板，强度不能把它顶破。</p>
            <Slider label="语气强度" value={draft.tone.intensity} onChange={(value) => edit((current) => ({ ...current, tone: { ...current.tone, intensity: value } }))} />
            <Slider label="敬语倾向" value={draft.tone.politeness} onChange={(value) => edit((current) => ({ ...current, tone: { ...current.tone, politeness: value } }))} />
            <Slider label="黑樱毒舌上限" value={draft.snarkCap} onChange={(value) => edit((current) => ({ ...current, snarkCap: value }))} />
            <Switch
              on={draft.darkMayAddressDirectly}
              label="允许黑樱直呼"
              onChange={(value) => edit((current) => ({ ...current, darkMayAddressDirectly: value }))}
            />
          </div>
          <div className="subblock">
            <h3>双人声部</h3>
            <p className="hint">开着双气泡时，状态短句两边都会说。主动对话也是黑樱和常态樱各对你说一句，用 || 分开；两句只回答你刚才的话，不介绍、不评价对方。若还是写了对方的名字，会再要一次。关掉双气泡时，只留下占比不低于一半的那一方；正好一半时由黑樱对你说。</p>
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
              <p className="preview-note">预听当前旋钮，不会改桌宠身上的状态。</p>
              {spoken.lines.map((line) => (
                <div key={`${line.speaker}-${line.text}`}>
                  <span className="who">{line.speaker === "dark" ? draft.forms.dark.displayName : draft.forms.normal.displayName}</span>
                  <p>{line.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="subblock span">
            <h3>人设补充</h3>
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
          </div>
          <div className="subblock">
            <h3>禁忌词</h3>
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
          </div>
          <div className="subblock">
            <h3>窗口与动画包</h3>
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
              把 <code>idle.webm</code>、<code>thinking.gif</code> 这类文件放进 <code>animations/&lt;形态&gt;/</code>，文件名用六个状态名。喜怒哀乐放在同形态的 <code>angry</code>、<code>sad</code>、<code>joyful</code> 目录，喜沿用原来的 <code>click</code>。没有文件时用内置矢量。点立绘不改工作状态。
            </p>
            <div className="row-actions">
              <button type="button" onClick={() => void reloadPack()}>重新扫描</button>
              <button type="button" onClick={() => reveal("pack")}>打开动画包</button>
            </div>
            {backend.pack ? <p className="hint">{backend.pack.name} · {backend.pack.credit}</p> : null}
          </div>
          <div className="subblock span">
            <h3>适配器</h3>
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
          </div>
        </div>
        </Section>
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

function Section({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: FoldId;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: (id: FoldId) => void;
  children: ReactNode;
}) {
  const bodyId = `fold-${id}`;
  return (
    <section className={open ? "panel is-open" : "panel"}>
      <h2>
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(id)}
        >
          <span className="fold-title">{title}</span>
          <span className="fold-summary">{summary ?? ""}</span>
          <span className={open ? "fold-chevron open" : "fold-chevron"} aria-hidden="true" />
        </button>
      </h2>
      <div id={bodyId} className="fold-body" hidden={!open}>
        {children}
      </div>
    </section>
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
