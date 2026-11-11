/**
 * Original full-body pixel chibi frames for the 像素Q pack.
 * Character colors follow the repo's own redraws (purple hair / white hair,
 * school vest / black dress, red ribbon, red apple). Not traced from official art.
 *
 * Run: node scripts/pixel-art.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "packs", "pixel-q", "animations");

const W = 180;
const H = 300;
const OX = 90;
const FEET = 272;
const SPAN = 230;
/** Both duo figures use this exact scale so neither reads as the taller one. */
const DUO_SCALE = 0.72;

const COL = {
  skin: [255, 226, 216, 255],
  skinHi: [255, 244, 238, 255],
  skinShade: [236, 186, 176, 255],
  blush: [255, 168, 180, 255],
  blushDeep: [240, 130, 150, 255],
  hairHi: [244, 232, 255, 255],
  hair: [186, 146, 220, 255],
  hairMid: [146, 102, 190, 255],
  hairDark: [102, 66, 146, 255],
  hairEdge: [72, 46, 110, 255],
  whiteHair: [255, 255, 255, 255],
  whiteMid: [214, 208, 222, 255],
  whiteDark: [168, 160, 178, 255],
  whiteEdge: [124, 116, 136, 255],
  shirt: [255, 252, 250, 255],
  shirtShade: [214, 220, 232, 255],
  vest: [236, 196, 150, 255],
  vestHi: [255, 224, 186, 255],
  vestDark: [196, 146, 102, 255],
  vestDeep: [140, 96, 64, 255],
  bow: [214, 36, 52, 255],
  bowDeep: [140, 18, 36, 255],
  bowHi: [255, 150, 156, 255],
  skirt: [92, 62, 78, 255],
  skirtMid: [72, 46, 60, 255],
  skirtDark: [48, 30, 42, 255],
  sock: [255, 250, 246, 255],
  shoe: [122, 72, 52, 255],
  shoeDark: [78, 44, 34, 255],
  apple: [226, 42, 54, 255],
  appleHi: [255, 186, 176, 255],
  appleDark: [150, 18, 36, 255],
  leaf: [72, 158, 78, 255],
  stem: [120, 74, 42, 255],
  eyeWhite: [255, 255, 255, 255],
  pupil: [42, 22, 40, 255],
  dress: [28, 18, 26, 255],
  dressMid: [48, 30, 40, 255],
  dressHi: [72, 46, 58, 255],
  line: [196, 32, 48, 255],
  boot: [18, 12, 18, 255],
  ink: [58, 36, 48, 255],
  mouth: [186, 96, 108, 255],
  ribbonDark: [36, 16, 24, 230],
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * w * 4, (y + 1) * w * 4);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function createPix(w = W, h = H) {
  return { w, h, rgba: Buffer.alloc(w * h * 4), group: null, bounds: {} };
}

function plot(pix, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= pix.w || py >= pix.h || !color) return;
  const i = (py * pix.w + px) * 4;
  pix.rgba[i] = color[0];
  pix.rgba[i + 1] = color[1];
  pix.rgba[i + 2] = color[2];
  pix.rgba[i + 3] = color[3];
  if (pix.group && color[3] > 20) {
    const box = pix.bounds[pix.group] ?? { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 };
    box.minX = Math.min(box.minX, px);
    box.minY = Math.min(box.minY, py);
    box.maxX = Math.max(box.maxX, px);
    box.maxY = Math.max(box.maxY, py);
    pix.bounds[pix.group] = box;
  }
}

function fillEllipse(pix, cx, cy, rx, ry, color) {
  if (rx <= 0 || ry <= 0) return;
  const y0 = Math.floor(cy - ry - 1);
  const y1 = Math.ceil(cy + ry + 1);
  const x0 = Math.floor(cx - rx - 1);
  const x1 = Math.ceil(cx + rx + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) plot(pix, x, y, color);
    }
  }
}

function fillRect(pix, x, y, w, h, color) {
  for (let yy = Math.floor(y); yy < y + h; yy++) {
    for (let xx = Math.floor(x); xx < x + w; xx++) plot(pix, xx, yy, color);
  }
}

function fillPoly(pix, points, color) {
  if (points.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const hits = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t = (y + 0.5 - y1) / (y2 - y1);
        hits.push(x1 + t * (x2 - x1));
      }
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      for (let x = Math.floor(hits[i]); x <= Math.ceil(hits[i + 1]); x++) plot(pix, x, y, color);
    }
  }
}

function stroke(pix, x0, y0, x1, y1, radius, color) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillEllipse(pix, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, radius, color);
  }
}

function withGroup(pix, name, draw) {
  const prev = pix.group;
  pix.group = name;
  draw();
  pix.group = prev;
}

function outline(pix) {
  const src = Buffer.from(pix.rgba);
  const ink = COL.ink;
  for (let y = 0; y < pix.h; y++) {
    for (let x = 0; x < pix.w; x++) {
      const i = (y * pix.w + x) * 4;
      if (src[i + 3] > 20) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= pix.w || yy >= pix.h) continue;
        if (src[(yy * pix.w + xx) * 4 + 3] > 200) edge = true;
      }
      if (edge) {
        pix.rgba[i] = ink[0];
        pix.rgba[i + 1] = ink[1];
        pix.rgba[i + 2] = ink[2];
        pix.rgba[i + 3] = 255;
      }
    }
  }
}

function sample(src, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= src.w || py >= src.h) return null;
  const i = (py * src.w + px) * 4;
  if (src.rgba[i + 3] < 16) return null;
  return [src.rgba[i], src.rgba[i + 1], src.rgba[i + 2], src.rgba[i + 3]];
}

function blitCharacter(src, dest, anchor, pose) {
  const scale = anchor.scale;
  const pad = 12 + Math.abs(pose.lean) + Math.abs(pose.dy) + 28;
  const minX = Math.floor(anchor.x - 110 * scale - pad);
  const maxX = Math.ceil(anchor.x + 110 * scale + pad);
  const minY = Math.floor(anchor.feetY - (FEET + 30) * scale - pad);
  const maxY = Math.ceil(anchor.feetY + 18 * scale);
  for (let dy = minY; dy <= maxY; dy++) {
    for (let dx = minX; dx <= maxX; dx++) {
      const lx = OX + (dx - anchor.x) / scale;
      const ly = FEET + (dy - anchor.feetY) / scale;
      const y = FEET - (FEET + pose.dy - ly) / pose.sy;
      const t = (FEET - y) / SPAN;
      const x = OX + (lx - OX - pose.lean * t) / pose.sx;
      const color = sample(src, x, y);
      if (color) plot(dest, dx, dy, color);
    }
  }
}

function hairOf(kind) {
  return kind === "dark"
    ? { hi: COL.whiteHair, mid: COL.whiteMid, dark: COL.whiteDark, edge: COL.whiteEdge }
    : { hi: COL.hairHi, mid: COL.hair, dark: COL.hairMid, edge: COL.hairEdge };
}

function lock(pix, topX, topY, botX, botY, halfTop, halfBot, color) {
  fillPoly(pix, [
    [topX - halfTop, topY],
    [topX + halfTop, topY],
    [botX + halfBot, botY],
    [botX - halfBot, botY],
  ], color);
}

function bendArm(pix, ax, ay, bx, by, cx, cy, sleeve, shade) {
  stroke(pix, ax, ay, bx, by, 6.2, shade);
  stroke(pix, ax, ay, bx, by, 4.6, sleeve);
  stroke(pix, bx, by, cx, cy, 5.4, shade);
  stroke(pix, bx, by, cx, cy, 3.8, sleeve);
  fillEllipse(pix, cx, cy, 5.4, 4.4, COL.skin);
  fillEllipse(pix, cx - 3.2, cy - 2.2, 1.7, 1.5, COL.skinHi);
  fillEllipse(pix, cx + 0.2, cy - 3, 1.6, 1.4, COL.skin);
  fillEllipse(pix, cx + 3.2, cy - 1.6, 1.5, 1.3, COL.skinShade);
}

function armEnds(pose) {
  const s = OX;
  if (pose.arm === "up") return { l: [s - 34, 96], r: [s + 36, 90], le: [s - 28, 124], re: [s + 30, 120] };
  if (pose.arm === "out") return { l: [s - 52, 168], r: [s + 52, 164], le: [s - 30, 156], re: [s + 30, 154] };
  if (pose.arm === "down") return { l: [s - 22, 230], r: [s + 22, 232], le: [s - 20, 190], re: [s + 20, 192] };
  if (pose.arm === "chest") return { l: [s - 6, 198], r: [s + 8, 192], le: [s - 18, 176], re: [s + 16, 174] };
  if (pose.arm === "offer") return { l: [s - 16, 222], r: [s + 16, 222], le: [s - 22, 186], re: [s + 22, 186] };
  return { l: [s - 18, 214], r: [s + 18, 214], le: [s - 24, 180], re: [s + 24, 180] };
}

function appleAt(pix, x, y, big) {
  const rx = big ? 13 : 11;
  const ry = big ? 12 : 10;
  fillEllipse(pix, x + 1, y + 1, rx + 0.6, ry, COL.appleDark);
  fillEllipse(pix, x, y, rx, ry, COL.apple);
  fillEllipse(pix, x - 3, y - 3, 4.2, 3.2, COL.appleHi);
  fillEllipse(pix, x + 4, y + 3, 3, 2.2, COL.appleDark);
  fillRect(pix, x - 0.6, y - ry - 4, 2, 5, COL.stem);
  fillEllipse(pix, x + 5, y - ry - 1, 4.2, 2.2, COL.leaf);
  fillEllipse(pix, x + 6, y - ry + 1, 2, 1.2, [120, 200, 110, 255]);
}

function drawEye(pix, x, y, kind, pose) {
  const iris = kind === "dark" ? [214, 42, 58, 255] : [154, 96, 204, 255];
  const irisHi = kind === "dark" ? [255, 150, 156, 255] : [214, 176, 240, 255];
  const irisDeep = kind === "dark" ? [120, 16, 32, 255] : [96, 48, 150, 255];
  if (pose.blink) {
    stroke(pix, x - 7, y + 1, x - 2, y - 2, 1.1, irisDeep);
    stroke(pix, x - 2, y - 2, x + 3, y - 2, 1.1, iris);
    stroke(pix, x + 3, y - 2, x + 8, y + 1, 1.1, irisDeep);
    return;
  }
  const squint = pose.expr === "angry" ? 0.72 : pose.expr === "sad" ? 1.05 : 1;
  fillEllipse(pix, x, y, 8.2, 9.2 * squint, COL.eyeWhite);
  fillEllipse(pix, x, y + 1.2, 5.4, 6.2 * squint, irisDeep);
  fillEllipse(pix, x - 0.2, y + 0.4, 4.8, 5.4 * squint, iris);
  fillEllipse(pix, x - 0.6, y - 1.6, 3.1, 2.4 * squint, irisHi);
  fillEllipse(pix, x + 0.4, y + 1.6, 2.2, 2.8 * squint, COL.pupil);
  fillRect(pix, x - 3.2, y - 3.2, 3, 3, COL.eyeWhite);
  plot(pix, x + 2.2, y + 2.4, COL.eyeWhite);
  plot(pix, x + 3.2, y + 2.4, COL.eyeWhite);
  stroke(pix, x - 8, y - 7, x + 7, y - 8, 0.9, COL.ink);
  if (pose.expr === "sad") {
    plot(pix, x - 7, y + 8, [140, 186, 230, 255]);
    plot(pix, x - 7, y + 9, [140, 186, 230, 255]);
    plot(pix, x - 6, y + 10, [186, 214, 240, 255]);
  }
}

function drawFace(pix, kind, pose) {
  const y = 118;
  fillEllipse(pix, OX + 1, y + 2, 27, 25, COL.skinShade);
  fillEllipse(pix, OX - 1, y, 26, 24, COL.skin);
  fillEllipse(pix, OX - 8, y - 8, 10, 8, COL.skinHi);
  const blinkJoy = pose.expr === "joy" && pose.blink;
  if (pose.expr === "joy" && !pose.blink) {
    drawEye(pix, OX - 12, y - 2, kind, pose);
    drawEye(pix, OX + 13, y - 2, kind, pose);
  } else if (blinkJoy || (pose.expr === "happy" && pose.blink)) {
    drawEye(pix, OX - 12, y - 2, kind, { ...pose, blink: true });
    drawEye(pix, OX + 13, y - 2, kind, { ...pose, blink: true });
  } else {
    drawEye(pix, OX - 12, y - 2, kind, pose);
    drawEye(pix, OX + 13, y - 2, kind, pose);
  }
  if (pose.expr === "angry") {
    stroke(pix, OX - 20, y - 16, OX - 6, y - 12, 1.1, COL.ink);
    stroke(pix, OX + 20, y - 16, OX + 6, y - 12, 1.1, COL.ink);
  } else if (pose.expr === "sad") {
    stroke(pix, OX - 20, y - 12, OX - 6, y - 16, 1.1, COL.ink);
    stroke(pix, OX + 20, y - 12, OX + 6, y - 16, 1.1, COL.ink);
  } else {
    stroke(pix, OX - 18, y - 14, OX - 8, y - 15, 0.8, COL.hairEdge);
    stroke(pix, OX + 18, y - 14, OX + 8, y - 15, 0.8, COL.hairEdge);
  }
  const mouthY = y + 14;
  if (pose.expr === "joy") {
    fillEllipse(pix, OX, mouthY + 1, 5, 3.6, [176, 72, 84, 255]);
    fillEllipse(pix, OX, mouthY - 1, 4.2, 1.6, COL.skin);
    fillEllipse(pix, OX - 1, mouthY, 1.4, 1, [255, 180, 180, 255]);
  } else if (pose.expr === "happy") {
    stroke(pix, OX - 5, mouthY - 1, OX, mouthY + 2, 1.05, COL.mouth);
    stroke(pix, OX, mouthY + 2, OX + 5, mouthY - 1, 1.05, COL.mouth);
  } else if (pose.expr === "angry" || pose.expr === "sad") {
    stroke(pix, OX - 4, mouthY + 2, OX, mouthY, 0.95, COL.mouth);
    stroke(pix, OX, mouthY, OX + 4, mouthY + 2, 0.95, COL.mouth);
  } else {
    stroke(pix, OX - 3, mouthY, OX + 3, mouthY + 1, 0.9, COL.mouth);
  }
  const blush = pose.expr === "joy" || pose.expr === "happy" ? 4.2 : 3.2;
  fillEllipse(pix, OX - 18, y + 8, blush, 2.3, COL.blush);
  fillEllipse(pix, OX + 18, y + 8, blush, 2.3, COL.blush);
  if (pose.expr === "joy") {
    fillEllipse(pix, OX - 18, y + 8, 2, 1.2, COL.blushDeep);
    fillEllipse(pix, OX + 18, y + 8, 2, 1.2, COL.blushDeep);
  }
}

function hairRibbon(pix, kind, pose) {
  const sway = pose.ribbon * 14;
  const x = OX + 30 + pose.ribbon * 2;
  const y = 78;
  fillEllipse(pix, x - 8, y, 9, 6.5, COL.bowDeep);
  fillEllipse(pix, x - 9, y - 1, 7.5, 5, COL.bow);
  fillEllipse(pix, x + 8, y + 1, 8, 5.5, COL.bowDeep);
  fillEllipse(pix, x + 7, y, 6.5, 4.4, COL.bow);
  fillEllipse(pix, x, y + 1, 3, 3, COL.bowDeep);
  plot(pix, x - 11, y - 3, COL.bowHi);
  plot(pix, x - 10, y - 2, COL.bowHi);
  plot(pix, x + 5, y - 2, COL.bowHi);
  stroke(pix, x - 1, y + 4, x - 6 + sway, y + 28, 2.1, COL.bow);
  stroke(pix, x - 1, y + 4, x - 6 + sway, y + 28, 1.1, COL.bowHi);
  stroke(pix, x + 2, y + 4, x + 10 + sway * 0.8, y + 34, 1.8, COL.bowDeep);
  if (kind === "dark") stroke(pix, x + 10 + sway * 0.8, y + 34, x + 18 + sway * 0.4, y + 52, 1.4, COL.bow);
}

function bangs(pix, hair, pose) {
  const tips = [-22, -12, -2, 8, 18];
  tips.forEach((dx, index) => {
    const drop = 16 + (index % 2) * 6;
    const sway = pose.hair * 3;
    const color = index % 2 ? hair.dark : hair.mid;
    fillPoly(pix, [
      [OX + dx - 6, 86],
      [OX + dx + 6, 86],
      [OX + dx + sway, 86 + drop],
    ], color);
    fillPoly(pix, [
      [OX + dx - 3, 86],
      [OX + dx + 1, 84],
      [OX + dx + sway * 0.5, 86 + drop - 4],
    ], hair.hi);
  });
}

function drawBody(pix, kind, pose, options = {}) {
  const hair = hairOf(kind);
  const sway = pose.hair * 12;
  const hem = pose.skirt * 14;
  const long = kind === "dark";
  const showApple = options.apple !== false && kind === "normal" && pose.arm !== "out";

  withGroup(pix, "hair", () => {
    fillEllipse(pix, OX, 108, 40, 36, hair.edge);
    fillEllipse(pix, OX - 2, 102, 36, 32, hair.dark);
    fillEllipse(pix, OX - 6, 92, 22, 16, hair.mid);
    fillEllipse(pix, OX - 14, 84, 12, 8, hair.hi);
    const reach = long ? 236 : 186;
    lock(pix, OX - 30, 100, OX - 38 + sway, reach, 10, 6, hair.dark);
    lock(pix, OX - 24, 108, OX - 28 + sway * 0.7, reach - 16, 7, 4, hair.mid);
    lock(pix, OX - 20, 112, OX - 18 + sway * 0.4, reach - 36, 4, 2, hair.hi);
    lock(pix, OX + 28, 102, OX + 40 + sway, long ? 246 : 196, 11, 7, hair.edge);
    lock(pix, OX + 22, 110, OX + 30 + sway * 0.6, long ? 220 : 176, 7, 4, hair.dark);
    lock(pix, OX + 16, 114, OX + 18 + sway * 0.3, long ? 200 : 164, 4, 2.4, hair.hi);
    if (long) lock(pix, OX - 4, 120, OX + sway * 0.3, 250, 6, 4, hair.mid);
  });

  withGroup(pix, "legs", () => {
    if (kind === "dark") {
      fillRect(pix, OX - 14, 236, 12, 28, COL.dress);
      fillRect(pix, OX + 2, 236, 12, 28, COL.dressMid);
      fillEllipse(pix, OX - 10, 266, 11, 5.5, COL.boot);
      fillEllipse(pix, OX + 10, 266, 11, 5.5, COL.boot);
      fillRect(pix, OX - 18, 262, 16, 2, COL.line);
      fillRect(pix, OX + 2, 262, 16, 2, COL.line);
    } else {
      fillRect(pix, OX - 12, 240, 10, 16, COL.skinShade);
      fillRect(pix, OX + 3, 240, 10, 16, COL.skin);
      fillRect(pix, OX - 13, 252, 12, 10, COL.sock);
      fillRect(pix, OX + 2, 252, 12, 10, COL.sock);
      fillRect(pix, OX - 13, 252, 12, 2, COL.shirtShade);
      fillRect(pix, OX + 2, 252, 12, 2, COL.shirtShade);
      fillEllipse(pix, OX - 9, 266, 11, 5.6, COL.shoe);
      fillEllipse(pix, OX + 10, 266, 11, 5.6, COL.shoeDark);
      stroke(pix, OX - 14, 262, OX - 4, 262, 0.8, COL.shoeDark);
    }
  });

  withGroup(pix, "skirt", () => {
    if (kind === "dark") {
      fillPoly(pix, [
        [OX - 22, 206],
        [OX + 22, 206],
        [OX + 40 + hem, 258],
        [OX - 40 + hem, 258],
      ], COL.dress);
      for (let i = 0; i < 5; i++) {
        const t0 = i / 5;
        const t1 = (i + 1) / 5;
        const color = i % 2 ? COL.dressMid : COL.dressHi;
        fillPoly(pix, [
          [OX - 18 + t0 * 36, 210],
          [OX - 18 + t1 * 36, 210],
          [OX - 34 + hem + t1 * 68, 254],
          [OX - 34 + hem + t0 * 68, 254],
        ], color);
        stroke(pix, OX - 16 + i * 8, 212, OX - 28 + hem + i * 14, 252, 0.7, COL.line);
      }
      stroke(pix, OX - 38 + hem, 254, OX + 38 + hem, 254, 1.4, COL.line);
    } else {
      fillPoly(pix, [
        [OX - 20, 208],
        [OX + 20, 208],
        [OX + 36 + hem, 252],
        [OX - 36 + hem, 252],
      ], COL.skirtDark);
      for (let i = 0; i < 5; i++) {
        const t0 = i / 5;
        const t1 = (i + 1) / 5;
        const color = i % 2 ? COL.skirtMid : COL.skirt;
        fillPoly(pix, [
          [OX - 16 + t0 * 32, 210],
          [OX - 16 + t1 * 32, 210],
          [OX - 30 + hem + t1 * 60, 248],
          [OX - 30 + hem + t0 * 60, 248],
        ], color);
      }
      stroke(pix, OX - 34 + hem, 248, OX + 34 + hem, 248, 1.2, COL.skirtDark);
    }
  });

  withGroup(pix, "arms", () => {
    const sleeve = kind === "dark" ? COL.dress : COL.shirt;
    const shade = kind === "dark" ? COL.dressMid : COL.shirtShade;
    const ends = armEnds(pose);
    fillEllipse(pix, OX - 24, 162, 10, 8, shade);
    fillEllipse(pix, OX + 24, 162, 10, 8, sleeve);
    bendArm(pix, OX - 22, 164, ends.le[0], ends.le[1], ends.l[0], ends.l[1], sleeve, shade);
    bendArm(pix, OX + 22, 164, ends.re[0], ends.re[1], ends.r[0], ends.r[1], sleeve, shade);
  });

  withGroup(pix, "torso", () => {
    if (kind === "dark") {
      fillEllipse(pix, OX, 156, 16, 10, COL.dress);
      fillPoly(pix, [
        [OX - 18, 158],
        [OX + 18, 158],
        [OX + 20, 178],
        [OX + 14, 206],
        [OX - 14, 206],
        [OX - 20, 178],
      ], COL.dress);
      fillPoly(pix, [
        [OX + 1, 160],
        [OX + 16, 162],
        [OX + 12, 204],
        [OX + 1, 204],
      ], COL.dressMid);
      fillEllipse(pix, OX - 6, 166, 6, 5, COL.dressHi);
      stroke(pix, OX, 164, OX, 204, 0.9, COL.line);
      stroke(pix, OX - 8, 168, OX - 10, 202, 0.8, COL.line);
      stroke(pix, OX + 8, 168, OX + 10, 202, 0.8, COL.line);
    } else {
      fillEllipse(pix, OX - 24, 162, 11, 9, COL.shirtShade);
      fillEllipse(pix, OX + 24, 162, 11, 9, COL.shirt);
      fillPoly(pix, [
        [OX - 16, 150],
        [OX + 16, 150],
        [OX + 18, 176],
        [OX - 18, 176],
      ], COL.shirt);
      fillPoly(pix, [
        [OX - 8, 150],
        [OX + 8, 150],
        [OX, 172],
      ], COL.shirtShade);
      fillPoly(pix, [
        [OX - 18, 164],
        [OX + 18, 164],
        [OX + 22, 184],
        [OX + 16, 206],
        [OX + 22, 218],
        [OX - 22, 218],
        [OX - 16, 206],
        [OX - 22, 184],
      ], COL.vest);
      fillPoly(pix, [
        [OX + 2, 168],
        [OX + 16, 168],
        [OX + 14, 206],
        [OX + 18, 216],
        [OX + 2, 216],
      ], COL.vestDark);
      fillEllipse(pix, OX - 10, 174, 7, 6, COL.vestHi);
      fillPoly(pix, [
        [OX - 7, 164],
        [OX + 7, 164],
        [OX, 184],
      ], COL.shirt);
      for (const y of [188, 198, 208]) fillEllipse(pix, OX - 7, y, 1.7, 1.7, COL.vestDeep);
    }
  });

  withGroup(pix, "bow", () => {
    if (kind === "normal") {
      fillEllipse(pix, OX - 9, 156, 8, 5, COL.bow);
      fillEllipse(pix, OX + 9, 156, 8, 5, COL.bowDeep);
      fillEllipse(pix, OX - 10, 155, 5, 3, COL.bowHi);
      fillEllipse(pix, OX, 157, 2.6, 2.6, COL.bowDeep);
      stroke(pix, OX - 2, 160, OX - 7, 176, 1.6, COL.bow);
      stroke(pix, OX + 2, 160, OX + 7, 176, 1.5, COL.bowDeep);
    }
  });

  if (showApple) {
    const raised = pose.arm === "up";
    const ax = raised ? OX + 30 : OX;
    const ay = raised ? 102 : pose.arm === "offer" ? 224 : 214;
    withGroup(pix, "apple", () => appleAt(pix, ax, ay, raised || pose.arm === "offer"));
    withGroup(pix, "hands", () => {
      if (!raised) {
        fillEllipse(pix, ax - 12, ay + 2, 5, 3.6, COL.skin);
        fillEllipse(pix, ax + 12, ay + 2, 5, 3.6, COL.skinShade);
      }
    });
  }

  withGroup(pix, "face", () => drawFace(pix, kind, pose));
  withGroup(pix, "hair", () => bangs(pix, hair, pose));
  withGroup(pix, "ribbon", () => hairRibbon(pix, kind, pose));
}

function shadow(pix, x, y, rx, alpha) {
  fillEllipse(pix, x, y, Math.max(6, rx), 4.2, [48, 24, 32, alpha]);
}

function renderSingle(kind, pose) {
  const body = createPix();
  drawBody(body, kind, { ...pose, arm: kind === "dark" && pose.arm === "hold" ? "chest" : pose.arm });
  outline(body);
  const frame = createPix();
  const lift = Math.max(0, -pose.dy);
  shadow(frame, OX, FEET + 8, 22 * pose.sx * (1 - lift / 120), Math.max(18, Math.round(90 * (1 - lift / 80))));
  blitCharacter(body, frame, { x: OX, feetY: FEET, scale: 1 }, pose);
  frame.bounds = body.bounds;
  return frame;
}

function curve(pix, x0, y0, x1, y1, x2, y2, radius, color) {
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
    const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
    fillEllipse(pix, x, y, radius, radius * 0.82, color);
  }
}

function renderDuo(darkPose, normalPose) {
  const darkBody = createPix();
  const normalBody = createPix();
  const darkArm = darkPose.arm === "up" || darkPose.arm === "out" || darkPose.arm === "down" ? darkPose.arm : "chest";
  drawBody(darkBody, "dark", { ...darkPose, arm: darkArm }, { apple: false });
  drawBody(normalBody, "normal", { ...normalPose, arm: normalPose.arm === "out" ? "out" : "hold" }, { apple: false });
  outline(darkBody);
  outline(normalBody);
  const frame = createPix();
  const darkAnchor = { x: 66, feetY: FEET - 14, scale: DUO_SCALE };
  const normalAnchor = { x: 116, feetY: FEET - 14, scale: DUO_SCALE };
  const lift = Math.max(0, -darkPose.dy, -normalPose.dy);
  shadow(frame, darkAnchor.x, FEET + 10, 16 * (1 - lift / 140), Math.max(16, 70 - lift));
  shadow(frame, normalAnchor.x, FEET + 10, 16 * (1 - lift / 140), Math.max(16, 70 - lift));
  blitCharacter(darkBody, frame, darkAnchor, darkPose);
  blitCharacter(normalBody, frame, normalAnchor, normalPose);
  const raised = normalPose.arm === "up" || darkPose.arm === "up";
  const appleLocalY = raised ? 108 : 214;
  const applePt = project(normalAnchor, normalPose, OX - 8, appleLocalY);
  const shoulder = project(darkAnchor, darkPose, OX + 20, 164);
  const cheek = project(normalAnchor, normalPose, OX - 20, 126);
  curve(frame, shoulder.x, shoulder.y, (shoulder.x + applePt.x) / 2 - 6, (shoulder.y + applePt.y) / 2 - 10, applePt.x - 8, applePt.y, 4.6, COL.dress);
  curve(frame, shoulder.x, shoulder.y, (shoulder.x + cheek.x) / 2, shoulder.y - 8, cheek.x, cheek.y, 3.4, COL.dressMid);
  fillEllipse(frame, cheek.x, cheek.y, 4.6, 3.6, COL.skin);
  fillEllipse(frame, applePt.x - 10, applePt.y + 2, 4.2, 3.2, COL.skinShade);
  fillEllipse(frame, applePt.x + 10, applePt.y + 2, 4.2, 3.2, COL.skin);
  appleAt(frame, applePt.x, applePt.y, true);
  return frame;
}

function project(anchor, pose, x, y) {
  const t = (FEET - y) / SPAN;
  const lx = OX + (x - OX) * pose.sx + pose.lean * t;
  const ly = FEET - (FEET - y) * pose.sy + pose.dy;
  return {
    x: anchor.x + (lx - OX) * anchor.scale,
    y: anchor.feetY + (ly - FEET) * anchor.scale,
  };
}

function pose(partial) {
  return {
    dy: 0,
    sy: 1,
    sx: 1,
    lean: 0,
    blink: false,
    expr: "neutral",
    ribbon: 0,
    skirt: 0,
    hair: 0,
    arm: "hold",
    apple: 0,
    ...partial,
  };
}

const IDLE = [
  pose({}),
  pose({ dy: -12, sy: 1.03, sx: 0.98, lean: 4, ribbon: 0.5, skirt: 0.4, hair: 0.45 }),
  pose({ dy: -20, sy: 1.05, sx: 0.96, blink: true, ribbon: 1, skirt: 0.8, hair: 0.9 }),
  pose({ dy: -8, sy: 1.02, sx: 0.99, lean: -3, ribbon: 0.2, skirt: 0.15, hair: 0.1 }),
  pose({ lean: -3, ribbon: -0.4, skirt: -0.5, hair: -0.45 }),
  pose({ dy: 8, sy: 0.8, sx: 1.16, ribbon: -0.9, skirt: -1, hair: -0.8 }),
  pose({ dy: 3, sy: 0.94, sx: 1.06, blink: true, ribbon: -0.2, skirt: -0.15, hair: -0.1 }),
  pose({ dy: -6, sy: 1.02, sx: 0.98, ribbon: 0.3, skirt: 0.25, hair: 0.3 }),
];

const JOY = [
  pose({ dy: 10, sy: 0.74, sx: 1.24, expr: "joy", arm: "down", ribbon: -0.2, skirt: -0.2 }),
  pose({ dy: -18, sy: 1.06, sx: 0.94, expr: "joy", arm: "up", ribbon: 0.6, skirt: 0.5, hair: 0.6 }),
  pose({ dy: -36, sy: 1.03, sx: 0.95, expr: "joy", arm: "up", ribbon: 1, skirt: 1, hair: 1 }),
  pose({ dy: -32, sy: 1.03, sx: 0.96, expr: "joy", blink: true, arm: "up", ribbon: 0.8, skirt: 0.7, hair: 0.8 }),
  pose({ dy: -12, sy: 1.02, sx: 0.98, expr: "joy", arm: "up", ribbon: 0.3, skirt: 0.2, hair: 0.2 }),
  pose({ dy: 12, sy: 0.7, sx: 1.26, expr: "joy", arm: "out", ribbon: -0.4, skirt: -0.6, hair: -0.3 }),
  pose({ dy: -16, sy: 1.05, sx: 0.96, expr: "joy", arm: "up", ribbon: 0.7, skirt: 0.4, hair: 0.5 }),
  pose({ dy: -4, sy: 1.02, sx: 0.99, expr: "happy", arm: "up", ribbon: 0.2, skirt: 0.1, hair: 0.15 }),
];

const ANGRY = [
  pose({ dy: 3, sy: 0.96, sx: 1.04, lean: -24, expr: "angry", arm: "out", ribbon: -1, skirt: -0.9, hair: -1 }),
  pose({ lean: 28, expr: "angry", arm: "out", ribbon: 1, skirt: 1, hair: 1 }),
  pose({ dy: 8, sy: 0.86, sx: 1.12, lean: -28, expr: "angry", arm: "out", ribbon: -0.8, skirt: -1, hair: -0.8 }),
  pose({ dy: -6, sy: 1.03, sx: 0.98, lean: 24, expr: "angry", blink: true, arm: "out", ribbon: 0.7, skirt: 0.5, hair: 0.7 }),
  pose({ lean: -18, expr: "angry", arm: "out", ribbon: -0.4, skirt: -0.3, hair: -0.4 }),
  pose({ lean: 20, expr: "angry", arm: "out", ribbon: 0.5, skirt: 0.4, hair: 0.5 }),
  pose({ dy: 4, sy: 0.9, sx: 1.08, lean: -12, expr: "angry", arm: "out", ribbon: -0.2, skirt: -0.2, hair: -0.15 }),
  pose({ lean: 8, expr: "angry", arm: "out", ribbon: 0.15, hair: 0.1 }),
];

const SAD = [
  pose({ dy: 3, sy: 0.98, expr: "sad", arm: "down", ribbon: -0.1 }),
  pose({ dy: 10, sy: 0.92, sx: 1.04, lean: -4, expr: "sad", arm: "down", ribbon: -0.3, skirt: -0.2, hair: -0.25 }),
  pose({ dy: 16, sy: 0.84, sx: 1.08, lean: 3, expr: "sad", blink: true, arm: "down", ribbon: 0.15, skirt: 0.25, hair: 0.2 }),
  pose({ dy: 18, sy: 0.8, sx: 1.1, lean: -6, expr: "sad", arm: "down", ribbon: -0.45, skirt: -0.4, hair: -0.4 }),
  pose({ dy: 16, sy: 0.82, sx: 1.08, lean: 6, expr: "sad", arm: "down", ribbon: 0.4, skirt: 0.45, hair: 0.35 }),
  pose({ dy: 20, sy: 0.78, sx: 1.12, lean: -3, expr: "sad", blink: true, arm: "down", ribbon: -0.2, skirt: -0.15, hair: -0.1 }),
  pose({ dy: 14, sy: 0.84, sx: 1.06, expr: "sad", arm: "down", ribbon: 0.1, skirt: 0.1, hair: 0.1 }),
  pose({ dy: 12, sy: 0.86, sx: 1.05, lean: 2, expr: "sad", arm: "down", ribbon: -0.05, hair: -0.05 }),
];

const HAPPY = [
  pose({ expr: "happy", arm: "hold" }),
  pose({ dy: 4, sy: 0.92, sx: 1.06, expr: "happy", arm: "offer", ribbon: 0.2, skirt: 0.15 }),
  pose({ dy: -8, sy: 1.04, sx: 0.97, expr: "happy", arm: "offer", ribbon: 0.6, skirt: 0.4, hair: 0.4 }),
  pose({ dy: -4, sy: 1.02, expr: "happy", blink: true, arm: "offer", ribbon: 0.3, skirt: 0.1, hair: 0.15 }),
  pose({ dy: 3, sy: 0.9, sx: 1.08, expr: "joy", arm: "offer", ribbon: -0.2, skirt: -0.3, hair: -0.2 }),
  pose({ dy: -10, sy: 1.05, sx: 0.96, expr: "happy", arm: "up", ribbon: 0.8, skirt: 0.5, hair: 0.6 }),
  pose({ dy: -2, expr: "happy", blink: true, arm: "offer", ribbon: 0.2, hair: 0.1 }),
  pose({ dy: -1, expr: "happy", arm: "offer", ribbon: 0.15, skirt: 0.1, hair: 0.1 }),
];

const CLIPS = {
  idle: IDLE,
  joyful: JOY,
  angry: ANGRY,
  sad: SAD,
  happy: HAPPY,
};

function soften(base, scale = 0.35) {
  return pose({
    ...base,
    dy: base.dy * scale,
    sy: 1 + (base.sy - 1) * scale,
    sx: 1 + (base.sx - 1) * scale,
    lean: base.lean * scale,
    arm: "hold",
    expr: base.expr === "angry" ? "sad" : "neutral",
    blink: base.blink,
    ribbon: base.ribbon * 0.4,
    skirt: base.skirt * 0.4,
    hair: base.hair * 0.4,
  });
}

function duoPair(clip, index) {
  const base = CLIPS[clip === "sad-dark" ? "sad" : clip][index];
  if (clip === "angry") return { dark: pose({ ...base, arm: "out" }), normal: soften(base, 0.3) };
  if (clip === "sad") return { dark: pose({ ...IDLE[index], arm: "chest", lean: 4, expr: "neutral" }), normal: base };
  if (clip === "sad-dark") return { dark: pose({ ...base, arm: "down" }), normal: soften(base, 0.35) };
  if (clip === "joyful") {
    return {
      dark: pose({ ...base, dy: base.dy * 0.82, arm: "up", expr: base.expr === "joy" ? "happy" : base.expr }),
      normal: pose({ ...base, arm: "up" }),
    };
  }
  if (clip === "happy") return { dark: pose({ ...base, arm: "chest", expr: "happy" }), normal: pose({ ...base, arm: "offer" }) };
  return { dark: pose({ ...base, dy: base.dy * 0.75, arm: "chest" }), normal: pose({ ...base, arm: "hold" }) };
}

function writeFrame(form, clip, index, pix) {
  const dir = path.join(outRoot, form, clip);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${String(index + 1).padStart(2, "0")}.png`;
  fs.writeFileSync(path.join(dir, name), encodePng(pix.w, pix.h, pix.rgba));
}

function dumpBounds(label, pix) {
  const parts = [];
  for (const [name, box] of Object.entries(pix.bounds)) {
    if (!Number.isFinite(box.minX)) continue;
    parts.push(`${name} ${box.minX},${box.minY}-${box.maxX},${box.maxY}`);
  }
  console.log(label, parts.join(" | "));
}

for (const kind of ["normal", "dark"]) {
  for (const [clip, frames] of Object.entries(CLIPS)) {
    frames.forEach((framePose, index) => {
      const pix = renderSingle(kind, framePose);
      writeFrame(kind, clip, index, pix);
      if (index === 0) dumpBounds(`${kind}/${clip}`, pix);
    });
  }
}

for (const clip of ["idle", "joyful", "angry", "sad", "happy", "sad-dark"]) {
  for (let index = 0; index < 8; index++) {
    const pair = duoPair(clip === "sad-dark" ? "sad-dark" : clip, index);
    const pix = renderDuo(pair.dark, pair.normal);
    writeFrame("duo", clip, index, pix);
  }
}

console.log(`wrote pixel frames under ${outRoot}`);
