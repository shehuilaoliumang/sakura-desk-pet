import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import { dataDir } from "../src/main/paths";
import { PetRuntime, type ChangeReason } from "../src/main/runtime";
import { startServer } from "../src/main/server";
import type http from "node:http";

const BASE_W = 360;
const BASE_H = 520;
/** Match dsh-pet: window keeps side chrome so menus/bubbles fit without covering the figure. */
const WINDOW_MARGIN_RATIO = 0.5;
function petWindowSize(scale: number): { width: number; height: number; contentW: number; contentH: number; side: number; top: number; bottom: number } {
  const contentW = Math.round(BASE_W * scale);
  const contentH = Math.round(BASE_H * scale);
  const side = Math.max(200, Math.round(contentW * WINDOW_MARGIN_RATIO));
  const top = Math.max(56, Math.round(side * 0.28));
  const bottom = Math.max(40, Math.round(side * 0.22));
  return {
    contentW,
    contentH,
    side,
    top,
    bottom,
    width: contentW + side * 2,
    height: contentH + top + bottom,
  };
}

app.setName("sakura-pet");
app.setPath("userData", dataDir());
app.commandLine.appendSwitch("enable-transparent-visuals");

let runtime: PetRuntime | null = null;
let server: http.Server | null = null;
let petWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;
/** While the context menu is open, window is expanded; content origin stays fixed on screen. */
let menuChrome: { x: number; y: number; width: number; height: number } | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!petWin) return;
    petWin.show();
    petWin.focus();
  });
  app.whenReady().then(() => {
    void boot().catch((error: unknown) => {
      console.error("[sakura-pet] failed to start", error);
      app.exit(1);
    });
  });
}

async function boot(): Promise<void> {
  const appRoot = process.env.SAKURA_PET_ROOT ? path.resolve(process.env.SAKURA_PET_ROOT) : path.resolve(__dirname, "..");
  runtime = new PetRuntime({ dataDir: dataDir(), appRoot });
  runtime.load();
  try {
    server = await startServer(runtime, runtime.settings.api.port);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "EADDRINUSE") {
      console.error(`[sakura-pet] 端口 ${runtime.settings.api.port} 已被占用。改 ${runtime.settingsPath} 里的 api.port 后重启。`);
    }
    throw error;
  }
  const config = runtime.getConfig();
  console.log(`[sakura-pet] listening on ${config.api.base}`);
  console.log(`[sakura-pet] settings ${config.paths.settingsPath}`);
  console.log(`[sakura-pet] pack ${config.paths.packPath}`);
  console.log(`[sakura-pet] form ${runtime.settings.activeForm}`);

  createPetWindow();
  runtime.on("change", (reason: ChangeReason) => {
    if (reason === "settings" || reason === "reload") applyChrome(reason === "reload");
  });
  wireIpc();
  wireDisplaySync();
}

function rendererUrl(hash: string): string | null {
  const base = process.env.SAKURA_PET_RENDERER_URL;
  if (!base) return null;
  const url = new URL(base);
  url.hash = hash;
  return url.toString();
}

function createPetWindow(): void {
  if (!runtime) return;
  const scale = runtime.settings.window.scale;
  const initial = petWindowSize(scale);
  const icon = path.join(appRoot(), "assets", "icon.png");
  petWin = new BrowserWindow({
    ...(fs.existsSync(icon) ? { icon } : {}),
    width: initial.width,
    height: initial.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: runtime.settings.window.alwaysOnTop,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    title: "\u6a31",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  petWin.setMenuBarVisibility(false);
  petWin.setMinimumSize(petWindowSize(0.4).width, petWindowSize(0.4).height);
  placePet(true);
  const dev = rendererUrl("/pet");
  if (dev) void petWin.loadURL(dev);
  else void petWin.loadFile(path.join(appRoot(), "dist", "index.html"), { hash: "/pet" });
  petWin.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[sakura-pet] renderer ${level} ${sourceId}:${line} ${message}`);
  });
  petWin.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[sakura-pet] failed to load ${url} ${code} ${description}`);
  });
  petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.setMinimumSize(petWindowSize(0.4).width, petWindowSize(0.4).height);
  petWin.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  petWin.once("ready-to-show", () => petWin?.show());
  petWin.on("closed", () => {
    petWin = null;
    app.quit();
  });
  petWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  petWin.webContents.on("will-navigate", (event, url) => {
    const allowed = process.env.SAKURA_PET_RENDERER_URL;
    if (allowed && url.startsWith(allowed)) return;
    if (url.startsWith("file://")) return;
    event.preventDefault();
  });
}

function openSettings(): void {
  if (!runtime) return;
  if (settingsWin) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  settingsWin = new BrowserWindow({
    width: Math.min(1100, area.width - 48),
    height: Math.min(860, area.height - 48),
    minWidth: 760,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f3eee6",
    title: "樱 · 设置",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.center();
  const dev = rendererUrl("/settings");
  if (dev) void settingsWin.loadURL(dev);
  else void settingsWin.loadFile(path.join(appRoot(), "dist", "index.html"), { hash: "/settings" });
  settingsWin.once("ready-to-show", () => settingsWin?.show());
  settingsWin.on("focus", () => petWin?.setAlwaysOnTop(false));
  const restoreTop = () => {
    if (runtime && petWin) petWin.setAlwaysOnTop(runtime.settings.window.alwaysOnTop, "screen-saver");
  };
  settingsWin.on("blur", restoreTop);
  settingsWin.on("closed", () => {
    settingsWin = null;
    restoreTop();
  });
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
}

type Rect = { x: number; y: number; width: number; height: number };

function workAreas(): Rect[] {
  return screen.getAllDisplays().map((d) => ({ ...d.workArea }));
}

function pointInRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

function rectAtPoint(rects: Rect[], x: number, y: number): Rect | null {
  for (const r of rects) if (pointInRect(r, x, y)) return r;
  return null;
}

function distToRectSq(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.height));
  return dx * dx + dy * dy;
}

function nearestRect(rects: Rect[], x: number, y: number): Rect | null {
  let best: Rect | null = null;
  let bestD = Infinity;
  for (const r of rects) {
    const d = distToRectSq(r, x, y);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/** Keep a point inside the union of work areas (snap to nearest screen if in a gap). */
function clampPointToDisplays(x: number, y: number): { x: number; y: number } {
  const areas = workAreas();
  if (areas.length === 0) return { x, y };
  if (rectAtPoint(areas, x, y)) return { x, y };
  const r = nearestRect(areas, x, y);
  if (!r) return { x, y };
  return {
    x: Math.min(Math.max(x, r.x), r.x + r.width - 1),
    y: Math.min(Math.max(y, r.y), r.y + r.height - 1),
  };
}

/** Keep pet window center on some display; margins may overhang into bezels. */
function clampPetOrigin(origin: Rect): Rect {
  const cx = origin.x + origin.width / 2;
  const cy = origin.y + origin.height / 2;
  const c = clampPointToDisplays(cx, cy);
  return {
    x: Math.round(c.x - origin.width / 2),
    y: Math.round(c.y - origin.height / 2),
    width: origin.width,
    height: origin.height,
  };
}

function placePet(force: boolean): void {
  if (!runtime || !petWin) return;
  const { x, y } = runtime.settings.window;
  if (typeof x === "number" && typeof y === "number") {
    const visible = screen.getAllDisplays().some((display) => {
      const b = display.workArea;
      return x >= b.x - 40 && y >= b.y - 40 && x < b.x + b.width - 20 && y < b.y + b.height - 20;
    });
    if (visible) {
      petWin.setPosition(x, y);
      return;
    }
  }
  if (!force && (typeof x === "number" || typeof y === "number")) return;
  const area = screen.getPrimaryDisplay().workArea;
  const [w, h] = petWin.getSize();
  petWin.setPosition(Math.round(area.x + area.width - w - 40), Math.round(area.y + area.height - h - 64));
}

function applyChrome(place: boolean): void {
  if (!runtime || !petWin) return;
  const size = petWindowSize(runtime.settings.window.scale);
  if (menuChrome) {
    // keep expanded shell; refresh content origin size bookkeeping
    menuChrome = { x: menuChrome.x, y: menuChrome.y, width: size.width, height: size.height };
    return;
  }
  const [x, y] = petWin.getPosition();
  petWin.setBounds({ x, y, width: size.width, height: size.height });
  petWin.setMinimumSize(petWindowSize(0.4).width, petWindowSize(0.4).height);
  petWin.setAlwaysOnTop(settingsWin?.isFocused() ? false : runtime.settings.window.alwaysOnTop, "screen-saver");
  if (place) placePet(true);
}


function ensureTray(): void {
  if (tray) return;
  const iconPath = path.join(appRoot(), "assets", "icon.png");
  const image = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  const fallback = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  );
  tray = new Tray(image.isEmpty() ? fallback : image);
  tray.setToolTip("\u6a31");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示桌宠", click: () => { petWin?.show(); petWin?.focus(); } },
      { label: "设置", click: () => openSettings() },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", () => {
    petWin?.show();
    petWin?.focus();
  });
}

function wireDisplaySync(): void {
  const resync = () => {
    if (!petWin || petWin.isDestroyed() || !runtime) return;
    if (menuChrome) return;
    const b = petWin.getBounds();
    const clamped = clampPetOrigin(b);
    if (clamped.x !== b.x || clamped.y !== b.y) {
      petWin.setPosition(clamped.x, clamped.y);
      runtime.setWindowPosition(clamped.x, clamped.y);
    }
  };
  let t: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      resync();
    }, 300);
  };
  screen.on("display-metrics-changed", schedule);
  screen.on("display-added", schedule);
  screen.on("display-removed", schedule);
}

function wireIpc(): void {
  ipcMain.on("sakura:move-by", (event, payload: { dx?: number; dy?: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin) return;
    if (typeof payload?.dx !== "number" || typeof payload?.dy !== "number") return;
    if (!Number.isFinite(payload.dx) || !Number.isFinite(payload.dy)) return;
    // Free move across monitors — never clamp to the current display mid-drag.
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + payload.dx), Math.round(y + payload.dy));
  });
  ipcMain.on("sakura:move-end", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin || !runtime) return;
    const b = win.getBounds();
    const clamped = clampPetOrigin(b);
    if (clamped.x !== b.x || clamped.y !== b.y) {
      win.setPosition(clamped.x, clamped.y);
    }
    const [x, y] = win.getPosition();
    runtime.setWindowPosition(x, y);
  });
  ipcMain.on("sakura:open-settings", () => openSettings());
  ipcMain.on("sakura:quit", () => app.quit());

  ipcMain.handle("sakura:work-area", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    const b = win.getBounds();
    return { workArea: area, bounds: b };
  });

  ipcMain.handle("sakura:prepare-menu", (event, payload?: { width?: number; height?: number; prefer?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin || !runtime) return null;
    const menuW = Math.max(168, Math.round(payload?.width ?? 188));
    const menuH = Math.max(160, Math.round(payload?.height ?? 280));
    const gap = 6; // tight to figure, almost no overlap
    const size = petWindowSize(runtime.settings.window.scale);
    // Full chrome window (un-expanded)
    const winOrigin = menuChrome
      ? { x: menuChrome.x, y: menuChrome.y, width: size.width, height: size.height }
      : { x: win.getBounds().x, y: win.getBounds().y, width: size.width, height: size.height };

    // Figure/content box inside chrome — menu docks to THIS, not the wide margin edge
    const figure = {
      x: winOrigin.x + size.side,
      y: winOrigin.y + size.top,
      width: size.contentW,
      height: size.contentH,
    };

    // Prefer the display under the figure; fall back to matching window
    const area =
      rectAtPoint(workAreas(), figure.x + figure.width / 2, figure.y + figure.height / 2) ??
      screen.getDisplayMatching(win.getBounds()).workArea;

    // Restore to chrome box first for stable math
    win.setMinimumSize(40, 40);
    win.setBounds(winOrigin);

    const room = {
      right: area.x + area.width - (figure.x + figure.width),
      left: figure.x - area.x,
      bottom: area.y + area.height - (figure.y + figure.height),
      top: figure.y - area.y,
    };
    const needX = menuW + gap;
    const needY = menuH + gap;
    type Side = "left" | "right" | "top" | "bottom";
    // Prefer left/right beside the figure. Only use top/bottom when both sides lack room.
    const horiz: Side[] = room.right <= room.left ? ["left", "right"] : ["right", "left"];
    const vert: Side[] = room.bottom <= room.top ? ["top", "bottom"] : ["bottom", "top"];
    const pick = (sides: Side[], need: number): Side | null => {
      for (const side of sides) {
        if (room[side] >= need) return side;
      }
      return null;
    };
    const side =
      pick(horiz, needX) ??
      pick(vert, needY) ??
      (["left", "right", "top", "bottom"] as Side[])
        .map((s) => ({ s, space: room[s] }))
        .sort((a, b) => b.space - a.space)[0].s;

    // Expanded window must cover: chrome window ∪ menu (tight to figure)
    let bounds = { ...winOrigin };
    const pad = { left: 0, right: 0, top: 0, bottom: 0 };
    let menu = { x: 0, y: 0 };

    // Menu screen rect relative to figure, then convert to client coords after expand
    let menuScreen = { x: 0, y: 0 };

    if (side === "right") {
      menuScreen = {
        x: figure.x + figure.width + gap,
        y: figure.y + figure.height - menuH, // bottom-align to figure
      };
    } else if (side === "left") {
      menuScreen = {
        x: figure.x - menuW - gap,
        y: figure.y + figure.height - menuH,
      };
    } else if (side === "top") {
      menuScreen = {
        x: figure.x + Math.round((figure.width - menuW) / 2),
        y: figure.y - menuH - gap,
      };
    } else {
      menuScreen = {
        x: figure.x + Math.round((figure.width - menuW) / 2),
        y: figure.y + figure.height + gap,
      };
    }

    // Soft vertical nudge so menu stays within current work area when possible
    if (menuScreen.y < area.y + 4) menuScreen.y = area.y + 4;
    if (menuScreen.y + menuH > area.y + area.height - 4) {
      menuScreen.y = Math.max(area.y + 4, area.y + area.height - menuH - 4);
    }
    if (menuScreen.x < area.x + 4) menuScreen.x = area.x + 4;
    if (menuScreen.x + menuW > area.x + area.width - 4) {
      menuScreen.x = Math.max(area.x + 4, area.x + area.width - menuW - 4);
    }

    // Expand chrome window to include menuScreen (union)
    const unionL = Math.min(winOrigin.x, menuScreen.x - 4);
    const unionT = Math.min(winOrigin.y, menuScreen.y - 4);
    const unionR = Math.max(winOrigin.x + winOrigin.width, menuScreen.x + menuW + 4);
    const unionB = Math.max(winOrigin.y + winOrigin.height, menuScreen.y + menuH + 4);
    bounds = {
      x: unionL,
      y: unionT,
      width: unionR - unionL,
      height: unionB - unionT,
    };

    // Clamp expanded window into the display under the figure (allow slight overhang)
    if (bounds.x < area.x - 8) {
      const shift = area.x - 8 - bounds.x;
      bounds.x += shift;
      menuScreen.x += shift;
    }
    if (bounds.y < area.y - 8) {
      const shift = area.y - 8 - bounds.y;
      bounds.y += shift;
      menuScreen.y += shift;
    }
    if (bounds.x + bounds.width > area.x + area.width + 8) {
      const shift = bounds.x + bounds.width - (area.x + area.width + 8);
      bounds.x -= shift;
      menuScreen.x -= shift;
    }
    if (bounds.y + bounds.height > area.y + area.height + 8) {
      const shift = bounds.y + bounds.height - (area.y + area.height + 8);
      bounds.y -= shift;
      menuScreen.y -= shift;
    }

    const fitH = Math.min(menuH, Math.max(120, bounds.height - 8));
    const fitW = Math.min(menuW, Math.max(120, bounds.width - 8));
    menu = {
      x: Math.round(menuScreen.x - bounds.x),
      y: Math.round(menuScreen.y - bounds.y),
    };
    menu.x = Math.max(4, Math.min(menu.x, bounds.width - fitW - 4));
    menu.y = Math.max(4, Math.min(menu.y, bounds.height - fitH - 4));

    const contentX = winOrigin.x - bounds.x;
    const contentY = winOrigin.y - bounds.y;
    pad.left = Math.max(0, contentX);
    pad.top = Math.max(0, contentY);
    pad.right = Math.max(0, bounds.width - contentX - winOrigin.width);
    pad.bottom = Math.max(0, bounds.height - contentY - winOrigin.height);

    menuChrome = { x: winOrigin.x, y: winOrigin.y, width: size.width, height: size.height };
    win.setBounds(bounds);
    return {
      side,
      menu,
      pad: {
        left: pad.left,
        top: pad.top,
        right: pad.right,
        bottom: pad.bottom,
      },
      menuW: fitW,
      menuH: fitH,
      clampH: bounds.height - 8,
    };
  });

  ipcMain.handle("sakura:restore-menu", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin || !runtime) return false;
    if (!menuChrome) {
      applyChrome(false);
      return true;
    }
    const size = petWindowSize(runtime.settings.window.scale);
    win.setBounds({ x: menuChrome.x, y: menuChrome.y, width: size.width, height: size.height });
    win.setMinimumSize(petWindowSize(0.4).width, petWindowSize(0.4).height);
    menuChrome = null;
    return true;
  });

  ipcMain.on("sakura:set-mouse-ignore", (event, ignore: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin) return;
    win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });

  ipcMain.on("sakura:reveal", (_event, target: unknown) => {
    if (!runtime) return;
    const config = runtime.getConfig();
    const file = target === "pack" ? config.paths.packPath : config.paths.settingsPath;
    shell.showItemInFolder(file);
  });
}

function appRoot(): string {
  return process.env.SAKURA_PET_ROOT ? path.resolve(process.env.SAKURA_PET_ROOT) : path.resolve(__dirname, "..");
}

app.on("before-quit", () => {
  server?.close();
  runtime?.dispose();
});

app.on("window-all-closed", () => app.quit());
