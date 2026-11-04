import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sakuraPet", {
  moveBy(dx: number, dy: number) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    ipcRenderer.send("sakura:move-by", { dx, dy });
  },
  moveEnd() {
    ipcRenderer.send("sakura:move-end");
  },
  openSettings() {
    ipcRenderer.send("sakura:open-settings");
  },
  quit() {
    ipcRenderer.send("sakura:quit");
  },
  reveal(target: "settings" | "pack") {
    ipcRenderer.send("sakura:reveal", target);
  },
  setMouseIgnore(ignore: boolean) {
    ipcRenderer.send("sakura:set-mouse-ignore", !!ignore);
  },
  getWorkArea() {
    return ipcRenderer.invoke("sakura:work-area") as Promise<{
      workArea: { x: number; y: number; width: number; height: number };
      bounds: { x: number; y: number; width: number; height: number };
    } | null>;
  },
});
