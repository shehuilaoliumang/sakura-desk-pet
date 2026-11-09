/// <reference types="vite/client" />

import type { PetLayoutEvent } from "../shared/screenLayout";

export type PreparedMenu = {
  side: "left" | "right" | "top" | "bottom";
  menu: { x: number; y: number };
  pad: { left: number; right: number; top: number; bottom: number };
  menuW: number;
  menuH: number;
  clampH: number;
};

export interface SakuraPetBridge {
  beginDrag(): void;
  endDrag(): void;
  openSettings(): void;
  openChat?(): void;
  closeChat?(): void;
  quit(): void;
  reveal(target: "settings" | "pack"): void;
  setMouseIgnore(ignore: boolean): void;
  getWorkArea?(): Promise<unknown>;
  prepareMenu?(size?: { width?: number; height?: number; prefer?: string }): Promise<PreparedMenu | null>;
  restoreMenu?(): Promise<boolean>;
  getLayout?(): Promise<PetLayoutEvent | null>;
  onLayout?(listener: (layout: PetLayoutEvent) => void): () => void;
}

declare global {
  interface Window {
    sakuraPet?: SakuraPetBridge;
  }
}
