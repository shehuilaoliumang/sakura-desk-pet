import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import { dataDir } from "../src/main/paths";
import { PetRuntime, type ChangeReason } from "../src/main/runtime";
import { startServer } from "../src/main/server";
import {
  clampOriginKeepingCenter,
  cursorFollowOrigin,
  displayUnderPoint,
  layoutContextMenu,
  petWindowSize,
  type Rect,
} from "../src/shared/screenLayout";
import type http from "node:http";

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

  logDisplays();
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
    clearDrag();
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

function workAreas(): Rect[] {
  return screen.getAllDisplays().map((d) => ({ ...d.workArea }));
}

function logDisplays(): void {
  for (const display of screen.getAllDisplays()) {
    const b = display.bounds;
    const w = display.workArea;
    console.log(
      `[sakura-pet] display id=${display.id} scaleFactor=${display.scaleFactor} bounds=${b.x},${b.y} ${b.width}x${b.height} work=${w.x},${w.y} ${w.width}x${w.height}`,
    );
  }
}

function applyMinSize(win: BrowserWindow): void {
  const min = petWindowSize(0.4);
  win.setMinimumSize(min.width, min.height);
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
  if (!runtime || !petWin || dragSession) return;
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
    if (menuChrome || dragSession) return;
    const b = petWin.getBounds();
    const clamped = clampOriginKeepingCenter(b, workAreas());
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

type DragSession = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  timer: ReturnType<typeof setInterval>;
};

/** Active only between drag-start and drag-end. Position is never read back mid-drag. */
let dragSession: DragSession | null = null;

function clearDrag(): void {
  if (!dragSession) return;
  clearInterval(dragSession.timer);
  dragSession = null;
}

function applyDragPosition(): void {
  const session = dragSession;
  const win = petWin;
  if (!session || !win || win.isDestroyed()) {
    clearDrag();
    return;
  }
  try {
    const cursor = screen.getCursorScreenPoint();
    const next = cursorFollowOrigin(cursor, { x: session.offsetX, y: session.offsetY });
    if (next.x === session.lastX && next.y === session.lastY) return;
    session.lastX = next.x;
    session.lastY = next.y;
    // Frozen DIP size: a scaleFactor change must not resize the pet while it crosses.
    win.setBounds({ x: next.x, y: next.y, width: session.width, height: session.height });
  } catch {
    finishDrag();
  }
}

function finishDrag(): void {
  const session = dragSession;
  const win = petWin;
  if (!session) return;
  clearDrag();
  if (!win || win.isDestroyed()) return;
  const origin = { x: session.lastX, y: session.lastY, width: session.width, height: session.height };
  const clamped = clampOriginKeepingCenter(origin, workAreas());
  try {
    if (clamped.x !== origin.x || clamped.y !== origin.y) {
      win.setBounds({ x: clamped.x, y: clamped.y, width: session.width, height: session.height });
    }
    win.setResizable(false);
    applyMinSize(win);
  } catch {
    /* window is closing */
  }
  if (runtime && (clamped.x !== session.startX || clamped.y !== session.startY)) {
    runtime.setWindowPosition(clamped.x, clamped.y);
  }
}

function wireIpc(): void {
  // DOM screenX is not DIP on mixed-DPI Windows. Follow screen.getCursorScreenPoint
  // (DIP, same space as setBounds) and do not clamp to one display until release.
  ipcMain.on("sakura:drag-start", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin || !runtime) return;
    if (dragSession) {
      const prev = dragSession;
      clearDrag();
      applyMinSize(win);
      runtime.setWindowPosition(prev.lastX, prev.lastY);
    }
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const size = petWindowSize(runtime.settings.window.scale);
    win.setIgnoreMouseEvents(false);
    // resizable:false windows on Windows can ignore setBounds onto a monitor in
    // negative coordinates. A min size wider than the destination panel can too.
    win.setResizable(true);
    win.setMinimumSize(1, 1);
    const session: DragSession = {
      offsetX: cursor.x - bounds.x,
      offsetY: cursor.y - bounds.y,
      width: size.width,
      height: size.height,
      startX: bounds.x,
      startY: bounds.y,
      lastX: bounds.x,
      lastY: bounds.y,
      timer: setInterval(applyDragPosition, 16),
    };
    dragSession = session;
    applyDragPosition();
  });
  ipcMain.on("sakura:drag-end", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin) return;
    finishDrag();
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
    if (!win || win !== petWin || !runtime || dragSession) return null;
    const size = petWindowSize(runtime.settings.window.scale);
    const winOrigin = menuChrome
      ? { x: menuChrome.x, y: menuChrome.y, width: size.width, height: size.height }
      : { x: win.getBounds().x, y: win.getBounds().y, width: size.width, height: size.height };
    const figure = {
      x: winOrigin.x + size.side,
      y: winOrigin.y + size.top,
      width: size.contentW,
      height: size.contentH,
    };
    const cx = figure.x + figure.width / 2;
    const cy = figure.y + figure.height / 2;
    const area = displayUnderPoint(workAreas(), cx, cy) ?? screen.getPrimaryDisplay().workArea;
    // Shrink onto the work area. Do not slide the pet to make a wide menu fit.
    const layout = layoutContextMenu({
      winOrigin,
      figure,
      workArea: area,
      menuW: Math.round(payload?.width ?? 188),
      menuH: Math.round(payload?.height ?? 300),
    });
    menuChrome = { x: winOrigin.x, y: winOrigin.y, width: size.width, height: size.height };
    win.setMinimumSize(1, 1);
    win.setBounds(layout.bounds);
    return {
      side: layout.side,
      menu: layout.menu,
      pad: layout.pad,
      menuW: layout.menuW,
      menuH: layout.menuH,
      clampH: layout.clampH,
    };
  });

  ipcMain.handle("sakura:restore-menu", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin || !runtime) return false;
    if (dragSession) {
      menuChrome = null;
      return true;
    }
    if (!menuChrome) {
      applyChrome(false);
      return true;
    }
    const size = petWindowSize(runtime.settings.window.scale);
    win.setBounds({ x: menuChrome.x, y: menuChrome.y, width: size.width, height: size.height });
    applyMinSize(win);
    menuChrome = null;
    return true;
  });

  ipcMain.on("sakura:set-mouse-ignore", (event, ignore: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin || dragSession) return;
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
  clearDrag();
  server?.close();
  runtime?.dispose();
});

app.on("window-all-closed", () => app.quit());
