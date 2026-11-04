/** DIP geometry for multi-monitor drag and the context menu.
 * Electron screen APIs and BrowserWindow bounds are DIP. DOM screenX/screenY are not. */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Side = "left" | "right" | "top" | "bottom";

const BASE_W = 360;
const BASE_H = 520;
const WINDOW_MARGIN_RATIO = 0.5;

export const MENU_GAP = 6;
export const MENU_EDGE = 4;
/** Side dock is kept whenever the gutter can hold a tappable menu. Below this, use top/bottom. */
export const SIDE_FLOOR = 72;

export function petWindowSize(scale: number): {
  width: number;
  height: number;
  contentW: number;
  contentH: number;
  side: number;
  top: number;
  bottom: number;
} {
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

export function pointInRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

export function distToRectSq(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.height));
  return dx * dx + dy * dy;
}

export function nearestRect(rects: Rect[], x: number, y: number): Rect | null {
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

export function rectAtPoint(rects: Rect[], x: number, y: number): Rect | null {
  for (const r of rects) if (pointInRect(r, x, y)) return r;
  return null;
}

export function displayUnderPoint(areas: Rect[], x: number, y: number): Rect | null {
  return rectAtPoint(areas, x, y) ?? nearestRect(areas, x, y);
}

/** Leave the point alone when it already lies on a display. Snap only in a real gap. */
export function clampPointToRects(x: number, y: number, rects: Rect[]): Point {
  if (rects.length === 0) return { x, y };
  if (rectAtPoint(rects, x, y)) return { x, y };
  const nearest = nearestRect(rects, x, y);
  if (!nearest) return { x, y };
  return {
    x: Math.min(Math.max(x, nearest.x), nearest.x + nearest.width - 1),
    y: Math.min(Math.max(y, nearest.y), nearest.y + nearest.height - 1),
  };
}

/** Snap a window only when its center is off every work area. Overhanging chrome stays. */
export function clampOriginKeepingCenter(origin: Rect, areas: Rect[]): Rect {
  const cx = origin.x + origin.width / 2;
  const cy = origin.y + origin.height / 2;
  const next = clampPointToRects(cx, cy, areas);
  if (next.x === cx && next.y === cy) return origin;
  return {
    x: Math.round(next.x - origin.width / 2),
    y: Math.round(next.y - origin.height / 2),
    width: origin.width,
    height: origin.height,
  };
}

/** Place the window so the grab point stays under the DIP cursor. No read-back, no clamp. */
export function cursorFollowOrigin(cursor: Point, offset: Point): Point {
  return {
    x: Math.round(cursor.x - offset.x),
    y: Math.round(cursor.y - offset.y),
  };
}

export type MenuLayoutInput = {
  winOrigin: Rect;
  figure: Rect;
  workArea: Rect;
  menuW: number;
  menuH: number;
  gap?: number;
};

export type MenuLayout = {
  side: Side;
  bounds: Rect;
  menu: { x: number; y: number };
  menuW: number;
  menuH: number;
  pad: { left: number; right: number; top: number; bottom: number };
  clampH: number;
};

function clampInt(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Dock the menu to the figure, inside the work area, without moving the pet. */
export function layoutContextMenu(input: MenuLayoutInput): MenuLayout {
  const gap = input.gap ?? MENU_GAP;
  const work = input.workArea;
  const figure = input.figure;
  const win = input.winOrigin;
  const preferredW = Math.max(1, Math.round(input.menuW));
  const preferredH = Math.max(1, Math.round(input.menuH));
  const room: Record<Side, number> = {
    right: work.x + work.width - (figure.x + figure.width),
    left: figure.x - work.x,
    bottom: work.y + work.height - (figure.y + figure.height),
    top: figure.y - work.y,
  };
  const maxW = Math.max(1, Math.floor(work.width - MENU_EDGE * 2));
  const maxH = Math.max(1, Math.floor(work.height - MENU_EDGE * 2));
  const horiz: Side[] = room.left >= room.right ? ["left", "right"] : ["right", "left"];
  const vert: Side[] = room.top >= room.bottom ? ["top", "bottom"] : ["bottom", "top"];
  const along = (side: Side) => Math.floor(room[side] - gap - MENU_EDGE);

  let side: Side;
  let menuW: number;
  let menuH: number;
  const horizFit = horiz.find((item) => along(item) >= SIDE_FLOOR);
  const vertFit = vert.find((item) => along(item) >= SIDE_FLOOR);
  if (horizFit) {
    side = horizFit;
    menuW = Math.min(preferredW, maxW, along(horizFit));
    menuH = Math.min(preferredH, maxH);
  } else if (vertFit) {
    side = vertFit;
    menuW = Math.min(preferredW, maxW);
    menuH = Math.min(preferredH, maxH, along(vertFit));
  } else {
    const all: Side[] = [...horiz, ...vert];
    side = all.reduce((best, item) => (room[item] > room[best] ? item : best), all[0]);
    if (side === "left" || side === "right") {
      menuW = Math.min(preferredW, maxW, Math.max(1, along(side)));
      menuH = Math.min(preferredH, maxH);
    } else {
      menuW = Math.min(preferredW, maxW);
      menuH = Math.min(preferredH, maxH, Math.max(1, along(side)));
    }
  }
  menuW = Math.max(1, Math.min(menuW, maxW));
  menuH = Math.max(1, Math.min(menuH, maxH));

  let x: number;
  let y: number;
  if (side === "right") x = figure.x + figure.width + gap;
  else if (side === "left") x = figure.x - gap - menuW;
  else x = figure.x + Math.round((figure.width - menuW) / 2);

  if (side === "top") y = figure.y - gap - menuH;
  else if (side === "bottom") y = figure.y + figure.height + gap;
  else y = figure.y + figure.height - menuH;

  const minX = Math.round(work.x + MENU_EDGE);
  const minY = Math.round(work.y + MENU_EDGE);
  x = clampInt(Math.round(x), minX, Math.round(work.x + work.width - MENU_EDGE - menuW));
  y = clampInt(Math.round(y), minY, Math.round(work.y + work.height - MENU_EDGE - menuH));

  // Union covers the pet and the menu. The pet's screen origin does not move.
  const halo = 6;
  const left = Math.min(win.x, x - halo);
  const top = Math.min(win.y, y - halo);
  const right = Math.max(win.x + win.width, x + menuW + halo);
  const bottom = Math.max(win.y + win.height, y + menuH + halo);
  const bounds: Rect = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
  const contentX = win.x - bounds.x;
  const contentY = win.y - bounds.y;
  return {
    side,
    bounds,
    menu: { x: x - bounds.x, y: y - bounds.y },
    menuW,
    menuH,
    pad: {
      left: contentX,
      top: contentY,
      right: bounds.width - contentX - win.width,
      bottom: bounds.height - contentY - win.height,
    },
    clampH: menuH,
  };
}
