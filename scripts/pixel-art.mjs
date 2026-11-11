/**
 * 像素Q — original high-detail pixel chibi.
 * Style target: jagged moe pixel art (strand hair, dark-lid sparkle eyes,
 * layered clothes, glossy apple). Not a trace of any reference file.
 *
 * Run: node scripts/pixel-art.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "packs", "pixel-q", "animations");

const BW = 200;
const BH = 320;
const OX = 100;
const FEET = 300;
const SPAN = 250;

const COL = {
  skin: [247, 214, 200, 255],
  skinHi: [255, 236, 228, 255],
  skinShade: [228, 176, 162, 255],
  blush: [244, 150, 164, 255],
  line: [42, 28, 40, 255],
  hairHi: [236, 226, 248, 255],
  hair: [176, 146, 206, 255],
  hairMid: [138, 106, 174, 255],
  hairDark: [96, 70, 132, 255],
  hairEdge: [62, 44, 92, 255],
  white: [252, 250, 255, 255],
  whiteMid: [214, 210, 224, 255],
  whiteDark: [168, 164, 180, 255],
  whiteEdge: [108, 102, 122, 255],
  shirt: [255, 250, 246, 255],
  shirtShade: [214, 208, 220, 255],
  vest: [214, 170, 122, 255],
  vestHi: [236, 200, 156, 255],
  vestDark: [168, 122, 82, 255],
  vestDeep: [120, 82, 54, 255],
  skirt: [138, 96, 68, 255],
  skirtHi: [168, 122, 86, 255],
  skirtDark: [96, 64, 46, 255],
  bow: [196, 28, 42, 255],
  bowDeep: [122, 12, 28, 255],
  bowHi: [255, 120, 128, 255],
  apple: [226, 36, 48, 255],
  appleHi: [255, 246, 240, 255],
  appleMid: [255, 96, 96, 255],
  appleDark: [140, 12, 28, 255],
  leaf: [56, 150, 72, 255],
  stem: [110, 70, 42, 255],
  sock: [255, 248, 244, 255],
  shoe: [92, 58, 44, 255],
  shoeDark: [58, 34, 28, 255],
  dress: [28, 16, 24, 255],
  dressMid: [48, 26, 36, 255],
  dressHi: [72, 40, 52, 255],
  red: [186, 28, 42, 255],
  redDeep: [110, 10, 24, 255],
  redHi: [240, 80, 90, 255],
  lid: [28, 16, 32, 255],
  iris: [150, 96, 196, 255],
  irisHi: [214, 176, 236, 255],
  irisDeep: [84, 40, 130, 255],
  redIris: [230, 40, 56, 255],
  redIrisHi: [255, 160, 168, 255],
  redIrisDeep: [120, 12, 28, 255],
  pupil: [20, 8, 16, 255],
  eyeWhite: [255, 255, 255, 255],
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
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function createPix(w, h) {
  return { w, h, rgba: Buffer.alloc(w * h * 4) };
}
function plot(pix, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (!color || px < 0 || py < 0 || px >= pix.w || py >= pix.h) return;
  const i = (py * pix.w + px) * 4;
  pix.rgba[i] = color[0];
  pix.rgba[i + 1] = color[1];
  pix.rgba[i + 2] = color[2];
  pix.rgba[i + 3] = color[3];
}
function fillRect(pix, x, y, w, h, color) {
  for (let yy = Math.floor(y); yy < y + h; yy++) {
    for (let xx = Math.floor(x); xx < x + w; xx++) plot(pix, xx, yy, color);
  }
}
function fillEllipse(pix, cx, cy, rx, ry, color) {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) plot(pix, x, y, color);
    }
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
function thickLine(pix, x0, y0, x1, y1, radius, color) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (radius <= 1.15) plot(pix, x, y, color);
    else fillEllipse(pix, x, y, radius, radius * 0.85, color);
  }
}
function stamp(pix, x, y, rows, map, scale = 1) {
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let col = 0; col < line.length; col++) {
      const color = map[line[col]];
      if (!color) continue;
      for (let yy = 0; yy < scale; yy++) {
        for (let xx = 0; xx < scale; xx++) plot(pix, x + col * scale + xx, y + row * scale + yy, color);
      }
    }
  }
}
function outline(pix) {
  const src = Buffer.from(pix.rgba);
  const ink = COL.line;
  for (let y = 1; y < pix.h - 1; y++) {
    for (let x = 1; x < pix.w - 1; x++) {
      const i = (y * pix.w + x) * 4;
      if (src[i + 3] > 20) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (src[((y + dy) * pix.w + (x + dx)) * 4 + 3] > 200) edge = true;
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
function blit(src, dest, anchor, pose) {
  const scale = anchor.scale;
  const pad = 16 + Math.abs(pose.lean) + Math.abs(pose.dy);
  const minX = Math.floor(anchor.x - 120 * scale - pad);
  const maxX = Math.ceil(anchor.x + 120 * scale + pad);
  const minY = Math.floor(anchor.feetY - (FEET + 20) * scale - pad);
  const maxY = Math.ceil(anchor.feetY + 16);
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

function hairColors(kind) {
  return kind === "dark"
    ? { hi: COL.white, mid: COL.whiteMid, dark: COL.whiteDark, edge: COL.whiteEdge }
    : { hi: COL.hairHi, mid: COL.hair, dark: COL.hairMid, edge: COL.hairEdge };
}

function clump(pix, x0, y0, x1, y1, half0, half1, fill, edge, hi) {
  fillPoly(pix, [
    [x0 - half0 - 1, y0],
    [x0 + half0 + 1, y0],
    [x1 + half1 + 1, y1],
    [x1 - half1 - 1, y1],
  ], edge);
  fillPoly(pix, [
    [x0 - half0, y0],
    [x0 + half0, y0],
    [x1 + half1, y1],
    [x1 - half1, y1],
  ], fill);
  thickLine(pix, x0 - half0 + 1, y0 + 1, x1 - half1, y1 - 1, 1.05, hi);
}

function fly(pix, x0, y0, x1, y1, x2, y2, color) {
  thickLine(pix, x0, y0, x1, y1, 1.15, color);
  thickLine(pix, x1, y1, x2, y2, 1.05, color);
}

function bowCluster(pix, x, y, sway, scale = 1) {
  const s = scale;
  fillPoly(pix, [[x, y], [x - 14 * s, y - 6 * s], [x - 16 * s, y + 4 * s], [x - 4 * s, y + 3 * s]], COL.bowDeep);
  fillPoly(pix, [[x, y], [x - 12 * s, y - 8 * s], [x - 10 * s, y + 1 * s], [x - 2 * s, y + 1 * s]], COL.bow);
  fillPoly(pix, [[x, y], [x + 13 * s, y - 4 * s], [x + 15 * s, y + 6 * s], [x + 3 * s, y + 2 * s]], COL.bowDeep);
  fillPoly(pix, [[x + 1 * s, y - 1 * s], [x + 12 * s, y - 6 * s], [x + 11 * s, y + 2 * s], [x + 2 * s, y + 1 * s]], COL.bow);
  fillEllipse(pix, x, y + 1, 3.2 * s, 3 * s, COL.bowDeep);
  plot(pix, x - 10 * s, y - 5 * s, COL.bowHi);
  plot(pix, x - 9 * s, y - 4 * s, COL.bowHi);
  plot(pix, x + 8 * s, y - 3 * s, COL.bowHi);
  thickLine(pix, x - 1, y + 3 * s, x - 6 + sway, y + 22 * s, 1.7 * s, COL.bow);
  thickLine(pix, x - 2, y + 4 * s, x - 8 + sway, y + 22 * s, 1.05, COL.bowHi);
  thickLine(pix, x + 2, y + 3 * s, x + 8 + sway * 0.7, y + 28 * s, 1.5 * s, COL.bowDeep);
  thickLine(pix, x + 8 + sway * 0.7, y + 28 * s, x + 14 + sway * 0.3, y + 40 * s, 1.2, COL.bow);
}

function drawEye(pix, x, y, kind, pose) {
  const darkLid = kind === "dark" ? [48, 16, 28, 255] : [58, 36, 78, 255];
  const iris = kind === "dark" ? COL.redIris : COL.iris;
  const irisDeep = kind === "dark" ? COL.redIrisDeep : COL.irisDeep;
  if (pose.blink) {
    thickLine(pix, x - 10, y + 2, x, y - 2, 1.8, darkLid);
    thickLine(pix, x, y - 2, x + 11, y + 2, 1.8, irisDeep);
    return;
  }
  const rows = [
    ".....######........",
    "...###ddddd###.....",
    "..##ddddddddd##....",
    ".#ddddddddddddd#...",
    ".#dddddWWWddddd#...",
    "..##rrrrrrrrr##....",
    "...#rrWWWWWrr#.....",
    "...#rrrrrrrrr#.....",
    "....#########......",
  ];
  stamp(pix, x - 18, y - 12, rows, {
    "#": COL.line,
    d: darkLid,
    W: COL.eyeWhite,
    r: iris,
  }, 2);
  plot(pix, x - 2, y + 2, kind === "dark" ? COL.redIrisHi : COL.irisHi);
  plot(pix, x + 4, y + 3, COL.eyeWhite);
  plot(pix, x + 5, y + 3, COL.eyeWhite);
  if (pose.expr === "angry") thickLine(pix, x - 11, y - 12, x + 8, y - 8, 1.3, COL.line);
  if (pose.expr === "sad") {
    thickLine(pix, x - 10, y - 8, x + 8, y - 12, 1.15, COL.line);
    plot(pix, x - 12, y + 8, [140, 190, 230, 255]);
    plot(pix, x - 12, y + 9, [180, 214, 236, 255]);
  }
}

function drawFace(pix, kind, pose) {
  fillPoly(pix, [
    [OX - 40, 86],
    [OX + 36, 82],
    [OX + 46, 108],
    [OX + 40, 136],
    [OX + 16, 154],
    [OX - 12, 156],
    [OX - 38, 140],
    [OX - 48, 112],
  ], COL.skinShade);
  fillPoly(pix, [
    [OX - 36, 88],
    [OX + 32, 86],
    [OX + 40, 112],
    [OX + 32, 138],
    [OX + 8, 150],
    [OX - 14, 150],
    [OX - 36, 134],
    [OX - 42, 110],
  ], COL.skin);
  fillPoly(pix, [
    [OX - 28, 92],
    [OX + 6, 90],
    [OX + 4, 112],
    [OX - 24, 114],
  ], COL.skinHi);
  drawEye(pix, OX - 30, 118, kind, pose);
  drawEye(pix, OX + 16, 118, kind, pose);
  plot(pix, OX - 2, 136, COL.skinShade);
  const my = 144;
  if (pose.expr === "joy") {
    thickLine(pix, OX - 6, my, OX, my + 3, 1.2, [176, 84, 96, 255]);
    thickLine(pix, OX, my + 3, OX + 6, my, 1.2, [176, 84, 96, 255]);
  } else if (pose.expr === "happy") {
    thickLine(pix, OX - 5, my, OX, my + 2, 1.15, [186, 96, 108, 255]);
    thickLine(pix, OX, my + 2, OX + 5, my, 1.15, [186, 96, 108, 255]);
  } else if (pose.expr === "angry" || pose.expr === "sad") {
    thickLine(pix, OX - 4, my + 2, OX + 4, my + 2, 1.1, [170, 90, 102, 255]);
  } else {
    thickLine(pix, OX - 3, my + 1, OX + 3, my + 1, 1.05, [186, 110, 118, 255]);
  }
  for (const sx of [-34, 18]) {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x + y) % 2 === 0) plot(pix, OX + sx + x, 128 + y, COL.blush);
      }
    }
  }
}

function spike(pix, x0, y0, x1, y1, fill, edge) {
  fillPoly(pix, [
    [x0 - 5, y0],
    [x0 + 4, y0 - 2],
    [x1, y1],
    [x0 - 2, y0 + 4],
  ], edge);
  fillPoly(pix, [
    [x0 - 3, y0 + 1],
    [x0 + 2, y0],
    [x1, y1],
  ], fill);
}

function drawHair(pix, kind, pose) {
  const c = hairColors(kind);
  const sway = pose.hair * 6;
  const long = kind === "dark";
  fillEllipse(pix, OX - 4, 96, 50, 42, c.edge);
  fillEllipse(pix, OX - 2, 92, 44, 36, c.dark);
  fillEllipse(pix, OX - 14, 82, 26, 18, c.mid);
  fillEllipse(pix, OX - 22, 74, 14, 10, c.hi);
  fillEllipse(pix, OX - 38, 118, 14, long ? 48 : 28, c.mid);
  fillEllipse(pix, OX + 40, 120, 14, long ? 52 : 32, c.dark);
  if (long) {
    fillEllipse(pix, OX - 8, 160, 12, 46, c.dark);
    fillEllipse(pix, OX + 10, 170, 10, 40, c.mid);
    fillEllipse(pix, OX - 24, 150, 8, 36, c.edge);
  }
  const tips = long
    ? [[-46, 70, -64 + sway, 130], [-24, 58, -30, 86], [0, 52, 6, 74], [26, 58, 36 + sway, 96], [48, 74, 66 + sway, 140], [-54, 120, -72 + sway, 210], [52, 124, 74 + sway, 220], [-16, 150, -22 + sway, 240], [18, 156, 24 + sway, 236]]
    : [[-44, 72, -58 + sway, 118], [-22, 58, -26, 84], [2, 52, 8, 72], [24, 60, 34 + sway, 98], [46, 78, 62 + sway, 132], [-40, 120, -52 + sway, 168], [42, 124, 56 + sway, 172]];
  for (const [x0, y0, x1, y1] of tips) spike(pix, OX + x0, y0, OX + x1, y1, c.mid, c.edge);
  thickLine(pix, OX - 30, 78, OX - 8, 70, 1.4, c.hi);
  thickLine(pix, OX - 18, 68, OX + 4, 64, 1.2, c.hi);
}

function drawNeckBow(pix) {
  fillPoly(pix, [[OX, 156], [OX - 12, 150], [OX - 14, 160], [OX - 2, 160]], COL.bow);
  fillPoly(pix, [[OX, 156], [OX + 12, 150], [OX + 14, 162], [OX + 2, 160]], COL.bowDeep);
  fillEllipse(pix, OX, 157, 2.4, 2.4, COL.bowDeep);
  thickLine(pix, OX - 1, 160, OX - 6, 176, 1.35, COL.bow);
  thickLine(pix, OX + 1, 160, OX + 6, 178, 1.25, COL.bowDeep);
  plot(pix, OX - 9, 151, COL.bowHi);
}

function drawApple(pix, x, y, big) {
  const rx = big ? 16 : 13;
  const ry = big ? 15 : 12;
  fillEllipse(pix, x + 1, y + 2, rx + 1, ry, COL.appleDark);
  fillEllipse(pix, x, y, rx, ry, COL.apple);
  fillEllipse(pix, x - 1, y - 1, rx - 3, ry - 4, COL.appleMid);
  fillEllipse(pix, x - 5, y - 5, 5, 3.4, COL.appleHi);
  plot(pix, x - 6, y - 6, COL.appleHi);
  plot(pix, x - 4, y - 7, COL.appleHi);
  fillEllipse(pix, x + 5, y + 4, 3, 2, COL.appleDark);
  fillRect(pix, x - 0.5, y - ry - 3, 2, 5, COL.stem);
  fillPoly(pix, [[x + 2, y - ry - 1], [x + 10, y - ry - 4], [x + 12, y - ry + 1], [x + 4, y - ry + 2]], COL.leaf);
}

function hand(pix, x, y, flip) {
  const s = flip ? -1 : 1;
  fillEllipse(pix, x, y, 6, 4.5, COL.skinShade);
  fillEllipse(pix, x - s, y - 1, 5, 3.6, COL.skin);
  plot(pix, x - 3 * s, y - 3, COL.skinHi);
  plot(pix, x, y - 4, COL.skin);
  plot(pix, x + 3 * s, y - 3, COL.skinShade);
  plot(pix, x - 3 * s, y - 4, COL.line);
}

function sleeve(pix, x, y, color, shade, flip) {
  const s = flip ? -1 : 1;
  fillPoly(pix, [
    [x, y],
    [x + 16 * s, y - 2],
    [x + 22 * s, y + 12],
    [x + 14 * s, y + 24],
    [x + 2 * s, y + 18],
  ], shade);
  fillPoly(pix, [
    [x + 1 * s, y + 1],
    [x + 13 * s, y],
    [x + 16 * s, y + 12],
    [x + 6 * s, y + 16],
  ], color);
  thickLine(pix, x + 4 * s, y + 14, x + 14 * s, y + 20, 1.2, shade);
}

function armTo(pix, x0, y0, x1, y1, sleeveCol, shade) {
  const mx = (x0 + x1) / 2 + (x1 > x0 ? 6 : -6);
  const my = (y0 + y1) / 2 - 8;
  thickLine(pix, x0, y0, mx, my, 5.2, shade);
  thickLine(pix, x0, y0, mx, my, 3.6, sleeveCol);
  thickLine(pix, mx, my, x1, y1, 4.4, shade);
  thickLine(pix, mx, my, x1, y1, 3, sleeveCol);
}

function drawBody(pix, kind, pose, withApple) {
  const sway = pose.skirt * 10;
  const shoulderY = 178;
  if (kind === "dark") {
    fillPoly(pix, [
      [OX - 16, 164],
      [OX + 16, 164],
      [OX + 18, 196],
      [OX + 12, 228],
      [OX - 12, 228],
      [OX - 18, 196],
    ], COL.dress);
    fillPoly(pix, [
      [OX + 1, 168],
      [OX + 14, 170],
      [OX + 10, 224],
      [OX + 1, 224],
    ], COL.dressMid);
    thickLine(pix, OX, 170, OX, 226, 1.15, COL.red);
    thickLine(pix, OX - 8, 176, OX - 10, 222, 1.05, COL.redDeep);
    thickLine(pix, OX + 8, 176, OX + 10, 222, 1.05, COL.red);
    sleeve(pix, OX - 18, shoulderY, COL.dressMid, COL.dress, true);
    sleeve(pix, OX + 18, shoulderY, COL.dress, COL.dressMid, false);
    fillPoly(pix, [
      [OX - 24, 214],
      [OX + 22, 214],
      [OX + 40 + sway, 286],
      [OX + 18 + sway, 292],
      [OX - 36 + sway, 286],
    ], COL.dress);
    for (let i = 0; i < 6; i++) {
      const x = OX - 28 + i * 10 + sway * 0.3;
      thickLine(pix, x, 220, x + sway * 0.4, 284, 1.05, i % 2 ? COL.redDeep : COL.red);
    }
    thickLine(pix, OX - 34 + sway, 284, OX + 36 + sway, 284, 1.6, COL.red);
    fillPoly(pix, [
      [OX - 30 + sway, 250],
      [OX - 10 + sway, 240],
      [OX - 16 + sway, 286],
      [OX - 36 + sway, 280],
    ], COL.redDeep);
    const ends = armEnds(pose, kind);
    armTo(pix, OX - 20, 190, ends.l[0], ends.l[1], COL.dressMid, COL.dress);
    armTo(pix, OX + 20, 190, ends.r[0], ends.r[1], COL.dress, COL.dressMid);
    fillEllipse(pix, OX - 12, 300, 12, 6, COL.dress);
    fillEllipse(pix, OX + 12, 300, 12, 6, COL.dressMid);
    thickLine(pix, OX - 20, 296, OX - 4, 296, 1.2, COL.red);
    thickLine(pix, OX + 4, 296, OX + 20, 296, 1.2, COL.red);
  } else {
    fillPoly(pix, [
      [OX - 18, 160],
      [OX + 18, 160],
      [OX + 16, 188],
      [OX - 16, 188],
    ], COL.shirt);
    sleeve(pix, OX - 16, shoulderY - 4, COL.shirt, COL.shirtShade, true);
    sleeve(pix, OX + 16, shoulderY - 4, COL.shirt, COL.shirtShade, false);
    fillPoly(pix, [
      [OX - 20, 172],
      [OX + 18, 170],
      [OX + 22, 196],
      [OX + 14, 230],
      [OX + 20, 242],
      [OX - 18, 242],
      [OX - 14, 228],
      [OX - 24, 194],
    ], COL.vest);
    fillPoly(pix, [
      [OX + 2, 176],
      [OX + 16, 176],
      [OX + 12, 228],
      [OX + 16, 238],
      [OX + 2, 238],
    ], COL.vestDark);
    fillPoly(pix, [
      [OX - 16, 174],
      [OX - 2, 174],
      [OX - 4, 196],
      [OX - 18, 192],
    ], COL.vestHi);
    fillPoly(pix, [[OX - 7, 166], [OX + 7, 166], [OX, 188]], COL.shirt);
    for (const y of [198, 212, 226]) {
      fillEllipse(pix, OX - 6, y, 1.8, 1.8, COL.vestDeep);
      plot(pix, OX - 7, y - 1, COL.vestHi);
    }
    drawNeckBow(pix);
    fillPoly(pix, [
      [OX - 22, 232],
      [OX + 20, 232],
      [OX + 36 + sway, 286],
      [OX - 34 + sway, 286],
    ], COL.skirtDark);
    for (let i = 0; i < 6; i++) {
      const color = i % 2 ? COL.skirt : COL.skirtHi;
      fillPoly(pix, [
        [OX - 18 + i * 6, 234],
        [OX - 12 + i * 6, 234],
        [OX - 28 + sway + i * 10, 284],
        [OX - 36 + sway + i * 10, 284],
      ], color);
    }
    const ends = armEnds(pose, kind);
    armTo(pix, OX - 18, 188, ends.l[0], ends.l[1], COL.shirt, COL.shirtShade);
    armTo(pix, OX + 18, 188, ends.r[0], ends.r[1], COL.shirt, COL.shirtShade);
    fillRect(pix, OX - 14, 286, 10, 10, COL.skinShade);
    fillRect(pix, OX + 4, 286, 10, 10, COL.skin);
    fillRect(pix, OX - 15, 294, 12, 8, COL.sock);
    fillRect(pix, OX + 3, 294, 12, 8, COL.sock);
    fillEllipse(pix, OX - 10, 306, 11, 5.5, COL.shoe);
    fillEllipse(pix, OX + 10, 306, 11, 5.5, COL.shoeDark);
  }
  if (withApple && pose.arm !== "out" && pose.arm !== "up") {
    const y = pose.arm === "offer" ? 236 : 228;
    hand(pix, OX - 14, y + 4, true);
    hand(pix, OX + 14, y + 4, false);
    drawApple(pix, OX, y, pose.arm === "offer");
    hand(pix, OX - 16, y + 8, true);
    hand(pix, OX + 16, y + 8, false);
  }
  if (pose.arm === "up") {
    hand(pix, OX - 28, 92, true);
    hand(pix, OX + 30, 88, false);
    drawApple(pix, OX + 4, 78, true);
  }
}

function armEnds(pose, kind) {
  if (pose.arm === "up") return { l: [OX - 30, 96], r: [OX + 32, 92] };
  if (pose.arm === "out") return { l: [OX - 58, 188], r: [OX + 58, 184] };
  if (pose.arm === "down") return { l: [OX - 24, 250], r: [OX + 24, 252] };
  if (pose.arm === "share") return { l: [OX - 22, 236], r: [OX + 24, 232] };
  if (pose.arm === "offer") return { l: [OX - 16, 240], r: [OX + 16, 240] };
  return { l: [OX - 18, 232], r: [OX + 18, 232] };
}

function drawCharacter(kind, pose, withApple) {
  const pix = createPix(BW, BH);
  drawHair(pix, kind, pose);
  drawBody(pix, kind, pose, withApple);
  drawFace(pix, kind, pose);
  bowCluster(pix, OX + 42, 72, pose.ribbon * 14, kind === "dark" ? 0.95 : 1.2);
  outline(pix);
  return pix;
}

function shadow(pix, x, y, rx, alpha) {
  fillEllipse(pix, x, y, Math.max(8, rx), 5, [40, 20, 32, alpha]);
}

function renderSingle(kind, pose) {
  const arm = kind === "dark" && (pose.arm === "hold" || pose.arm === "chest") ? "chest" : pose.arm;
  const body = drawCharacter(kind, { ...pose, arm }, true);
  const frame = createPix(240, 360);
  const lift = Math.max(0, -pose.dy);
  shadow(frame, 120, 336, 28 * pose.sx * (1 - lift / 140), Math.max(20, 80 - lift));
  blit(body, frame, { x: 120, feetY: 328, scale: 1 }, pose);
  return frame;
}

const DUO_DARK = { x: 108, feetY: 328, scale: 1 };
const DUO_NORMAL = { x: 148, feetY: 328, scale: 1 };

function renderDuo(darkPose, normalPose) {
  const darkArm = darkPose.arm === "up" || darkPose.arm === "out" || darkPose.arm === "down" ? darkPose.arm : "share";
  const normalArm = normalPose.arm === "up" || normalPose.arm === "out" || normalPose.arm === "down" ? normalPose.arm : "share";
  const dark = drawCharacter("dark", { ...darkPose, arm: darkArm }, false);
  const normal = drawCharacter("normal", { ...normalPose, arm: normalArm }, false);
  const frame = createPix(280, 360);
  const lift = Math.max(0, -darkPose.dy, -normalPose.dy);
  shadow(frame, DUO_DARK.x, 336, 22 * (1 - lift / 160), Math.max(16, 64 - lift));
  shadow(frame, DUO_NORMAL.x, 336, 22 * (1 - lift / 160), Math.max(16, 64 - lift));
  blit(dark, frame, DUO_DARK, darkPose);
  blit(normal, frame, DUO_NORMAL, normalPose);
  const raised = normalArm === "up" || darkArm === "up";
  const localY = raised ? 86 : 228;
  const a = project(DUO_NORMAL, normalPose, OX - 6, localY);
  const b = project(DUO_DARK, darkPose, OX + 18, localY);
  const ax = (a.x + b.x) / 2;
  const ay = (a.y + b.y) / 2;
  hand(frame, ax - 14, ay + 6, true);
  hand(frame, ax + 12, ay + 6, false);
  hand(frame, ax - 4, ay + 8, true);
  hand(frame, ax + 6, ay + 4, false);
  drawApple(frame, ax, ay, true);
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
    dy: 0, sy: 1, sx: 1, lean: 0, blink: false, expr: "neutral",
    ribbon: 0, skirt: 0, hair: 0, arm: "hold", ...partial,
  };
}

const IDLE = [
  pose({}),
  pose({ dy: -10, sy: 1.03, sx: 0.98, lean: 3, ribbon: 0.6, skirt: 0.45, hair: 0.5 }),
  pose({ dy: -18, sy: 1.05, sx: 0.96, blink: true, ribbon: 1, skirt: 0.8, hair: 0.9 }),
  pose({ dy: -8, sy: 1.02, lean: -2, ribbon: 0.2, skirt: 0.15, hair: 0.15 }),
  pose({ lean: -3, ribbon: -0.45, skirt: -0.55, hair: -0.5 }),
  pose({ dy: 8, sy: 0.8, sx: 1.14, ribbon: -1, skirt: -1, hair: -0.85 }),
  pose({ dy: 3, sy: 0.94, sx: 1.05, blink: true, ribbon: -0.2, skirt: -0.2, hair: -0.15 }),
  pose({ dy: -6, sy: 1.02, ribbon: 0.35, skirt: 0.3, hair: 0.35 }),
];
const JOY = [
  pose({ dy: 10, sy: 0.74, sx: 1.2, expr: "joy", arm: "down", skirt: -0.2 }),
  pose({ dy: -16, sy: 1.05, sx: 0.95, expr: "joy", arm: "up", ribbon: 0.7, skirt: 0.5, hair: 0.6 }),
  pose({ dy: -30, sy: 1.03, sx: 0.96, expr: "joy", arm: "up", ribbon: 1, skirt: 1, hair: 1 }),
  pose({ dy: -26, sy: 1.03, expr: "joy", blink: true, arm: "up", ribbon: 0.8, hair: 0.8 }),
  pose({ dy: -10, sy: 1.02, expr: "joy", arm: "up", ribbon: 0.3, hair: 0.2 }),
  pose({ dy: 12, sy: 0.72, sx: 1.22, expr: "joy", arm: "out", ribbon: -0.4, skirt: -0.5 }),
  pose({ dy: -14, sy: 1.04, expr: "joy", arm: "up", ribbon: 0.6, hair: 0.5 }),
  pose({ dy: -4, expr: "happy", arm: "up", ribbon: 0.2, hair: 0.15 }),
];
const ANGRY = [
  pose({ dy: 2, lean: -22, expr: "angry", arm: "out", ribbon: -1, skirt: -0.8, hair: -1 }),
  pose({ lean: 26, expr: "angry", arm: "out", ribbon: 1, skirt: 1, hair: 1 }),
  pose({ dy: 8, sy: 0.86, sx: 1.1, lean: -26, expr: "angry", arm: "out", ribbon: -0.7, skirt: -1, hair: -0.7 }),
  pose({ dy: -4, lean: 22, expr: "angry", blink: true, arm: "out", ribbon: 0.6, hair: 0.6 }),
  pose({ lean: -16, expr: "angry", arm: "out", ribbon: -0.3, hair: -0.3 }),
  pose({ lean: 18, expr: "angry", arm: "out", ribbon: 0.4, skirt: 0.4, hair: 0.4 }),
  pose({ dy: 4, sy: 0.9, sx: 1.06, lean: -10, expr: "angry", arm: "out" }),
  pose({ lean: 6, expr: "angry", arm: "out", ribbon: 0.15 }),
];
const SAD = [
  pose({ dy: 3, sy: 0.98, expr: "sad", arm: "down" }),
  pose({ dy: 8, sy: 0.92, sx: 1.04, lean: -3, expr: "sad", arm: "down", ribbon: -0.3, hair: -0.2 }),
  pose({ dy: 14, sy: 0.84, sx: 1.08, expr: "sad", blink: true, arm: "down", skirt: 0.2 }),
  pose({ dy: 16, sy: 0.8, sx: 1.1, lean: -4, expr: "sad", arm: "down", ribbon: -0.4, hair: -0.35, skirt: -0.3 }),
  pose({ dy: 14, sy: 0.82, lean: 4, expr: "sad", arm: "down", ribbon: 0.35, hair: 0.3, skirt: 0.35 }),
  pose({ dy: 18, sy: 0.78, sx: 1.1, expr: "sad", blink: true, arm: "down" }),
  pose({ dy: 12, sy: 0.84, expr: "sad", arm: "down", hair: 0.1 }),
  pose({ dy: 10, sy: 0.86, lean: 2, expr: "sad", arm: "down" }),
];
const HAPPY = [
  pose({ expr: "happy", arm: "hold" }),
  pose({ dy: 4, sy: 0.92, sx: 1.06, expr: "happy", arm: "offer", ribbon: 0.2 }),
  pose({ dy: -8, sy: 1.04, expr: "happy", arm: "offer", ribbon: 0.55, hair: 0.4, skirt: 0.3 }),
  pose({ dy: -4, expr: "happy", blink: true, arm: "offer", ribbon: 0.25 }),
  pose({ dy: 3, sy: 0.9, sx: 1.08, expr: "joy", arm: "offer", skirt: -0.25 }),
  pose({ dy: -12, sy: 1.04, expr: "happy", arm: "up", ribbon: 0.8, hair: 0.55 }),
  pose({ dy: -2, expr: "happy", blink: true, arm: "offer" }),
  pose({ expr: "happy", arm: "offer", ribbon: 0.15, hair: 0.1 }),
];
const CLIPS = { idle: IDLE, joyful: JOY, angry: ANGRY, sad: SAD, happy: HAPPY };

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
  if (clip === "angry") return { dark: pose({ ...base, arm: "out" }), normal: soften(base, 0.35) };
  if (clip === "sad") return { dark: pose({ ...IDLE[index], arm: "chest", lean: 3 }), normal: base };
  if (clip === "sad-dark") return { dark: pose({ ...base, arm: "down" }), normal: soften(base, 0.35) };
  if (clip === "joyful") {
    return {
      dark: pose({ ...base, dy: base.dy * 0.9, arm: "up" }),
      normal: pose({ ...base, arm: "up" }),
    };
  }
  if (clip === "happy") return { dark: pose({ ...base, arm: "chest", expr: "happy" }), normal: pose({ ...base, arm: "offer", expr: "happy" }) };
  return { dark: pose({ ...base, dy: base.dy * 0.92, arm: "chest" }), normal: base };
}

function writeFrame(form, clip, index, pix) {
  const dir = path.join(outRoot, form, clip);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${String(index + 1).padStart(2, "0")}.png`), encodePng(pix.w, pix.h, pix.rgba));
}

for (const kind of ["normal", "dark"]) {
  for (const [clip, frames] of Object.entries(CLIPS)) {
    frames.forEach((framePose, index) => writeFrame(kind, clip, index, renderSingle(kind, framePose)));
  }
}
for (const clip of ["idle", "joyful", "angry", "sad", "happy", "sad-dark"]) {
  for (let index = 0; index < 8; index++) {
    const pair = duoPair(clip, index);
    writeFrame("duo", clip, index, renderDuo(pair.dark, pair.normal));
  }
}
console.log(`wrote pixel frames under ${outRoot}`);
