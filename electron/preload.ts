import { contextBridge, ipcRenderer } from "electron";
import type { PetLayoutEvent } from "../src/shared/screenLayout";

export type PreparedMenu = {
  side: "left" | "right" | "top" | "bottom";
  menu: { x: number; y: number };
  pad: { left: number; right: number; top: number; bottom: number };
  menuW: number;
  menuH: number;
  clampH: number;
};

contextBridge.exposeInMainWorld("sakuraPet", {
  beginDrag() {
    ipcRenderer.send("sakura:drag-start");
  },
  endDrag() {
    ipcRenderer.send("sakura:drag-end");
  },
  openSettings() {
    ipcRenderer.send("sakura:open-settings");
  },
  openChat() {
    ipcRenderer.send("sakura:open-chat");
  },
  closeChat() {
    ipcRenderer.send("sakura:close-chat");
  },
  setChatPreview(open: boolean) {
    ipcRenderer.send("sakura:chat-preview", !!open);
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
  getLayout() {
    return ipcRenderer.invoke("sakura:get-layout") as Promise<PetLayoutEvent | null>;
  },
  onLayout(listener: (layout: PetLayoutEvent) => void) {
    const wrapped = (_event: unknown, layout: PetLayoutEvent) => listener(layout);
    ipcRenderer.on("sakura:layout", wrapped);
    return () => ipcRenderer.removeListener("sakura:layout", wrapped);
  },
});
