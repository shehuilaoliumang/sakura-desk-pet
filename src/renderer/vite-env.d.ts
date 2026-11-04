/// <reference types="vite/client" />

export interface SakuraPetBridge {
  moveBy(dx: number, dy: number): void;
  moveEnd(): void;
  openSettings(): void;
  quit(): void;
  reveal(target: "settings" | "pack"): void;
  setMouseIgnore(ignore: boolean): void;
  getWorkArea?(): Promise<{
    workArea: { x: number; y: number; width: number; height: number };
    bounds: { x: number; y: number; width: number; height: number };
  } | null>;
}

declare global {
  interface Window {
    sakuraPet?: SakuraPetBridge;
  }
}
