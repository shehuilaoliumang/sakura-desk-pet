/**
 * Pure window geometry for the desktop pet.
 *
 * Coordinates are DIP (the same space as Electron `BrowserWindow.setPosition`
 * and `screen.getCursorScreenPoint`). Do not feed renderer `screenX`/`screenY`
 * into these helpers: on Windows those values are not stable across monitors
 * with different scale factors, and integrating them as deltas desynchronizes
 * the grab point.
 *
 * Work-area tests use the union of each display's rect. The bounding hull of
 * that union contains real gaps (a portrait panel beside a shorter primary
 * leaves a void under the primary) and must not be treated as reachable space.
 */

export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

export const PET_BASE_W = 360;
export const PET_BASE_H = 520;
/** Stage art height in the pet stylesheet (`calc(480px * scale)`). */
export const PET_STAGE_H = 480;
/**
 * `.pet-root` padding-bottom. The stage is a flex-end child, so the figure
 * sits this many DIP above the OS window's bottom edge.
 */
export const PET_BOTTOM_PAD = 10;
/** Movement below this (DIP) stays a click so the reaction still plays. */
export const DRAG_SLOP_PX = 4;

const WINDOW_MARGIN_RATIO = 0.5;

export type PetWindowSize = {
  width: number;
  height: number;
  contentW: number;
  contentH: number;
  side: number;
  top: number;
  bottom: number;
  stageH: number;
};

export function petWindowSize(scale: number): PetWindowSize {
  const contentW = Math.round(PET_BASE_W * scale);
  const contentH = Math.round(PET_BASE_H * scale);
  const side = Math.max(200, Math.round(contentW * WINDOW_MARGIN_RATIO));
  const top = Math.max(56, Math.round(side * 0.28));
  const bottom = Math.max(40, Math.round(side * 0.22));
  return {
    contentW,
    contentH,
    side,
    top,
    bottom,
    stageH: Math.round(PET_STAGE_H * scale),
    width: contentW + side * 2,
    height: contentH + top + bottom,
  };
}

export function pointInRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function rectAtPoint(rects: Rect[], x: number, y: number): Rect | null {
  for (const rect of rects) if (pointInRect(rect, x, y)) return rect;
  return null;
}

export function distToRectSq(rect: Rect, x: number, y: number): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height));
  return dx * dx + dy * dy;
}

export function nearestRect(rects: Rect[], x: number, y: number): Rect | null {
  let best: Rect | null = null;
  let bestD = Infinity;
  for (const rect of rects) {
    const d = distToRectSq(rect, x, y);
    if (d < bestD) {
      bestD = d;
      best = rect;
    }
  }
  return best;
}

/** Pull a point into the union of `rects`. Points already inside are unchanged. */
export function clampPointToRects(rects: Rect[], x: number, y: number): Point {
  if (rects.length === 0) return { x, y };
  if (rectAtPoint(rects, x, y)) return { x, y };
  const nearest = nearestRect(rects, x, y);
  if (!nearest) return { x, y };
  return {
    x: Math.min(Math.max(x, nearest.x), nearest.x + nearest.width - 1),
    y: Math.min(Math.max(y, nearest.y), nearest.y + nearest.height - 1),
  };
}

/**
 * Visible figure box. Horizontally centered in the OS window (side chrome is
 * symmetric). Vertically pinned to the bottom padding, matching flex-end.
 */
export function figureRect(origin: Rect, metrics: { contentW: number; stageH: number }): Rect {
  const width = Math.min(Math.max(origin.width, 0), metrics.contentW);
  return {
    x: origin.x + (origin.width - width) / 2,
    y: origin.y + origin.height - metrics.stageH - PET_BOTTOM_PAD,
    width,
    height: metrics.stageH,
  };
}

/**
 * On pointer-up, keep the window where the user dropped it when any of the
 * figure still intersects a work area. Only a figure that sits entirely in a
 * gap (or off every display) is shifted so its center lands on the nearest
 * work area. Never call this while the button is down.
 */
export function releaseOrigin(origin: Rect, figure: Rect, areas: Rect[]): Rect {
  if (areas.length === 0) return { ...origin };
  if (areas.some((area) => rectsIntersect(figure, area))) return { ...origin };
  const cx = figure.x + figure.width / 2;
  const cy = figure.y + figure.height / 2;
  const snapped = clampPointToRects(areas, cx, cy);
  const dx = Math.round(snapped.x - cx);
  const dy = Math.round(snapped.y - cy);
  if (dx === 0 && dy === 0) return { ...origin };
  return {
    x: origin.x + dx,
    y: origin.y + dy,
    width: origin.width,
    height: origin.height,
  };
}

/** Absolute cursor follow. `grab` and `cursor` must both be DIP screen points. */
export function positionForCursor(origin: Point, grab: Point, cursor: Point): Point {
  return {
    x: Math.round(origin.x + cursor.x - grab.x),
    y: Math.round(origin.y + cursor.y - grab.y),
  };
}

export function passedDragSlop(dx: number, dy: number): boolean {
  return dx * dx + dy * dy >= DRAG_SLOP_PX * DRAG_SLOP_PX;
}

export function shiftRect(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
}

/**
 * Snap the unexpanded content rect, then apply the same delta to the OS window
 * (which may be larger while the context menu is open).
 */
export function releaseWindow(
  windowRect: Rect,
  contentRect: Rect,
  figure: Rect,
  areas: Rect[],
): { window: Rect; content: Rect } {
  const content = releaseOrigin(contentRect, figure, areas);
  return {
    content,
    window: shiftRect(windowRect, content.x - contentRect.x, content.y - contentRect.y),
  };
}

/**
 * Delta drag that re-reads a stale window position each event. `SetWindowPos`
 * is async; if `getPosition` has not caught up, the next delta replaces the
 * pending move instead of stacking, so the window falls behind the cursor.
 * `applyEvery` is how many events land before the reported position updates.
 */
export function staleDeltaDrag(deltas: number[], applyEvery: number): number {
  let actual = 0;
  let reported = 0;
  let sinceApply = 0;
  for (const dx of deltas) {
    const target = reported + dx;
    sinceApply += 1;
    if (sinceApply >= applyEvery) {
      actual = target;
      reported = actual;
      sinceApply = 0;
    }
  }
  return actual;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * 太初's layout: primary 1600×1000 DIP (work height 952) with a 720×1280
 * portrait panel on the left at x=-720. The two bounds touch at x=0, but the
 * portrait panel extends below the primary, so the hull contains a void.
 */
export function selfCheckScreenGeometry(): void {
  const primary: Rect = { x: 0, y: 0, width: 1600, height: 952 };
  const portrait: Rect = { x: -720, y: 0, width: 720, height: 1280 };
  const areas = [primary, portrait];

  const hull: Rect = { x: -720, y: 0, width: 2320, height: 1280 };
  const voidPoint = { x: 180, y: 1200 };
  assert(pointInRect(hull, voidPoint.x, voidPoint.y), "fixture void sits inside the bounding hull");
  assert(!rectAtPoint(areas, voidPoint.x, voidPoint.y), "void under the primary is not on either work area");
  assert(rectAtPoint(areas, -100, 1100) === portrait, "below the primary and left of x=0 is the portrait panel");
  assert(rectAtPoint(areas, 40, 400) === primary, "shared edge x=0 belongs to the primary");

  const fitted = petWindowSize(0.65);
  assert(fitted.width === 634 && fitted.height === 438, `default chrome is 634×438, got ${fitted.width}×${fitted.height}`);
  assert(fitted.width < portrait.width, "default scale still fits the portrait panel");

  const wide = petWindowSize(1);
  assert(wide.width === 760 && wide.height === 620, `scale 1 chrome is 760×620, got ${wide.width}×${wide.height}`);
  assert(wide.width > portrait.width, "scale 1 OS window is wider than the portrait panel");
  assert(wide.contentW < portrait.width, "the figure itself still fits on the portrait panel");

  const walk = (size: PetWindowSize, fromX: number, toX: number, y: number) => {
    const start = originForFigureCenter(fromX, y, size);
    const grab = { x: fromX, y };
    let previous = start.x;
    const step = toX < fromX ? -20 : 20;
    for (let cursorX = fromX; step < 0 ? cursorX >= toX : cursorX <= toX; cursorX += step) {
      const next = positionForCursor(start, grab, { x: cursorX, y });
      const origin = { ...start, x: next.x, y: next.y };
      const figure = figureRect(origin, size);
      assert(Math.abs(next.x - previous) <= Math.abs(step) + 1, `drag step stuck or jumped at cursor x=${cursorX}`);
      assert(next.x !== previous || cursorX === fromX, "cursor follow did not move");
      const released = releaseOrigin(origin, figure, areas);
      assert(released.x === origin.x && released.y === origin.y, `mid-path release yanked the pet at cursor x=${cursorX}`);
      assert(areas.some((area) => rectsIntersect(figure, area)), `figure left every display at cursor x=${cursorX}`);
      previous = next.x;
    }
    const end = positionForCursor(start, grab, { x: toX, y });
    assert(end.x === Math.round(start.x + toX - fromX), "cursor follow matches the pointer, not a clamped display");
  };

  walk(fitted, 480, -360, 600);
  walk(wide, 480, -360, 600);

  const parked = originForFigureCenter(-400, 1100, wide);
  const parkedFigure = figureRect(parked, wide);
  assert(rectsIntersect(parkedFigure, portrait), "a wide window can still park the figure on the portrait panel");
  assert(parked.x < portrait.x || parked.x + parked.width > portrait.x + portrait.width, "wide window overhangs the portrait panel");
  const parkedRelease = releaseOrigin(parked, parkedFigure, areas);
  assert(parkedRelease.x === parked.x && parkedRelease.y === parked.y, "overhanging chrome must not snap when the figure is on a display");

  const dropped = originForFigureCenter(voidPoint.x, voidPoint.y, fitted);
  const droppedFigure = figureRect(dropped, fitted);
  assert(!areas.some((area) => rectsIntersect(droppedFigure, area)), "fixture drop is fully inside the multi-monitor gap");
  const rescued = releaseOrigin(dropped, droppedFigure, areas);
  const rescuedFigure = figureRect(rescued, fitted);
  assert(areas.some((area) => rectsIntersect(rescuedFigure, area)), "gap release moves the figure onto a work area");
  assert(rescued.x !== dropped.x || rescued.y !== dropped.y, "gap release changes position");

  const sliver = originForFigureCenter(200, 952, fitted);
  const sliverFigure = figureRect(sliver, fitted);
  assert(rectsIntersect(sliverFigure, primary), "a figure that still touches the work area is reachable");
  const sliverRelease = releaseOrigin(sliver, sliverFigure, areas);
  assert(sliverRelease.x === sliver.x && sliverRelease.y === sliver.y, "do not yank a pet that is still touching a display");

  const deltas = Array.from({ length: 30 }, () => 10);
  const traveled = deltas.reduce((sum, dx) => sum + dx, 0);
  assert(staleDeltaDrag(deltas, 1) === traveled, "fresh positions integrate every delta");
  const lagged = staleDeltaDrag(deltas, 3);
  assert(lagged < traveled / 2, `stale getPosition drops most of the drag (${lagged} of ${traveled})`);

  const origin = { x: 100, y: 200 };
  const grab = { x: 500, y: 640 };
  const crossed = positionForCursor(origin, grab, { x: -80, y: 700 });
  assert(crossed.x === 100 + (-80 - 500) && crossed.y === 200 + (700 - 640), "crossing to negative DIP does not clamp");

  let poisoned = origin.x;
  let lastScreenX = 500;
  const screenXSamples = [500, 460, 420, 610, 300, 40];
  for (let i = 1; i < screenXSamples.length; i++) {
    poisoned += screenXSamples[i] - lastScreenX;
    lastScreenX = screenXSamples[i];
  }
  const dipCursor = { x: -40, y: 640 };
  const followed = positionForCursor(origin, grab, dipCursor);
  assert(poisoned !== followed.x, "a scale-factor spike in screenX must not be what we integrate");
  assert(followed.x === origin.x + (dipCursor.x - grab.x), "follow the DIP cursor even if screenX spiked");

  assert(passedDragSlop(3, 0) === false, "3px is still a click");
  assert(passedDragSlop(4, 0) === true, "4px starts a drag");
  assert(passedDragSlop(0, -5) === true, "vertical slop counts");
}

function originForFigureCenter(cx: number, cy: number, size: PetWindowSize): Rect {
  return {
    x: cx - size.width / 2,
    y: cy - (size.height - PET_BOTTOM_PAD - size.stageH / 2),
    width: size.width,
    height: size.height,
  };
}
