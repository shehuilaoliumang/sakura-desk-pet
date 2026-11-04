import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import { dataDir } from "../src/main/paths";
import { PetRuntime, type ChangeReason } from "../src/main/runtime";
import { startServer } from "../src/main/server";
import type http from "node:http";

const BASE_W = 360;
const BASE_H = 520;

app.setName("sakura-pet");
app.setPath("userData", dataDir());
app.commandLine.appendSwitch("enable-transparent-visuals");

let runtime: PetRuntime | null = null;
let server: http.Server | null = null;
let petWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;

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
  const icon = path.join(appRoot(), "assets", "icon.png");
  petWin = new BrowserWindow({
    ...(fs.existsSync(icon) ? { icon } : {}),
    width: Math.round(BASE_W * scale),
    height: Math.round(BASE_H * scale),
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
  petWin.setMinimumSize(Math.round(BASE_W * 0.4), Math.round(BASE_H * 0.4));
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
  const [w, h] = [Math.round(BASE_W * runtime.settings.window.scale), Math.round(BASE_H * runtime.settings.window.scale)];
  const [x, y] = petWin.getPosition();
  petWin.setBounds({ x, y, width: w, height: h });
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
