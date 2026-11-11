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

const W = 120;
const H = 200;
const OX = 60;
const FEET = 188;
const SPAN = 168;

const COL = {
  skin: [243, 201, 184, 255],
  skinShade: [226, 170, 150, 255],
  blush: [240, 150, 160, 255],
  hairHi: [244, 236, 252, 255],
  hair: [186, 150, 214, 255],
  hairMid: [142, 104, 180, 255],
  hairDark: [92, 64, 132, 255],
  whiteHair: [255, 255, 255, 255],
  whiteMid: [228, 224, 232, 255],
  whiteDark: [184, 178, 190, 255],
  shirt: [255, 253, 250, 255],
  shirtShade: [214, 220, 230, 255],
  vest: [230, 196, 154, 255],
  vestDark: [196, 150, 104, 255],
  vestDeep: [138, 98, 60, 255],
  bow: [224, 40, 52, 255],
  bowDeep: [150, 20, 32, 255],
  bowHi: [255, 150, 150, 255],
  skirt: [44, 50, 74, 255],
  skirtDark: [28, 32, 50, 255],
  sock: [255, 252, 248, 255],
  shoe: [92, 58, 42, 255],
  shoeDark: [58, 36, 26, 255],
  apple: [226, 48, 58, 255],
  appleHi: [255, 176, 168, 255],
  appleDark: [140, 20, 32, 255],
  leaf: [62, 140, 70, 255],
  stem: [110, 70, 40, 255],
  eye: [122, 86, 168, 255],
  eyeDark: [42, 24, 64, 255],
  eyeWhite: [255, 255, 255, 255],
  redEye: [224, 40, 52, 255],
  redEyeDark: [110, 12, 24, 255],
  dress: [22, 16, 22, 255],
  dressMid: [40, 30, 36, 255],
  line: [208, 32, 48, 255],
  boot: [16, 12, 16, 255],
  ink: [42, 28, 36, 255],
  shadow: [40, 16, 24, 80],
  ribbonDark: [28, 14, 20, 220],
  mouth: [168, 92, 96, 255],
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
  const pad = 8 + Math.abs(pose.lean) + Math.abs(pose.dy) + 24;
  const minX = Math.floor(anchor.x - 70 * scale - pad);
  const maxX = Math.ceil(anchor.x + 70 * scale + pad);
  const minY = Math.floor(anchor.feetY - 200 * scale - pad);
  const maxY = Math.ceil(anchor.feetY + 16 * scale);
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

function face(pix, kind, pose) {
  const cx = OX;
  const cy = 70;
  const iris = kind === "dark" ? COL.redEye : COL.eye;
  const pupil = kind === "dark" ? COL.redEyeDark : COL.eyeDark;
  const blink = pose.blink || pose.expr === "joy";
  const left = cx - 12;
  const right = cx + 12;
  const eyeY = cy + 4;
  if (blink || pose.expr === "happy") {
    for (const ex of [left, right]) {
      plot(pix, ex - 2, eyeY - 1, iris);
      plot(pix, ex - 1, eyeY - 2, iris);
      plot(pix, ex, eyeY - 2, iris);
      plot(pix, ex + 1, eyeY - 2, iris);
      plot(pix, ex + 2, eyeY - 1, iris);
      plot(pix, ex - 1, eyeY - 1, iris);
      plot(pix, ex, eyeY - 1, iris);
      plot(pix, ex + 1, eyeY - 1, iris);
    }
  } else {
    for (const ex of [left, right]) {
      fillEllipse(pix, ex, eyeY, pose.expr === "angry" ? 3.2 : 4.2, pose.expr === "sad" ? 4.6 : 5.2, COL.eyeWhite);
      fillEllipse(pix, ex + (pose.expr === "sad" ? 0.4 : 0), eyeY + 0.6, 2.5, 3.1, iris);
      fillEllipse(pix, ex + 0.2, eyeY + 1.1, 1.3, 1.8, pupil);
      plot(pix, ex - 1, eyeY - 1, COL.eyeWhite);
    }
  }
  if (pose.expr === "angry") {
    stroke(pix, left - 4, eyeY - 8, left + 4, eyeY - 5, 0.8, COL.ink);
    stroke(pix, right + 4, eyeY - 8, right - 4, eyeY - 5, 0.8, COL.ink);
  } else if (pose.expr === "sad") {
    stroke(pix, left - 4, eyeY - 5, left + 4, eyeY - 8, 0.8, COL.ink);
    stroke(pix, right + 4, eyeY - 5, right - 4, eyeY - 8, 0.8, COL.ink);
    plot(pix, left - 6, eyeY + 6, [120, 170, 220, 255]);
    plot(pix, left - 6, eyeY + 7, [120, 170, 220, 255]);
  }
  const mouthY = cy + 14;
  if (pose.expr === "joy") {
    fillEllipse(pix, cx, mouthY, 4.2, 3.2, [168, 64, 72, 255]);
    fillRect(pix, cx - 3, mouthY - 2, 7, 2, COL.skin);
  } else if (pose.expr === "happy") {
    stroke(pix, cx - 3, mouthY - 1, cx, mouthY + 1, 0.7, COL.mouth);
    stroke(pix, cx, mouthY + 1, cx + 3, mouthY - 1, 0.7, COL.mouth);
  } else if (pose.expr === "angry" || pose.expr === "sad") {
    stroke(pix, cx - 3, mouthY + 1, cx, mouthY - 1, 0.7, COL.mouth);
    stroke(pix, cx, mouthY - 1, cx + 3, mouthY + 1, 0.7, COL.mouth);
  } else {
    fillRect(pix, cx - 2, mouthY, 5, 1, COL.mouth);
  }
  const blush = pose.expr === "joy" || pose.expr === "happy" ? 3.4 : 2.4;
  fillEllipse(pix, cx - 16, cy + 10, blush, 2.1, COL.blush);
  fillEllipse(pix, cx + 16, cy + 10, blush, 2.1, COL.blush);
}

function ribbon(pix, kind, pose) {
  const color = COL.bow;
  const deep = COL.bowDeep;
  const hi = COL.bowHi;
  const x = OX + 24 + pose.ribbon * 2;
  const y = 52;
  fillEllipse(pix, x - 5, y, 7, 5, color);
  fillEllipse(pix, x + 6, y + 1, 6, 4.5, color);
  fillEllipse(pix, x, y + 1, 2.4, 2.4, deep);
  plot(pix, x - 6, y - 2, hi);
  const tail = pose.ribbon * 12;
  stroke(pix, x - 1, y + 3, x - 4 + tail, y + 24, 1.6, color);
  stroke(pix, x + 2, y + 3, x + 8 + tail, y + 28, 1.5, deep);
  if (kind === "dark") {
    stroke(pix, x + 8 + tail, y + 28, x + 16 + tail * 0.6, y + 40, 1.3, deep);
  }
}

function arms(pix, kind, pose) {
  const sleeve = kind === "dark" ? COL.dress : COL.shirt;
  const shade = kind === "dark" ? COL.dressMid : COL.shirtShade;
  const y0 = 108;
  const left = OX - 18;
  const right = OX + 18;
  const mode = pose.arm;
  const ends = {
    hold: [[OX - 16, 142], [OX + 16, 142]],
    offer: [[OX - 14, 150], [OX + 14, 150]],
    up: [[OX - 28, 78], [OX + 28, 74]],
    out: [[OX - 40, 116], [OX + 40, 112]],
    down: [[OX - 14, 150], [OX + 14, 152]],
    chest: [[OX - 8, 124], [OX + 6, 118]],
  }[mode] ?? [[OX - 16, 142], [OX + 16, 142]];
  stroke(pix, left, y0, ends[0][0], ends[0][1], 4.2, shade);
  stroke(pix, left, y0, ends[0][0], ends[0][1], 3.1, sleeve);
  stroke(pix, right, y0, ends[1][0], ends[1][1], 4.2, shade);
  stroke(pix, right, y0, ends[1][0], ends[1][1], 3.1, sleeve);
  fillEllipse(pix, ends[0][0], ends[0][1], 4.2, 3.6, COL.skin);
  fillEllipse(pix, ends[1][0], ends[1][1], 4.2, 3.6, COL.skinShade);
  if (kind === "dark" && mode === "chest") {
    stroke(pix, ends[1][0] - 4, ends[1][1], ends[1][0] + 5, ends[1][1] + 1, 0.9, COL.line);
  }
}

function appleAt(pix, x, y, big) {
  const rx = big ? 9 : 7.4;
  const ry = big ? 8 : 6.6;
  fillEllipse(pix, x, y, rx + 0.6, ry + 0.4, COL.appleDark);
  fillEllipse(pix, x - 0.4, y - 0.5, rx, ry, COL.apple);
  fillEllipse(pix, x - 2.6, y - 2.2, 2.3, 1.6, COL.appleHi);
  fillRect(pix, x - 0.5, y - ry - 3, 1.6, 4, COL.stem);
  fillEllipse(pix, x + 3.2, y - ry - 1, 3.4, 1.8, COL.leaf);
}

function drawBody(pix, kind, pose) {
  const hair = kind === "dark"
    ? { hi: COL.whiteHair, mid: COL.whiteMid, dark: COL.whiteDark }
    : { hi: COL.hairHi, mid: COL.hair, dark: COL.hairMid };
  const lock = pose.hair * 7;
  const skirt = pose.skirt * 8;

  withGroup(pix, "hair", () => {
    fillEllipse(pix, OX, 66, 34, 32, hair.dark);
    fillEllipse(pix, OX - 2, 62, 30, 28, hair.mid);
    fillEllipse(pix, OX - 8, 54, 14, 10, hair.hi);
    fillPoly(pix, [[OX - 28, 74], [OX - 16, 70], [OX - 22 + lock, kind === "dark" ? 168 : 132], [OX - 34 + lock, kind === "dark" ? 160 : 124]], hair.mid);
    fillPoly(pix, [[OX + 16, 70], [OX + 30, 76], [OX + 36 + lock, kind === "dark" ? 164 : 128], [OX + 18 + lock, kind === "dark" ? 170 : 136]], hair.dark);
    if (kind === "dark") {
      fillPoly(pix, [[OX - 8, 80], [OX + 6, 78], [OX + 2 + lock * 0.4, 176], [OX - 12 + lock * 0.3, 170]], hair.mid);
    }
  });

  withGroup(pix, "legs", () => {
    if (kind === "dark") {
      fillRect(pix, OX - 12, 150, 9, 28, COL.dress);
      fillRect(pix, OX + 3, 150, 9, 28, COL.dressMid);
      fillEllipse(pix, OX - 8, 180, 8, 4.5, COL.boot);
      fillEllipse(pix, OX + 8, 180, 8, 4.5, COL.boot);
      fillRect(pix, OX - 14, 176, 12, 2, COL.line);
      fillRect(pix, OX + 2, 176, 12, 2, COL.line);
    } else {
      fillRect(pix, OX - 11, 156, 8, 16, COL.skinShade);
      fillRect(pix, OX + 3, 156, 8, 16, COL.skin);
      fillRect(pix, OX - 12, 168, 9, 6, COL.sock);
      fillRect(pix, OX + 3, 168, 9, 6, COL.sock);
      fillEllipse(pix, OX - 8, 180, 8, 4.6, COL.shoe);
      fillEllipse(pix, OX + 8, 180, 8, 4.6, COL.shoeDark);
    }
  });

  withGroup(pix, "skirt", () => {
    if (kind === "dark") {
      fillPoly(pix, [
        [OX - 16, 124],
        [OX + 16, 124],
        [OX + 28 + skirt, 172],
        [OX - 28 + skirt, 172],
      ], COL.dress);
      fillPoly(pix, [
        [OX - 14, 128],
        [OX + 14, 128],
        [OX + 22 + skirt, 168],
        [OX - 22 + skirt, 168],
      ], COL.dressMid);
      for (const x of [OX - 10, OX - 2, OX + 6, OX + 14]) {
        stroke(pix, x, 128, x + skirt * 0.35, 168, 0.7, COL.line);
      }
      stroke(pix, OX - 26 + skirt, 170, OX + 26 + skirt, 170, 1.1, COL.line);
    } else {
      fillPoly(pix, [
        [OX - 16, 128],
        [OX + 16, 128],
        [OX + 26 + skirt, 162],
        [OX - 26 + skirt, 162],
      ], COL.skirt);
      fillPoly(pix, [
        [OX - 12, 132],
        [OX + 12, 132],
        [OX + 18 + skirt, 158],
        [OX - 18 + skirt, 158],
      ], COL.skirtDark);
    }
  });

  withGroup(pix, "arms", () => arms(pix, kind, pose));

  withGroup(pix, "torso", () => {
    if (kind === "dark") {
      fillRect(pix, OX - 14, 96, 28, 36, COL.dress);
      fillRect(pix, OX - 12, 98, 24, 30, COL.dressMid);
      stroke(pix, OX, 98, OX, 132, 0.8, COL.line);
      stroke(pix, OX - 8, 100, OX - 10, 132, 0.7, COL.line);
      stroke(pix, OX + 8, 100, OX + 10, 132, 0.7, COL.line);
      fillEllipse(pix, OX, 98, 8, 5, COL.dress);
    } else {
      fillRect(pix, OX - 18, 94, 36, 28, COL.shirt);
      fillPoly(pix, [
        [OX - 15, 108],
        [OX + 15, 108],
        [OX + 20, 150],
        [OX - 20, 150],
      ], COL.vest);
      fillPoly(pix, [
        [OX - 6, 108],
        [OX + 6, 108],
        [OX + 4, 146],
        [OX - 4, 146],
      ], COL.shirt);
      for (const y of [122, 132, 142]) fillEllipse(pix, OX - 9, y, 1.3, 1.3, COL.vestDeep);
      fillPoly(pix, [[OX - 7, 96], [OX + 7, 96], [OX, 108]], COL.shirt);
    }
  });

  withGroup(pix, "bow", () => {
    if (kind === "normal") {
      fillEllipse(pix, OX - 6, 100, 6, 4, COL.bow);
      fillEllipse(pix, OX + 6, 100, 6, 4, COL.bow);
      fillEllipse(pix, OX, 101, 2.2, 2.2, COL.bowDeep);
      stroke(pix, OX - 2, 103, OX - 5, 114, 1.3, COL.bow);
      stroke(pix, OX + 2, 103, OX + 5, 114, 1.3, COL.bowDeep);
      plot(pix, OX - 7, 98, COL.bowHi);
    }
  });

  if (kind === "normal" && pose.arm !== "out") {
    const raised = pose.arm === "up";
    const offered = pose.arm === "offer";
    const ax = raised ? OX + 22 : OX;
    const ay = (raised ? 86 : offered ? 142 : 136) + (pose.apple ?? 0);
    withGroup(pix, "hands", () => {
      if (!raised) {
        fillEllipse(pix, ax - 9, ay + 2, 4.2, 3.3, COL.skin);
        fillEllipse(pix, ax + 9, ay + 2, 4.2, 3.3, COL.skinShade);
      }
    });
    withGroup(pix, "apple", () => appleAt(pix, ax, ay, offered || raised));
  }

  withGroup(pix, "face", () => {
    fillEllipse(pix, OX, 70, 22, 20, COL.skinShade);
    fillEllipse(pix, OX - 1, 68, 20, 18, COL.skin);
  });
  withGroup(pix, "hair", () => {
    fillEllipse(pix, OX, 52, 24, 14, hair.mid);
    fillEllipse(pix, OX - 6, 48, 10, 6, hair.hi);
    fillPoly(pix, [[OX - 16, 54], [OX - 8, 50], [OX - 12, 64], [OX - 18, 62]], hair.dark);
    fillPoly(pix, [[OX - 2, 50], [OX + 6, 48], [OX + 2, 62], [OX - 6, 60]], hair.mid);
    fillPoly(pix, [[OX + 8, 50], [OX + 16, 54], [OX + 18, 64], [OX + 8, 60]], hair.dark);
  });
  withGroup(pix, "face", () => face(pix, kind, pose));
  withGroup(pix, "ribbon", () => ribbon(pix, kind, pose));
}

function shadow(pix, x, y, rx, alpha) {
  fillEllipse(pix, x, y, Math.max(4, rx), 3.2, [40, 16, 24, alpha]);
}

function renderSingle(kind, pose) {
  const body = createPix();
  drawBody(body, kind, { ...pose, arm: kind === "dark" && pose.arm === "hold" ? "chest" : pose.arm });
  outline(body);
  const frame = createPix();
  const lift = Math.max(0, -pose.dy);
  shadow(frame, OX, 192, 16 * pose.sx * (1 - lift / 90), Math.max(16, Math.round(78 * (1 - lift / 70))));
  blitCharacter(body, frame, { x: OX, feetY: FEET, scale: 1 }, pose);
  frame.bounds = body.bounds;
  return frame;
}

function renderDuo(darkPose, normalPose) {
  const darkBody = createPix();
  const normalBody = createPix();
  drawBody(darkBody, "dark", { ...darkPose, arm: darkPose.arm === "hold" ? "chest" : darkPose.arm });
  drawBody(normalBody, "normal", normalPose);
  outline(darkBody);
  outline(normalBody);
  const frame = createPix();
  const ribbonShift = (darkPose.ribbon + normalPose.ribbon) * 8;
  ribbonSway(frame, 10, 168, 34 + ribbonShift, 146, 58, 178, 3.1, COL.ribbonDark);
  ribbonSway(frame, 6, 184, 28 + ribbonShift * 0.6, 160, 48, 190, 2.4, [90, 16, 28, 210]);
  const darkAnchor = { x: 44, feetY: 190, scale: 0.86 };
  const normalAnchor = { x: 80, feetY: 192, scale: 0.82 };
  const lift = Math.max(0, -darkPose.dy, -normalPose.dy);
  shadow(frame, darkAnchor.x, 194, 14 * (1 - lift / 100), Math.max(14, 64 - lift));
  shadow(frame, normalAnchor.x, 194, 12 * (1 - lift / 100), Math.max(14, 64 - lift));
  blitCharacter(darkBody, frame, darkAnchor, darkPose);
  blitCharacter(normalBody, frame, normalAnchor, normalPose);
  const cheek = project(normalAnchor, normalPose, OX - 16, 84);
  const shoulder = project(darkAnchor, darkPose, OX + 16, 108);
  stroke(frame, shoulder.x, shoulder.y, cheek.x, cheek.y, 3.4, COL.dress);
  stroke(frame, shoulder.x, shoulder.y, cheek.x, cheek.y, 2.2, COL.dressMid);
  fillEllipse(frame, cheek.x, cheek.y, 4.2, 3.4, COL.skin);
  const applePt = project(normalAnchor, normalPose, OX + (normalPose.arm === "up" ? 22 : 0), normalPose.arm === "up" ? 86 : normalPose.arm === "offer" ? 142 : 136);
  fillEllipse(frame, applePt.x - 6, applePt.y - 2, 2.2, 1.8, COL.skinShade);
  ribbonSway(frame, 70, 186, 96 + ribbonShift * 0.4, 168, 116, 188, 2.2, COL.line);
  return frame;
}

function ribbonSway(pix, x0, y0, x1, y1, x2, y2, radius, color) {
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
    const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
    fillEllipse(pix, x, y, radius, radius * 0.72, color);
  }
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
  pose({ dy: -8, sy: 1.03, sx: 0.98, lean: 3, ribbon: 0.5, skirt: 0.4, hair: 0.45 }),
  pose({ dy: -14, sy: 1.05, sx: 0.96, blink: true, ribbon: 1, skirt: 0.8, hair: 0.9 }),
  pose({ dy: -6, sy: 1.02, sx: 0.99, lean: -2, ribbon: 0.2, skirt: 0.15, hair: 0.1 }),
  pose({ lean: -2, ribbon: -0.4, skirt: -0.5, hair: -0.45 }),
  pose({ dy: 6, sy: 0.82, sx: 1.16, ribbon: -0.9, skirt: -1, hair: -0.8 }),
  pose({ dy: 2, sy: 0.94, sx: 1.06, blink: true, ribbon: -0.2, skirt: -0.15, hair: -0.1 }),
  pose({ dy: -5, sy: 1.02, sx: 0.98, ribbon: 0.3, skirt: 0.25, hair: 0.3 }),
];

const JOY = [
  pose({ dy: 6, sy: 0.74, sx: 1.24, expr: "joy", arm: "down", ribbon: -0.2, skirt: -0.2 }),
  pose({ dy: -12, sy: 1.06, sx: 0.94, expr: "joy", arm: "up", ribbon: 0.6, skirt: 0.5, hair: 0.6 }),
  pose({ dy: -22, sy: 1.04, sx: 0.95, expr: "joy", arm: "up", ribbon: 1, skirt: 1, hair: 1 }),
  pose({ dy: -20, sy: 1.03, sx: 0.96, expr: "joy", blink: true, arm: "up", ribbon: 0.8, skirt: 0.7, hair: 0.8 }),
  pose({ dy: -8, sy: 1.02, sx: 0.98, expr: "joy", arm: "up", ribbon: 0.3, skirt: 0.2, hair: 0.2 }),
  pose({ dy: 8, sy: 0.7, sx: 1.28, expr: "joy", arm: "out", ribbon: -0.4, skirt: -0.6, hair: -0.3 }),
  pose({ dy: -10, sy: 1.05, sx: 0.96, expr: "joy", arm: "up", ribbon: 0.7, skirt: 0.4, hair: 0.5 }),
  pose({ dy: -2, sy: 1.02, sx: 0.99, expr: "happy", arm: "up", ribbon: 0.2, skirt: 0.1, hair: 0.15 }),
];

const ANGRY = [
  pose({ dy: 2, sy: 0.96, sx: 1.04, lean: -16, expr: "angry", arm: "out", ribbon: -1, skirt: -0.9, hair: -1 }),
  pose({ lean: 18, expr: "angry", arm: "out", ribbon: 1, skirt: 1, hair: 1 }),
  pose({ dy: 5, sy: 0.86, sx: 1.12, lean: -18, expr: "angry", arm: "out", ribbon: -0.8, skirt: -1, hair: -0.8 }),
  pose({ dy: -4, sy: 1.03, sx: 0.98, lean: 16, expr: "angry", blink: true, arm: "out", ribbon: 0.7, skirt: 0.5, hair: 0.7 }),
  pose({ lean: -12, expr: "angry", arm: "out", ribbon: -0.4, skirt: -0.3, hair: -0.4 }),
  pose({ lean: 14, expr: "angry", arm: "out", ribbon: 0.5, skirt: 0.4, hair: 0.5 }),
  pose({ dy: 3, sy: 0.9, sx: 1.08, lean: -8, expr: "angry", arm: "out", ribbon: -0.2, skirt: -0.2, hair: -0.15 }),
  pose({ lean: 5, expr: "angry", arm: "out", ribbon: 0.15, hair: 0.1 }),
];

const SAD = [
  pose({ dy: 2, sy: 0.98, expr: "sad", arm: "down", ribbon: -0.1 }),
  pose({ dy: 6, sy: 0.92, sx: 1.04, lean: -3, expr: "sad", arm: "down", ribbon: -0.3, skirt: -0.2, hair: -0.25 }),
  pose({ dy: 10, sy: 0.84, sx: 1.08, lean: 2, expr: "sad", blink: true, arm: "down", ribbon: 0.15, skirt: 0.25, hair: 0.2 }),
  pose({ dy: 12, sy: 0.8, sx: 1.1, lean: -4, expr: "sad", arm: "down", ribbon: -0.45, skirt: -0.4, hair: -0.4 }),
  pose({ dy: 11, sy: 0.82, sx: 1.08, lean: 4, expr: "sad", arm: "down", ribbon: 0.4, skirt: 0.45, hair: 0.35 }),
  pose({ dy: 13, sy: 0.78, sx: 1.12, lean: -2, expr: "sad", blink: true, arm: "down", ribbon: -0.2, skirt: -0.15, hair: -0.1 }),
  pose({ dy: 10, sy: 0.84, sx: 1.06, expr: "sad", arm: "down", ribbon: 0.1, skirt: 0.1, hair: 0.1 }),
  pose({ dy: 8, sy: 0.86, sx: 1.05, lean: 1, expr: "sad", arm: "down", ribbon: -0.05, hair: -0.05 }),
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
