/// <reference types="vite/client" />

export type PreparedMenu = {
  side: "left" | "right" | "top" | "bottom";
  menu: { x: number; y: number };
  pad: { left: number; right: number; top: number; bottom: number };
  menuW: number;
  menuH: number;
  clampH: number;
};

export interface SakuraPetBridge {
  dragStart(): Promise<boolean>;
  dragEnd(): Promise<{ moved: boolean }>;
  onDragFinished?(listener: (result: { moved: boolean }) => void): () => void;
  openSettings(): void;
  quit(): void;
  reveal(target: "settings" | "pack"): void;
  setMouseIgnore(ignore: boolean): void;
  getWorkArea?(): Promise<unknown>;
  prepareMenu?(size?: { width?: number; height?: number; prefer?: string }): Promise<PreparedMenu | null>;
  restoreMenu?(): Promise<boolean>;
}

declare global {
  interface Window {
    sakuraPet?: SakuraPetBridge;
  }
}
