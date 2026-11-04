/// <reference types="vite/client" />

export interface SakuraPetBridge {
  moveBy(dx: number, dy: number): void;
  moveEnd(): void;
  openSettings(): void;
  quit(): void;
  reveal(target: "settings" | "pack"): void;
}

declare global {
  interface Window {
    sakuraPet?: SakuraPetBridge;
  }
}
