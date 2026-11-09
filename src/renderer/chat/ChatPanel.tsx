import { useEffect, useRef, useState } from "react";
import { postLlmChat } from "../api";
import { useBackend } from "../useBackend";

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const backend = useBackend();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const field = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = backend.settings?.theme === "glass" ? "glass" : "warm";
  }, [backend.settings?.theme]);

  useEffect(() => {
    const id = window.setTimeout(() => field.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = () => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setNote("");
    void postLlmChat(message).then(() => {
      onClose();
    }).catch(() => {
      setNote("接口没有应答");
      setBusy(false);
    });
  };

  return (
    <form
      className="chat-dock"
      data-no-drag
      data-hit
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <header className="chat-dock-bar">
        <strong>对话</strong>
        <button type="button" className="chat-dock-close" onClick={onClose} aria-label="关闭对话">关闭</button>
      </header>
      <textarea
        ref={field}
        value={text}
        maxLength={400}
        placeholder="说点什么..."
        aria-label="说点什么"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
      />
      <footer className="chat-dock-foot">
        {note ? <p className="chat-note">{note}</p> : <p className="chat-note quiet">Esc 关闭 · Enter 发送</p>}
        <button type="submit" className="chat-send" disabled={busy || !text.trim()}>{busy ? "发送中…" : "发送"}</button>
      </footer>
    </form>
  );
}
