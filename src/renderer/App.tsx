import { useEffect, useState } from "react";
import { ChatPanel } from "./chat/ChatPanel";
import { PetApp } from "./pet/PetApp";
import { SettingsApp } from "./settings/SettingsApp";

function readRoute(): "pet" | "settings" | "chat" {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("/settings")) return "settings";
  if (hash.startsWith("/chat")) return "chat";
  return "pet";
}

export function App() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.body.dataset.window = route;
    document.title = route === "settings" ? "樱 · 设置" : route === "chat" ? "樱 · 对话" : "樱";
  }, [route]);

  if (route === "settings") return <SettingsApp />;
  if (route === "chat") {
    return <ChatPanel onClose={() => {
      if (window.sakuraPet?.closeChat) window.sakuraPet.closeChat();
      else window.close();
    }} />;
  }
  return <PetApp />;
}
