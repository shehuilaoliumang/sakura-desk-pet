import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import { dataDir } from "../src/main/paths";
import { PetRuntime, type ChangeReason } from "../src/main/runtime";
import { startServer } from "../src/main/server";
import {
  figureRect,
  passedDragSlop,
  petWindowSize,
  positionForCursor,
  rectAtPoint,
  releaseWindow,
  type Rect,
} from "../src/shared/screenGeometry";
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
/**
 * Absolute cursor-follow drag. Offset is captured once, in DIP, from
 * `getCursorScreenPoint` and `getPosition` together — never from renderer
 * `screenX` deltas, which jump when the window and the cursor disagree about
 * scale factor at a monitor edge.
 */
type DragSession = {
  originX: number;
  originY: number;
  grabX: number;
  grabY: number;
  width: number;
  height: number;
  moved: boolean;
  timer: NodeJS.Timeout;
};
let dragSession: DragSession | null = null;
let dragCompletion: { moved: boolean } | null = null;

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
    // Default WS_THICKFRAME gives a frameless window an invisible resize border.
    // On Windows that border snaps and resists at work-area edges and bezels,
    // which reads as the pet hitting a wall before the art does.
    thickFrame: false,
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
  // The window is not user-resizable. A large minimum tracking size makes
  // Windows refuse SetWindowPos onto a narrower / negative-X monitor.
  petWin.setMinimumSize(1, 1);
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
  petWin.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  installDragEndHook(petWin);
  petWin.once("ready-to-show", () => petWin?.show());
  petWin.on("closed", () => {
    if (dragSession) {
      clearInterval(dragSession.timer);
      dragSession = null;
    }
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
  return screen.getAllDisplays().map((display) => ({ ...display.workArea }));
}

function placeAt(win: BrowserWindow, x: number, y: number, width: number, height: number): void {
  const bounds = win.getBounds();
  if (bounds.width !== width || bounds.height !== height) {
    win.setBounds({ x, y, width, height });
  } else if (bounds.x !== x || bounds.y !== y) {
    win.setPosition(x, y);
  }
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
  petWin.setAlwaysOnTop(settingsWin?.isFocused() ? false : runtime.settings.window.alwaysOnTop, "screen-saver");
  if (dragSession) return;
  if (menuChrome) {
    // keep expanded shell; refresh content origin size bookkeeping
    menuChrome = { x: menuChrome.x, y: menuChrome.y, width: size.width, height: size.height };
    return;
  }
  const [x, y] = petWin.getPosition();
  petWin.setBounds({ x, y, width: size.width, height: size.height });
  petWin.setMinimumSize(1, 1);
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

function contentRectFor(bounds: Rect, windowOriginAtDragStart?: { x: number; y: number }): Rect {
  if (!runtime) return bounds;
  const size = petWindowSize(runtime.settings.window.scale);
  if (!menuChrome || !windowOriginAtDragStart) {
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }
  return {
    x: menuChrome.x + (bounds.x - windowOriginAtDragStart.x),
    y: menuChrome.y + (bounds.y - windowOriginAtDragStart.y),
    width: size.width,
    height: size.height,
  };
}

function snapReleasedWindow(
  win: BrowserWindow,
  windowOriginAtDragStart: { x: number; y: number } | undefined,
  forcePersist: boolean,
): void {
  if (!runtime) return;
  const bounds = win.getBounds();
  const size = petWindowSize(runtime.settings.window.scale);
  const content = contentRectFor(bounds, windowOriginAtDragStart);
  const figure = figureRect(content, size);
  const released = releaseWindow(bounds, content, figure, workAreas());
  const moved = released.window.x !== bounds.x || released.window.y !== bounds.y;
  if (moved) placeAt(win, released.window.x, released.window.y, bounds.width, bounds.height);
  if (menuChrome) {
    menuChrome = {
      x: released.content.x,
      y: released.content.y,
      width: size.width,
      height: size.height,
    };
  }
  if (!forcePersist && !moved) return;
  if (menuChrome) runtime.setWindowPosition(menuChrome.x, menuChrome.y);
  else {
    const [x, y] = win.getPosition();
    runtime.setWindowPosition(x, y);
  }
}

function applyDragFrame(): void {
  const session = dragSession;
  const win = petWin;
  if (!session || !win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const next = positionForCursor(
    { x: session.originX, y: session.originY },
    { x: session.grabX, y: session.grabY },
    cursor,
  );
  if (!session.moved) {
    if (!passedDragSlop(next.x - session.originX, next.y - session.originY)) return;
    session.moved = true;
  }
  // Re-assert the grabbed DIP size. A per-monitor DPI change sends a suggested
  // rect that would otherwise resize the window as it crosses the bezel.
  placeAt(win, next.x, next.y, session.width, session.height);
}

function finishDrag(notify = true): { moved: boolean } {
  const session = dragSession;
  if (!session) return dragCompletion ?? { moved: false };
  clearInterval(session.timer);
  dragSession = null;
  const win = petWin;
  if (!win || win.isDestroyed() || !runtime) {
    dragCompletion = { moved: session.moved };
    return dragCompletion;
  }
  const cursor = screen.getCursorScreenPoint();
  const next = positionForCursor(
    { x: session.originX, y: session.originY },
    { x: session.grabX, y: session.grabY },
    cursor,
  );
  // The button can come up before the next poll. Judge the gesture from the
  // cursor, not from whether a tick has landed yet.
  if (!session.moved && passedDragSlop(next.x - session.originX, next.y - session.originY)) {
    session.moved = true;
  }
  if (session.moved) {
    const size = petWindowSize(runtime.settings.window.scale);
    // Keep the menu's expanded shell. Otherwise adopt the current scale so a
    // Ctrl+wheel during the gesture is not lost, then snap once.
    const width = menuChrome ? session.width : size.width;
    const height = menuChrome ? session.height : size.height;
    placeAt(win, next.x, next.y, width, height);
    snapReleasedWindow(win, { x: session.originX, y: session.originY }, true);
  }
  dragCompletion = { moved: session.moved };
  if (notify && !win.isDestroyed()) win.webContents.send("sakura:drag-finished", dragCompletion);
  return dragCompletion;
}

function beginDrag(win: BrowserWindow): boolean {
  if (win !== petWin || win.isDestroyed()) return false;
  if (dragSession) finishDrag(false);
  const cursor = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  // Own the pointer for the whole gesture. Hit-testing must not flip
  // WS_EX_TRANSPARENT while the button is down — that drops capture exactly
  // when the cursor reaches transparent chrome or a display edge.
  win.setIgnoreMouseEvents(false);
  const timer = setInterval(() => applyDragFrame(), 8);
  dragSession = {
    originX: bounds.x,
    originY: bounds.y,
    grabX: cursor.x,
    grabY: cursor.y,
    width: bounds.width,
    height: bounds.height,
    moved: false,
    timer,
  };
  dragCompletion = null;
  return true;
}

function wireDisplaySync(): void {
  const resync = () => {
    if (!petWin || petWin.isDestroyed() || !runtime) return;
    if (dragSession) {
      applyDragFrame();
      return;
    }
    if (menuChrome) return;
    const size = petWindowSize(runtime.settings.window.scale);
    const bounds = petWin.getBounds();
    if (bounds.width !== size.width || bounds.height !== size.height) {
      petWin.setBounds({ x: bounds.x, y: bounds.y, width: size.width, height: size.height });
    }
    snapReleasedWindow(petWin, undefined, false);
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

function installDragEndHook(win: BrowserWindow): void {
  if (process.platform !== "win32") return;
  // WM_LBUTTONUP. Backup for when the renderer loses pointerup at a monitor
  // boundary. Do not call into Electron from the hook itself (it re-enters).
  win.hookWindowMessage(0x0202, () => {
    if (!dragSession) return;
    setImmediate(() => {
      if (dragSession) finishDrag();
    });
  });
}

function wireIpc(): void {
  ipcMain.handle("sakura:drag-start", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    return beginDrag(win);
  });
  ipcMain.handle("sakura:drag-end", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin) return { moved: false };
    return finishDrag();
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
    win.setMinimumSize(1, 1);
    menuChrome = null;
    return true;
  });

  ipcMain.on("sakura:set-mouse-ignore", (event, ignore: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== petWin) return;
    // Click-through uses WS_EX_TRANSPARENT, which drops pointer capture.
    // Never turn it on while a drag is in progress.
    if (dragSession && ignore) return;
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
  if (dragSession) {
    clearInterval(dragSession.timer);
    dragSession = null;
  }
  server?.close();
  runtime?.dispose();
});

app.on("window-all-closed", () => app.quit());
