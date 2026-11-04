import { useEffect, useState } from "react";
import { PetApp } from "./pet/PetApp";
import { SettingsApp } from "./settings/SettingsApp";

function readRoute(): "pet" | "settings" {
  const hash = window.location.hash.replace(/^#/, "");
  return hash.startsWith("/settings") ? "settings" : "pet";
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
    document.title = route === "settings" ? "樱 · 设置" : "樱";
  }, [route]);

  return route === "settings" ? <SettingsApp /> : <PetApp />;
}
