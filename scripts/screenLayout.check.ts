import assert from "node:assert/strict";
import {
  BUBBLE_HEADROOM,
  BUBBLE_ROW_H,
  FIT_PAD_BOTTOM,
  FIT_PAD_TOP,
  MENU_EDGE,
  MENU_GAP,
  SIDE_FLOOR,
  STACK_GAP,
  anchorPetBottomCenter,
  bubbleStackReserve,
  clampOriginKeepingCenter,
  cursorFollowOrigin,
  fitPetChrome,
  layoutContextMenu,
  petWindowSize,
  type Rect,
} from "../src/shared/screenLayout";

/** DIP view of the reported machine: 3200×2000 primary at 200%, portrait secondary touching its left edge. */
const primary: Rect = { x: 0, y: 0, width: 1600, height: 1000 };
const portrait: Rect = { x: -720, y: 0, width: 720, height: 1280 };
const areas = [primary, portrait];

function placed(scale: number, x: number, y: number): { win: Rect; figure: Rect } {
  const size = petWindowSize(scale);
  return {
    win: { x, y, width: size.width, height: size.height },
    figure: {
      x: x + size.side,
      y: y + size.top,
      width: size.contentW,
      height: size.contentH,
    },
  };
}

function menuScreen(layout: ReturnType<typeof layoutContextMenu>): Rect {
  return {
    x: layout.bounds.x + layout.menu.x,
    y: layout.bounds.y + layout.menu.y,
    width: layout.menuW,
    height: layout.menuH,
  };
}

function assertOriginStable(layout: ReturnType<typeof layoutContextMenu>, win: Rect): void {
  assert.equal(layout.bounds.x + layout.pad.left, win.x);
  assert.equal(layout.bounds.y + layout.pad.top, win.y);
  assert.equal(layout.bounds.width - layout.pad.left - layout.pad.right, win.width);
  assert.equal(layout.bounds.height - layout.pad.top - layout.pad.bottom, win.height);
  for (const value of Object.values(layout.pad)) assert.ok(value >= 0);
}

function assertInside(work: Rect, rect: Rect, label: string): void {
  assert.ok(rect.x >= work.x + MENU_EDGE - 0.01, `${label} left`);
  assert.ok(rect.y >= work.y + MENU_EDGE - 0.01, `${label} top`);
  assert.ok(rect.x + rect.width <= work.x + work.width - MENU_EDGE + 0.01, `${label} right`);
  assert.ok(rect.y + rect.height <= work.y + work.height - MENU_EDGE + 0.01, `${label} bottom`);
}

function gapToFigure(side: string, figure: Rect, menu: Rect): number {
  if (side === "right") return menu.x - (figure.x + figure.width);
  if (side === "left") return figure.x - (menu.x + menu.width);
  if (side === "bottom") return menu.y - (figure.y + figure.height);
  return figure.y - (menu.y + menu.height);
}

const size = petWindowSize(1);
assert.equal(size.width, 760);
assert.equal(size.height, 620);
assert.ok(size.width > portrait.width, "scale-1 chrome is wider than the 720 DIP portrait");

// --- cursor follow vs the old physical-pixel delta path ---

/** Physical X when DIP rects touch at x=0 but scaleFactors differ. */
function physicalX(dipX: number, primaryScale: number, secondaryScale: number, secondaryDipWidth: number): number {
  if (dipX >= 0) return dipX * primaryScale;
  return -secondaryDipWidth * secondaryScale + (dipX + secondaryDipWidth) * secondaryScale;
}

function legacyError(primaryScale: number, secondaryScale: number): number {
  const offset = 180;
  let cursor = -40;
  let legacy = cursor - offset;
  let worst = 0;
  for (let step = 0; step < 30; step++) {
    const prev = cursor;
    cursor += 8;
    const screenDx = physicalX(cursor, primaryScale, secondaryScale, 720) - physicalX(prev, primaryScale, secondaryScale, 720);
    legacy += screenDx;
    worst = Math.max(worst, Math.abs(legacy - (cursor - offset)));
    const follow = cursorFollowOrigin({ x: cursor, y: 240 }, { x: offset, y: 90 });
    assert.equal(follow.x, cursor - offset);
    assert.equal(follow.y, 240 - 90);
  }
  return worst;
}

const mixed = legacyError(2, 1.5);
assert.ok(mixed > 40, `mixed DPI screenX deltas diverge (${mixed})`);
const uniform = legacyError(2, 2);
assert.ok(uniform > 40, `uniform 200% screenX deltas run hot (${uniform})`);

// Crossing primary → portrait and back is absolute. Nothing clamps the samples.
const offset = { x: 200, y: 80 };
let cursorX = 240;
for (const y of [200, 1100]) {
  for (let i = 0; i < 80; i++) {
    cursorX -= 12;
    const followed = cursorFollowOrigin({ x: cursorX, y }, offset);
    assert.deepEqual(followed, { x: cursorX - offset.x, y: y - offset.y });
  }
  cursorX = -400;
  for (let i = 0; i < 80; i++) {
    cursorX += 12;
    const followed = cursorFollowOrigin({ x: cursorX, y }, offset);
    assert.deepEqual(followed, { x: cursorX - offset.x, y: y - offset.y });
  }
}

// Release on the portrait, with chrome overhanging onto the primary, does not jump.
const onPortrait = { x: -740, y: 90, width: 760, height: 620 };
assert.equal(onPortrait.x + onPortrait.width / 2, -360);
assert.deepEqual(clampOriginKeepingCenter(onPortrait, areas), onPortrait);

// Release in the empty region under the primary (portrait does not extend this far right) snaps.
const inGap = { x: 20, y: 1090, width: 760, height: 620 };
const snapped = clampOriginKeepingCenter(inGap, areas);
assert.ok(snapped.y < inGap.y);
assert.ok(snapped.x + snapped.width / 2 >= primary.x);
assert.ok(snapped.x + snapped.width / 2 < primary.x + primary.width);
assert.ok(snapped.y + snapped.height / 2 < primary.y + primary.height);

// Follow itself does not perform that snap.
const followedGap = cursorFollowOrigin({ x: 400, y: 1400 }, { x: 380, y: 310 });
assert.deepEqual(followedGap, { x: 20, y: 1090 });

// --- menu on the narrow portrait and on the wide primary ---

{
  const { win, figure } = placed(1, -740, 80);
  const layout = layoutContextMenu({ winOrigin: win, figure, workArea: portrait, menuW: 188, menuH: 300 });
  assert.ok(layout.side === "left" || layout.side === "right");
  assert.ok(layout.menuW < 188, "portrait gutter shrinks the menu");
  assert.ok(layout.menuW >= SIDE_FLOOR);
  assertOriginStable(layout, win);
  assertInside(portrait, menuScreen(layout), "portrait menu");
  assert.equal(gapToFigure(layout.side, figure, menuScreen(layout)), MENU_GAP);
}

{
  // Figure flush to the portrait's right edge: dock to the open side, still left/right.
  const { win, figure } = placed(1, -360 - size.side, 40);
  assert.equal(figure.x + figure.width, 0);
  const layout = layoutContextMenu({ winOrigin: win, figure, workArea: portrait, menuW: 188, menuH: 300 });
  assert.equal(layout.side, "left");
  assert.equal(layout.menuW, 188);
  assert.equal(gapToFigure(layout.side, figure, menuScreen(layout)), MENU_GAP);
  assertOriginStable(layout, win);
  assertInside(portrait, menuScreen(layout), "flush-right menu");
}

{
  const figure = { x: -716, y: 200, width: 360, height: 400 };
  const win = { x: figure.x - 200, y: 140, width: 760, height: 620 };
  const layout = layoutContextMenu({ winOrigin: win, figure, workArea: portrait, menuW: 188, menuH: 300 });
  assert.equal(layout.side, "right");
  assert.equal(gapToFigure(layout.side, figure, menuScreen(layout)), MENU_GAP);
  assertInside(portrait, menuScreen(layout), "flush-left menu");
  assertOriginStable(layout, win);
}

{
  // Both gutters are below SIDE_FLOOR; a tall portrait still has a vertical dock.
  const figure = { x: -420, y: 200, width: 360, height: 520 };
  const win = { x: -480, y: 80, width: 760, height: 700 };
  const work = { x: -480, y: 0, width: 480, height: 1280 };
  const layout = layoutContextMenu({ winOrigin: win, figure, workArea: work, menuW: 188, menuH: 300 });
  assert.ok(layout.side === "top" || layout.side === "bottom");
  assertOriginStable(layout, win);
  assertInside(work, menuScreen(layout), "vertical fallback");
}

{
  // The open gutter is only 110px, the other side is tighter, and below the figure is huge.
  // Still dock left/right and shrink, instead of flipping to top/bottom or leaving the work area.
  const work = { x: -510, y: 0, width: 510, height: 1280 };
  const figure = { x: -470, y: 80, width: 360, height: 400 };
  const win = { x: -670, y: 20, width: 760, height: 620 };
  const layout = layoutContextMenu({ winOrigin: win, figure, workArea: work, menuW: 188, menuH: 300 });
  assert.equal(figure.x - work.x, 40);
  assert.equal(work.x + work.width - (figure.x + figure.width), 110);
  assert.equal(layout.side, "right");
  assert.ok(layout.menuW < 188);
  assert.ok(layout.menuW >= SIDE_FLOOR);
  assertInside(work, menuScreen(layout), "shrunk side menu");
  assertOriginStable(layout, win);
}

{
  const wide: Rect = { x: 0, y: 0, width: 3200, height: 2000 };
  const { win, figure } = placed(1, 3200 - 760 - 48, 2000 - 620 - 64);
  const layout = layoutContextMenu({ winOrigin: win, figure, workArea: wide, menuW: 188, menuH: 300 });
  assert.ok(layout.side === "left" || layout.side === "right");
  assert.equal(layout.menuW, 188);
  assert.equal(layout.menuH, 300);
  assert.equal(gapToFigure(layout.side, figure, menuScreen(layout)), MENU_GAP);
  assertOriginStable(layout, win);
  assertInside(wide, menuScreen(layout), "wide primary menu");
}

{
  const short: Rect = { x: -720, y: 0, width: 720, height: 240 };
  const { win, figure } = placed(1, -700, -40);
  const layout = layoutContextMenu({ winOrigin: win, figure, workArea: short, menuW: 188, menuH: 300 });
  assert.ok(layout.menuH < 300, "short work area scrolls instead of growing past it");
  assert.ok(layout.menuH <= short.height - MENU_EDGE * 2);
  assertInside(short, menuScreen(layout), "short portrait menu");
  assertOriginStable(layout, win);
}

// Logged geometry: primary scaleFactor 2 → work 1600×952; portrait scaleFactor 1.5 → work -720,0 720×1232.
const portraitWork: Rect = { x: -720, y: 0, width: 720, height: 1232 };
const primaryWork: Rect = { x: 0, y: 0, width: 1600, height: 952 };

{
  const generous = petWindowSize(0.65);
  const fit = fitPetChrome(0.65, portraitWork, "duo");
  assert.equal(generous.width, 634, "unfitted scale 0.65 window is what covered the portrait");
  assert.ok(generous.width > portraitWork.width * 0.8);
  assert.equal(fit.narrow, true);
  assert.equal(fit.scale, 0.65, "figure scale stays put when it is under 80% of the work area");
  assert.equal(fit.contentW, 234);
  assert.equal(fit.bubbleRows, 2, "duo bubbles stack instead of crushing into two columns");
  assert.equal(fit.side, 18);
  assert.equal(fit.width, 270);
  assert.ok(BUBBLE_ROW_H > 96, "row height is the real bubble box, not the old 96px cap");
  const stage = Math.round(480 * 0.65);
  assert.ok(fit.height >= FIT_PAD_TOP + BUBBLE_HEADROOM + (BUBBLE_ROW_H * 2 + STACK_GAP) + STACK_GAP + stage + FIT_PAD_BOTTOM);
  assert.equal(fit.height, bubbleStackReserve(2) + stage);
  assert.ok(fit.top >= FIT_PAD_TOP + BUBBLE_HEADROOM, "headroom above the dark bubble");
  assert.ok(fit.width < portraitWork.width / 2, "tight chrome no longer spans the portrait");
  assert.ok(fit.width <= portraitWork.width - 16);
  assert.ok(fit.height <= portraitWork.height - 16);
  assert.ok(fit.height > generous.height);
}

{
  const fit = fitPetChrome(2, portraitWork, "duo");
  assert.ok(fit.contentW <= Math.floor(portraitWork.width * 0.8));
  assert.equal(fit.contentW, 576);
  assert.equal(fit.scale, 1.6);
  assert.ok(fit.width <= portraitWork.width - 16);
  assert.ok(fit.width < petWindowSize(2).width);
  assert.equal(fit.bubbleRows, 1, "capped duo is wide enough for side-by-side bubbles");
  assert.ok(fit.height <= portraitWork.height - 16);
}

{
  // Live log: wide primary, duo, scale 0.4 used to stay 544×308 and clip the upper bubble.
  const fit = fitPetChrome(0.4, primaryWork, "duo");
  const generous = petWindowSize(0.4);
  assert.equal(generous.width, 544);
  assert.equal(generous.height, 308);
  assert.equal(fit.narrow, false);
  assert.equal(fit.bubbleRows, 2);
  assert.equal(fit.width, generous.width);
  assert.equal(fit.side, generous.side);
  assert.ok(fit.height > generous.height);
  const stage = Math.round(480 * 0.4);
  assert.equal(fit.height, bubbleStackReserve(2) + stage);
  assert.ok(fit.top >= FIT_PAD_TOP + BUBBLE_HEADROOM);
  assert.ok(fit.height <= primaryWork.height - 8);
  assert.ok(fit.height >= FIT_PAD_TOP + BUBBLE_HEADROOM + BUBBLE_ROW_H * 2 + STACK_GAP + STACK_GAP + stage + FIT_PAD_BOTTOM);
}

{
  const fit = fitPetChrome(1, primaryWork, "single");
  const generous = petWindowSize(1);
  assert.equal(fit.narrow, false);
  assert.equal(fit.width, generous.width);
  assert.equal(fit.height, generous.height);
  assert.equal(fit.side, generous.side);
  assert.equal(fit.scale, 1);
}

{
  const fit = fitPetChrome(1, portraitWork, "duo");
  assert.equal(fit.contentW, 360);
  assert.equal(fit.bubbleRows, 1);
  assert.ok(fit.width <= fit.contentW + 48);
  assert.ok(fit.width < portraitWork.width - 100);
  const win = {
    x: portraitWork.x + Math.round((portraitWork.width - fit.width) / 2),
    y: 120,
    width: fit.width,
    height: fit.height,
  };
  const figure = {
    x: win.x + fit.side,
    y: win.y + fit.top,
    width: fit.contentW,
    height: fit.contentH,
  };
  const layout = layoutContextMenu({ winOrigin: win, figure, workArea: portraitWork, menuW: 188, menuH: 300 });
  assert.ok(layout.side === "left" || layout.side === "right", "portrait duo menu stays beside the figure");
  assert.ok(layout.menuW >= SIDE_FLOOR);
  assert.equal(gapToFigure(layout.side, figure, menuScreen(layout)), MENU_GAP);
  assertOriginStable(layout, win);
  assertInside(portraitWork, menuScreen(layout), "portrait duo menu");
}

{
  // Default-scale duo, the screenshot case: stacked bubbles, menu fully on the 720-wide panel.
  const fit = fitPetChrome(0.65, portraitWork, "duo");
  const win = {
    x: portraitWork.x + Math.round((portraitWork.width - fit.width) / 2),
    y: 80,
    width: fit.width,
    height: fit.height,
  };
  const figure = {
    x: win.x + fit.side,
    y: win.y + fit.top,
    width: fit.contentW,
    height: fit.contentH,
  };
  const layout = layoutContextMenu({ winOrigin: win, figure, workArea: portraitWork, menuW: 188, menuH: 300 });
  assert.ok(layout.side === "left" || layout.side === "right");
  assert.equal(layout.menuW, 188);
  assert.equal(layout.menuH, 300);
  assert.equal(gapToFigure(layout.side, figure, menuScreen(layout)), MENU_GAP);
  assertOriginStable(layout, win);
  assertInside(portraitWork, menuScreen(layout), "screenshot duo menu");
  // Flushed against the left bezel, the menu still docks to the open side.
  const flush = { ...win, x: portraitWork.x };
  const flushFigure = { ...figure, x: flush.x + fit.side };
  const flushMenu = layoutContextMenu({ winOrigin: flush, figure: flushFigure, workArea: portraitWork, menuW: 188, menuH: 300 });
  assert.equal(flushMenu.side, "right");
  assertInside(portraitWork, menuScreen(flushMenu), "flush-left duo menu");
  assertOriginStable(flushMenu, flush);
}

{
  // Drag keeps the starting size. Chrome tightens only on release, around the same center and feet.
  const dragging = petWindowSize(0.65);
  const release = { x: -500, y: 180, width: dragging.width, height: dragging.height };
  const center = release.x + release.width / 2;
  assert.ok(center >= portraitWork.x && center < portraitWork.x + portraitWork.width);
  const fit = fitPetChrome(0.65, portraitWork, "duo");
  const parked = anchorPetBottomCenter(release, fit);
  assert.equal(parked.x + fit.width / 2, center);
  assert.equal(parked.y + fit.height, release.y + release.height);
  assert.ok(fit.width < dragging.width);
}

console.log("screenLayout checks ok");
