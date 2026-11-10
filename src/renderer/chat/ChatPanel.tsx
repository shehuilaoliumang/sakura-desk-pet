import { useEffect, useRef, useState } from "react";
import { postLlmChat, type LlmRouteResult } from "../api";
import { useBackend } from "../useBackend";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export function ChatPanel({
  onClose,
  onPreview,
}: {
  onClose: () => void;
  onPreview?: (open: boolean) => void;
}) {
  const backend = useBackend();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = backend.settings?.theme === "glass" ? "glass" : "warm";
  }, [backend.settings?.theme]);

  useEffect(() => {
    const id = window.setTimeout(() => field.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    speechRef.current?.stop();
    window.sakuraPet?.setChatPreview?.(false);
    onPreview?.(false);
  }, [onPreview]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const notifyPreview = (open: boolean) => {
    window.sakuraPet?.setChatPreview?.(open);
    onPreview?.(open);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    notifyPreview(false);
  };

  const attachImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setNote("只接受图片文件");
      return;
    }
    if (file.size > 8_000_000) {
      setNote("图片太大，请换一张小一点的");
      return;
    }
    try {
      setImage(await shrinkImage(file));
      setNote("");
    } catch {
      setNote("这张图片读不出来");
    }
  };

  const openCamera = async () => {
    if (cameraOn) {
      stopCamera();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setNote("这台浏览器打不开摄像头");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      notifyPreview(true);
      setNote("");
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      }, 0);
    } catch (error) {
      setNote(cameraError(error));
    }
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setNote("摄像头还没有画面");
      return;
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNote("拍不下来");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setImage(canvas.toDataURL("image/jpeg", 0.85));
    setNote("拍好了，确认后再发送");
    stopCamera();
  };

  const toggleMic = () => {
    if (listening) {
      speechRef.current?.stop();
      setListening(false);
      return;
    }
    const host = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Ctor) {
      setNote("这台浏览器没有语音识别");
      return;
    }
    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i];
        const said = piece?.[0]?.transcript ?? "";
        if (piece?.isFinal) finalText += said;
        else interim += said;
      }
      if (finalText.trim()) {
        setText((current) => `${current}${current && !current.endsWith("\n") ? "" : ""}${finalText}`.trimStart());
        setNote("转好了，确认后再发送");
      } else if (interim) {
        setNote(`正在听：${interim}`);
      }
    };
    rec.onerror = (event) => {
      setListening(false);
      setNote(micError(event.error));
    };
    rec.onend = () => setListening(false);
    speechRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setNote("正在听…说完会填进输入框，不会直接发出");
    } catch {
      setNote("麦克风开不了");
    }
  };

  const send = () => {
    const message = text.trim();
    if (listening) {
      setNote("请先听完，确认文字后再发送");
      return;
    }
    if ((!message && !image) || busy) return;
    setBusy(true);
    setNote("");
    void postLlmChat(message, image ?? undefined).then((result: LlmRouteResult) => {
      if (image && !result.ok) {
        setNote(result.detail || "图片没有发出去");
        setBusy(false);
        return;
      }
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
      <div className="chat-dock-body">
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
        {image ? (
          <div className="chat-attach">
            <img src={image} alt="待发送的图片" />
            <button type="button" onClick={() => setImage(null)}>取消图片</button>
          </div>
        ) : null}
        {cameraOn ? (
          <div className="chat-camera-frame">
            <video ref={videoRef} muted playsInline autoPlay />
          </div>
        ) : null}
      </div>
      <footer className="chat-dock-foot">
        {cameraOn ? (
          <div className="chat-camera-actions">
            <button type="button" onClick={shoot}>拍下</button>
            <button type="button" onClick={stopCamera}>取消</button>
          </div>
        ) : null}
        <div className="chat-tools">
          <button type="button" className="chat-tool" aria-label="图库" title="图库" onClick={() => fileRef.current?.click()}>
            <GalleryIcon />
          </button>
          <button type="button" className="chat-tool" aria-label="相机" title="相机" aria-pressed={cameraOn} onClick={() => void openCamera()}>
            <CameraIcon />
          </button>
          <button type="button" className="chat-tool" aria-label="麦克风" title="麦克风" aria-pressed={listening} onClick={toggleMic}>
            <MicIcon />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void attachImage(file);
            }}
          />
        </div>
        <div className="chat-send-side">
          {note ? <p className="chat-note">{note}</p> : <p className="chat-note quiet">Esc 关闭 · Enter 发送</p>}
          <button type="submit" className="chat-send" disabled={busy || listening || (!text.trim() && !image)}>
            {busy ? "发送中…" : "发送"}
          </button>
        </div>
      </footer>
    </form>
  );
}

function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

function cameraError(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name: string }).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "没有拿到摄像头权限";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "没有找到摄像头";
  if (name === "NotReadableError") return "摄像头被占用";
  return "打不开摄像头";
}

function micError(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "没有拿到麦克风权限";
  if (code === "audio-capture") return "没有找到麦克风";
  if (code === "network") return "语音识别没连上，文字还没填进去";
  return "语音识别失败，没有填进输入框";
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.3" />
      <path d="M7 16l3.2-3.2 2.1 2.1L15.5 11 19 15" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 7.5l1.2-2h5.6L16 7.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z" />
      <circle cx="12" cy="12.5" r="2.6" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="10" rx="3" />
      <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20" />
    </svg>
  );
}
