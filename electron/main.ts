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

function wireIpc(): void {
  ipcMain.on("sakura:move-by", (event, payload: { dx?: number; dy?: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin) return;
    if (typeof payload?.dx !== "number" || typeof payload?.dy !== "number") return;
    if (!Number.isFinite(payload.dx) || !Number.isFinite(payload.dy)) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + payload.dx), Math.round(y + payload.dy));
  });
  ipcMain.on("sakura:move-end", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin || !runtime) return;
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
    const gap = 8;
    const size = petWindowSize(runtime.settings.window.scale);
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    // Content origin: where the un-expanded pet window sits
    const origin = menuChrome
      ? { x: menuChrome.x, y: menuChrome.y, width: size.width, height: size.height }
      : { x: win.getBounds().x, y: win.getBounds().y, width: size.width, height: size.height };

    // Restore to content box first for stable math
    win.setMinimumSize(40, 40);
    win.setBounds(origin);

    const room = {
      right: area.x + area.width - (origin.x + origin.width),
      left: origin.x - area.x,
      bottom: area.y + area.height - (origin.y + origin.height),
      top: origin.y - area.y,
    };
    const needX = menuW + gap;
    const needY = menuH + gap;
    type Side = "left" | "right" | "top" | "bottom";
    // Prefer left/right (beside the figure). Only use top/bottom when both sides lack room.
    // When hugging an edge, bias to the opposite side (贴右 → 往左弹).
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
      // nowhere fits: pick the roomiest side overall
      (["left", "right", "top", "bottom"] as Side[])
        .map((s) => ({ s, space: room[s] }))
        .sort((a, b) => b.space - a.space)[0].s;

    const pad = { left: 0, right: 0, top: 0, bottom: 0 };
    let bounds = { ...origin };
    let menu = { x: 0, y: 0 };

    if (side === "right") {
      pad.right = needX;
      bounds.width = origin.width + needX;
      menu = { x: origin.width + gap, y: Math.max(8, origin.height - menuH - 8) };
    } else if (side === "left") {
      pad.left = needX;
      bounds.x = origin.x - needX;
      bounds.width = origin.width + needX;
      menu = { x: gap, y: Math.max(8, origin.height - menuH - 8) };
    } else if (side === "top") {
      pad.top = needY;
      bounds.y = origin.y - needY;
      bounds.height = origin.height + needY;
      menu = { x: Math.max(8, (origin.width - menuW) / 2 + pad.left), y: gap };
    } else {
      pad.bottom = needY;
      bounds.height = origin.height + needY;
      menu = { x: Math.max(8, (origin.width - menuW) / 2), y: origin.height + gap };
    }

    // Ensure vertical room for side-docked menus (otherwise bottom items clip)
    if ((side === "left" || side === "right") && bounds.height < menuH + gap * 2) {
      const extra = menuH + gap * 2 - bounds.height;
      const up = Math.min(extra, Math.max(0, origin.y - area.y));
      const down = extra - up;
      bounds.y = origin.y - up;
      bounds.height = origin.height + up + down;
      pad.top += up;
      pad.bottom += down;
      menu.y = up + Math.max(gap, origin.height + up - menuH - gap);
    }

    // Clamp expanded window into work area (shift as a whole if needed)
    if (bounds.x < area.x) bounds.x = area.x;
    if (bounds.y < area.y) bounds.y = area.y;
    if (bounds.x + bounds.width > area.x + area.width) bounds.x = Math.max(area.x, area.x + area.width - bounds.width);
    if (bounds.y + bounds.height > area.y + area.height) bounds.y = Math.max(area.y, area.y + area.height - bounds.height);

    // Content rectangle inside expanded window (after work-area clamp)
    const contentX = Math.max(0, origin.x - bounds.x);
    const contentY = Math.max(0, origin.y - bounds.y);
    const fitH = Math.min(menuH, Math.max(120, bounds.height - 8));
    const fitW = Math.min(menuW, Math.max(120, bounds.width - 8));

    if (side === "right") {
      menu = {
        x: contentX + origin.width + gap,
        y: Math.max(4, contentY + origin.height - fitH - gap),
      };
    } else if (side === "left") {
      menu = {
        x: gap,
        y: Math.max(4, contentY + origin.height - fitH - gap),
      };
    } else if (side === "top") {
      menu = {
        x: contentX + Math.max(8, (origin.width - fitW) / 2),
        y: gap,
      };
    } else {
      menu = {
        x: contentX + Math.max(8, (origin.width - fitW) / 2),
        y: contentY + origin.height + gap,
      };
    }

    menu.x = Math.max(4, Math.min(menu.x, bounds.width - fitW - 4));
    menu.y = Math.max(4, Math.min(menu.y, bounds.height - fitH - 4));

    menuChrome = { x: origin.x, y: origin.y, width: size.width, height: size.height };
    win.setBounds(bounds);
    return {
      side,
      menu,
      pad: {
        left: contentX,
        top: contentY,
        right: Math.max(0, bounds.width - contentX - origin.width),
        bottom: Math.max(0, bounds.height - contentY - origin.height),
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
