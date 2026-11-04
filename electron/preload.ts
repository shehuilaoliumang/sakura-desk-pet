import { contextBridge, ipcRenderer } from "electron";

export type PreparedMenu = {
  side: "left" | "right" | "top" | "bottom";
  menu: { x: number; y: number };
  pad: { left: number; right: number; top: number; bottom: number };
  menuW: number;
  menuH: number;
  clampH: number;
};

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
    return ipcRenderer.invoke("sakura:work-area");
  },
  prepareMenu(size?: { width?: number; height?: number; prefer?: string }) {
    return ipcRenderer.invoke("sakura:prepare-menu", size ?? {}) as Promise<PreparedMenu | null>;
  },
  restoreMenu() {
    return ipcRenderer.invoke("sakura:restore-menu") as Promise<boolean>;
  },
});
