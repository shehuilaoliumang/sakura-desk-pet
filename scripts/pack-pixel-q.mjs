/**
 * Cut the approved 像素Q redraws into transparent 8-frame clips.
 * The character drawings are not generated here. This only keys the
 * white paper, slices the three-pose sheets, and builds in-betweens
 * (tiptoe, blink, jump, shake, offer, crouch) from those pixels.
 *
 * Run: node scripts/pack-pixel-q.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "packs", "pixel-q", "sources");
const outRoot = path.join(root, "packs", "pixel-q", "animations");

const CHAR_H = 460;

function loadJpeg(file) {
  const probe = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  ).trim();
  const [w, h] = probe.split(",").map((n) => Number(n));
  const rgba = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (rgba.length !== w * h * 4) throw new Error(`decode size ${file}: ${rgba.length} != ${w * h * 4}`);
  return { w, h, rgba: Buffer.from(rgba) };
}

function idx(w, x, y) {
  return (y * w + x) * 4;
}

function nearPaper(r, g, b, minChannel, chroma) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mn >= minChannel && mx - mn <= chroma;
}

function keyPaper(img) {
  const { w, h, rgba } = img;
  const seen = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let qe = 0;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    const i = p * 4;
    if (!nearPaper(rgba[i], rgba[i + 1], rgba[i + 2], 249, 14)) return;
    seen[p] = 1;
    rgba[i + 3] = 0;
    qx[qe] = x;
    qy[qe] = y;
    qe++;
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  for (let qs = 0; qs < qe; qs++) {
    const x = qx[qs];
    const y = qy[qs];
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  for (let pass = 0; pass < 3; pass++) {
    const kill = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w; x++) {
        const i = idx(w, x, y);
        if (rgba[i + 3] === 0) continue;
        let edge = false;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (rgba[idx(w, x + dx, y + dy) + 3] === 0) edge = true;
        }
        if (!edge) continue;
        if (nearPaper(rgba[i], rgba[i + 1], rgba[i + 2], 242, 18)) kill.push(i);
      }
    }
    for (const i of kill) rgba[i + 3] = 0;
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(w, x, y);
      if (rgba[i + 3] === 0) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (rgba[idx(w, x + dx, y + dy) + 3] === 0) edge = true;
        }
      }
      if (!edge) continue;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const mn = Math.min(r, g, b);
      const mx = Math.max(r, g, b);
      if (mn < 206 || mx - mn > 28) continue;
      const a = Math.max(0, Math.min(1, (248 - mn) / 42));
      if (a < 0.06) {
        rgba[i + 3] = 0;
        continue;
      }
      rgba[i] = clampByte((r - 255 * (1 - a)) / a);
      rgba[i + 1] = clampByte((g - 255 * (1 - a)) / a);
      rgba[i + 2] = clampByte((b - 255 * (1 - a)) / a);
      rgba[i + 3] = clampByte(a * 255);
    }
  }
  dropSpecks(img);
  return img;
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function dropSpecks(img) {
  const { w, h, rgba } = img;
  const id = new Int32Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  const sizes = [0];
  let next = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (id[p] || rgba[p * 4 + 3] < 16) continue;
      let qs = 0;
      let qe = 0;
      qx[qe] = x;
      qy[qe] = y;
      qe++;
      id[p] = next;
      let n = 0;
      while (qs < qe) {
        const cx = qx[qs];
        const cy = qy[qs];
        qs++;
        n++;
        const nbs = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of nbs) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (id[np] || rgba[np * 4 + 3] < 16) continue;
          id[np] = next;
          qx[qe] = nx;
          qy[qe] = ny;
          qe++;
        }
      }
      sizes[next] = n;
      next++;
    }
  }
  let max = 0;
  for (const n of sizes) if (n > max) max = n;
  const floor = Math.max(40, max * 0.008);
  for (let p = 0; p < w * h; p++) {
    const label = id[p];
    if (label && sizes[label] < floor) rgba[p * 4 + 3] = 0;
  }
}

function boundsOf(img, alphaMin = 16) {
  const { w, h, rgba } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[idx(w, x, y) + 3] < alphaMin) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("empty sprite");
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

function crop(img, box, pad = 0) {
  const x0 = Math.max(0, box.x0 - pad);
  const y0 = Math.max(0, box.y0 - pad);
  const x1 = Math.min(img.w, box.x1 + pad);
  const y1 = Math.min(img.h, box.y1 + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    img.rgba.copy(rgba, y * w * 4, idx(img.w, x0, y0 + y), idx(img.w, x0, y0 + y) + w * 4);
  }
  return { w, h, rgba };
}

function trim(img) {
  return crop(img, boundsOf(img), 1);
}

function splitThree(img) {
  const counts = new Float64Array(img.w);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.rgba[idx(img.w, x, y) + 3] > 20) counts[x] += 1;
    }
  }
  const smooth = new Float64Array(img.w);
  const radius = 6;
  for (let x = 0; x < img.w; x++) {
    let sum = 0;
    let n = 0;
    for (let k = -radius; k <= radius; k++) {
      if (x + k < 0 || x + k >= img.w) continue;
      sum += counts[x + k];
      n++;
    }
    smooth[x] = sum / n;
  }
  const thresh = Math.max(10, img.h * 0.015);
  const runs = [];
  let start = -1;
  for (let x = 0; x <= img.w; x++) {
    const on = x < img.w && smooth[x] > thresh;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      runs.push([start, x]);
      start = -1;
    }
  }
  const wide = runs.filter((run) => run[1] - run[0] > img.w * 0.08);
  if (wide.length !== 3) {
    throw new Error(`expected 3 poses, found ${wide.length} (${runs.map((r) => r.join("-")).join(", ")})`);
  }
  return wide.map(([x0, x1]) => trim(crop(img, { x0, y0: 0, x1, y1: img.h }, 0)));
}

function headWidth(img) {
  const box = boundsOf(img);
  const band = Math.max(6, Math.round((box.y1 - box.y0) * 0.2));
  let best = 0;
  for (let y = box.y0; y < box.y0 + band && y < box.y1; y++) {
    let left = -1;
    let right = -1;
    for (let x = box.x0; x < box.x1; x++) {
      if (img.rgba[idx(img.w, x, y) + 3] < 20) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left >= 0) best = Math.max(best, right - left + 1);
  }
  return Math.max(8, best);
}

function resample(img, tw, th) {
  const rgba = Buffer.alloc(tw * th * 4);
  const xr = img.w / tw;
  const yr = img.h / th;
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * yr);
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * yr));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * xr);
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * xr));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1 && sy < img.h; sy++) {
        for (let sx = x0; sx < x1 && sx < img.w; sx++) {
          const i = idx(img.w, sx, sy);
          const pa = img.rgba[i + 3] / 255;
          r += img.rgba[i] * pa;
          g += img.rgba[i + 1] * pa;
          b += img.rgba[i + 2] * pa;
          a += pa;
          n++;
        }
      }
      const o = idx(tw, x, y);
      if (n === 0 || a < 0.02) continue;
      rgba[o] = clampByte(r / a);
      rgba[o + 1] = clampByte(g / a);
      rgba[o + 2] = clampByte(b / a);
      rgba[o + 3] = clampByte((a / n) * 255);
    }
  }
  return trim({ w: tw, h: th, rgba });
}

function fitHeight(img, height) {
  const scale = height / img.h;
  return resample(img, Math.max(1, Math.round(img.w * scale)), Math.max(1, Math.round(img.h * scale)));
}

function fitHead(img, targetHead) {
  const scale = targetHead / headWidth(img);
  return resample(img, Math.max(1, Math.round(img.w * scale)), Math.max(1, Math.round(img.h * scale)));
}

function blank(w, h) {
  return { w, h, rgba: Buffer.alloc(w * h * 4) };
}

function sampleBilinear(img, x, y) {
  if (x < -1 || y < -1 || x >= img.w || y >= img.h) return [0, 0, 0, 0];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const [ix, wx] of [
    [x0, 1 - fx],
    [x0 + 1, fx],
  ]) {
    if (wx <= 0) continue;
    for (const [iy, wy] of [
      [y0, 1 - fy],
      [y0 + 1, fy],
    ]) {
      if (wy <= 0 || ix < 0 || iy < 0 || ix >= img.w || iy >= img.h) continue;
      const i = idx(img.w, ix, iy);
      const pa = (img.rgba[i + 3] / 255) * wx * wy;
      r += img.rgba[i] * pa;
      g += img.rgba[i + 1] * pa;
      b += img.rgba[i + 2] * pa;
      a += pa;
    }
  }
  if (a < 0.004) return [0, 0, 0, 0];
  return [r / a, g / a, b / a, a];
}

function over(dest, di, r, g, b, a) {
  const oa = dest.rgba[di + 3] / 255;
  const na = a + oa * (1 - a);
  if (na <= 0.004) return;
  dest.rgba[di] = clampByte((r * a + dest.rgba[di] * oa * (1 - a)) / na);
  dest.rgba[di + 1] = clampByte((g * a + dest.rgba[di + 1] * oa * (1 - a)) / na);
  dest.rgba[di + 2] = clampByte((b * a + dest.rgba[di + 2] * oa * (1 - a)) / na);
  dest.rgba[di + 3] = clampByte(na * 255);
}

function stamp(dest, src, left, top, scaleX = 1, scaleY = 1, anchorX = 0.5, anchorY = 1) {
  const dw = src.w * scaleX;
  const dh = src.h * scaleY;
  const originX = left - dw * anchorX;
  const originY = top - dh * anchorY;
  if (Math.abs(scaleX - 1) < 1e-4 && Math.abs(scaleY - 1) < 1e-4) {
    const ox = Math.round(originX);
    const oy = Math.round(originY);
    for (let y = 0; y < src.h; y++) {
      const dy = oy + y;
      if (dy < 0 || dy >= dest.h) continue;
      for (let x = 0; x < src.w; x++) {
        const dx = ox + x;
        if (dx < 0 || dx >= dest.w) continue;
        const si = idx(src.w, x, y);
        const a = src.rgba[si + 3] / 255;
        if (a < 0.02) continue;
        over(dest, idx(dest.w, dx, dy), src.rgba[si], src.rgba[si + 1], src.rgba[si + 2], a);
      }
    }
    return;
  }
  const xStart = Math.max(0, Math.floor(originX));
  const yStart = Math.max(0, Math.floor(originY));
  const xEnd = Math.min(dest.w, Math.ceil(originX + dw));
  const yEnd = Math.min(dest.h, Math.ceil(originY + dh));
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const sx = (x + 0.5 - originX) / scaleX - 0.5;
      const sy = (y + 0.5 - originY) / scaleY - 0.5;
      const [r, g, b, a] = sampleBilinear(src, sx, sy);
      if (a < 0.02) continue;
      over(dest, idx(dest.w, x, y), r, g, b, a);
    }
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function encodePng(img) {
  const { w, h, rgba } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function writePng(file, img) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(img));
}

function measure(img) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let minY = img.h;
  let maxY = 0;
  let transparent = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.rgba[idx(img.w, x, y) + 3] < 16) {
        transparent++;
        continue;
      }
      n++;
      sx += x;
      sy += y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { cx: sx / n, cy: sy / n, minY, maxY, transparent, n };
}

function loadCut(name) {
  const file = path.join(srcDir, name);
  return trim(keyPaper(loadJpeg(file)));
}

function preparePoses(idle, sheets, targetHead) {
  const base = fitHead(idle, targetHead);
  const poses = {};
  for (const [clip, file] of Object.entries(sheets)) {
    const parts = splitThree(loadCut(file)).map((part) => fitHead(part, targetHead));
    if (parts.length !== 3) throw new Error(`${clip} did not yield 3 poses`);
    poses[clip] = parts;
  }
  return { base, poses, targetHead };
}

function canvasFor(sprites) {
  let maxW = 0;
  let maxH = 0;
  for (const sprite of sprites) {
    maxW = Math.max(maxW, sprite.w);
    maxH = Math.max(maxH, sprite.h);
  }
  const H = Math.round(Math.max(maxH, CHAR_H) / 0.66);
  const W = Math.round(maxW / 0.7);
  return { w: W, h: H, ground: Math.round(H * 0.94), cx: Math.round(W / 2) };
}

function frame(canvas, sprite, opt = {}) {
  const img = blank(canvas.w, canvas.h);
  const scaleX = opt.sx ?? 1;
  const scaleY = opt.sy ?? 1;
  const dx = Math.round((opt.dx ?? 0) * canvas.w);
  const dy = Math.round((opt.dy ?? 0) * canvas.h);
  stamp(img, sprite, canvas.cx + dx, canvas.ground + dy, scaleX, scaleY, 0.5, 1);
  return img;
}

function writeClip(form, clip, frames) {
  frames.forEach((img, index) => {
    writePng(path.join(outRoot, form, clip, `${String(index + 1).padStart(2, "0")}.png`), img);
  });
}

function buildSolo(form) {
  const idle = loadCut(`${form}_idle.jpg`);
  const prepared = preparePoses(idle, {
    joyful: `${form}_joy_cycle.jpg`,
    angry: `${form}_angry_cycle.jpg`,
    happy: `${form}_happy_cycle.jpg`,
    sad: `${form}_sad_cycle.jpg`,
  }, headWidth(fitHeight(idle, CHAR_H)));
  const all = [prepared.base, ...Object.values(prepared.poses).flat()];
  const canvas = canvasFor(all);
  const idleFrames = [
    { dy: 0 },
    { dy: -0.035 },
    { dy: -0.072 },
    { dy: -0.108 },
    { dy: -0.058 },
    { dy: -0.02 },
    { dy: 0.02 },
    { dy: -0.046 },
  ].map((opt) => frame(canvas, prepared.base, opt));
  const joy = prepared.poses.joyful;
  const joyFrames = [
    { pose: 0, dy: 0.012, sy: 1 },
    { pose: 0, dy: -0.03, sy: 1.02 },
    { pose: 1, dy: -0.09 },
    { pose: 1, dy: -0.165 },
    { pose: 1, dy: -0.178 },
    { pose: 1, dy: -0.08 },
    { pose: 2, dy: 0.016, sy: 0.98 },
    { pose: 2, dy: 0 },
  ].map((opt) => frame(canvas, joy[opt.pose], opt));
  const angry = prepared.poses.angry;
  const angryFrames = [
    { pose: 0, dx: 0 },
    { pose: 0, dx: -0.035 },
    { pose: 1, dx: -0.06 },
    { pose: 1, dx: -0.02 },
    { pose: 2, dx: 0.06 },
    { pose: 2, dx: 0.028 },
    { pose: 1, dx: -0.045 },
    { pose: 0, dx: 0.018 },
  ].map((opt) => frame(canvas, angry[opt.pose], opt));
  const happy = prepared.poses.happy;
  const happyFrames = [
    { pose: 0, sx: 1, sy: 1 },
    { pose: 0, sx: 1.03, sy: 1.03 },
    { pose: 1, sx: 1.06, sy: 1.06 },
    { pose: 1, sx: 1.1, sy: 1.1, dy: 0.012 },
    { pose: 1, sx: 1.12, sy: 1.12, dy: 0.018 },
    { pose: 2, sx: 1.07, sy: 1.07, dy: 0.008 },
    { pose: 2, sx: 1.03, sy: 1.03 },
    { pose: 0, sx: 1, sy: 1 },
  ].map((opt) => frame(canvas, happy[opt.pose], opt));
  const sad = prepared.poses.sad;
  const sadFrames = [
    { pose: 0, dy: 0 },
    { pose: 0, dy: 0.012, sy: 0.98 },
    { pose: 1, dy: 0.02 },
    { pose: 1, dy: 0.028, sy: 0.99 },
    { pose: 2, dy: 0.02 },
    { pose: 2, dy: 0.03, sy: 0.985 },
    { pose: 1, dy: 0.016 },
    { pose: 0, dy: 0.006 },
  ].map((opt) => frame(canvas, sad[opt.pose], opt));
  writeClip(form, "idle", idleFrames);
  writeClip(form, "joyful", joyFrames);
  writeClip(form, "angry", angryFrames);
  writeClip(form, "happy", happyFrames);
  writeClip(form, "sad", sadFrames);
  return { canvas, idle: idleFrames, joyful: joyFrames, angry: angryFrames, happy: happyFrames, sad: sadFrames };
}

function buildDuo() {
  const idle = loadCut("duo_idle.jpg");
  const sit = loadCut("duo_sit.jpg");
  const targetHead = headWidth(fitHeight(idle, CHAR_H));
  const base = fitHead(idle, targetHead);
  const seated = fitHead(sit, Math.round(targetHead * 0.92));
  const canvas = canvasFor([base, seated]);
  const idleFrames = [
    { dy: 0 },
    { dy: -0.032 },
    { dy: -0.07 },
    { dy: -0.104 },
    { dy: -0.055 },
    { dy: -0.018 },
    { dy: 0.018 },
    { dy: -0.042 },
  ].map((opt) => frame(canvas, base, opt));
  const joyFrames = [
    { dy: 0.01, sy: 0.9 },
    { dy: 0.016, sy: 0.86 },
    { dy: -0.05, sy: 0.96 },
    { dy: -0.12, sy: 1 },
    { dy: -0.175, sy: 1.01 },
    { dy: -0.08, sy: 1 },
    { dy: 0.012, sy: 0.92 },
    { dy: 0, sy: 0.97 },
  ].map((opt) => frame(canvas, base, opt));
  const angryFrames = [
    { dx: 0, sy: 0.98 },
    { dx: -0.04 },
    { dx: -0.065 },
    { dx: -0.02 },
    { dx: 0.065 },
    { dx: 0.03 },
    { dx: -0.048 },
    { dx: 0.02 },
  ].map((opt) => frame(canvas, base, opt));
  const happyFrames = [
    { sx: 1, sy: 1 },
    { sx: 1.03, sy: 1.03 },
    { sx: 1.06, sy: 1.06 },
    { sx: 1.1, sy: 1.1, dy: 0.01 },
    { sx: 1.12, sy: 1.12, dy: 0.016 },
    { sx: 1.06, sy: 1.06 },
    { sx: 1.03, sy: 1.03 },
    { sx: 1, sy: 1 },
  ].map((opt) => frame(canvas, base, opt));
  const sadFrames = [
    { dy: 0, sy: 1 },
    { dy: 0.01, sy: 0.96 },
    { dy: 0.02, sy: 0.9 },
    { dy: 0.028, sy: 0.84 },
    { dy: 0.03, sy: 0.8 },
    { dy: 0.024, sy: 0.86 },
    { dy: 0.012, sy: 0.93 },
    { dy: 0, sy: 0.98 },
  ].map((opt) => frame(canvas, base, opt));
  const sadDark = sadFrames.map((img, index) => {
    const opt = [
      { dy: 0.01, sy: 0.97 },
      { dy: 0.02, sy: 0.9 },
      { dy: 0.03, sy: 0.82 },
      { dy: 0.034, sy: 0.78 },
      { dy: 0.03, sy: 0.8 },
      { dy: 0.02, sy: 0.88 },
      { dy: 0.01, sy: 0.94 },
      { dy: 0, sy: 1 },
    ][index];
    return frame(canvas, base, opt);
  });
  const sitFrames = [
    { dy: 0 },
    { dy: -0.01 },
    { dy: -0.02 },
    { dy: -0.012 },
    { dy: 0 },
    { dy: 0.008 },
    { dy: -0.008 },
    { dy: -0.016 },
  ].map((opt) => frame(canvas, seated, opt));
  writeClip("duo", "idle", idleFrames);
  writeClip("duo", "joyful", joyFrames);
  writeClip("duo", "angry", angryFrames);
  writeClip("duo", "happy", happyFrames);
  writeClip("duo", "sad", sadFrames);
  writeClip("duo", "sad-dark", sadDark);
  writeClip("duo", "sit", sitFrames);
  return { canvas, idle: idleFrames };
}

function spanY(frames) {
  const ys = frames.map((img) => measure(img).cy);
  return (Math.max(...ys) - Math.min(...ys)) / frames[0].h;
}

function spanX(frames) {
  const xs = frames.map((img) => measure(img).cx);
  return (Math.max(...xs) - Math.min(...xs)) / frames[0].w;
}

function assertMotion(form, built) {
  const first = measure(built.idle[0]);
  if (first.transparent < built.idle[0].w * built.idle[0].h * 0.2) throw new Error(`${form} not transparent enough`);
  if (!(first.minY < built.idle[0].h * 0.4 && first.maxY > built.idle[0].h * 0.85)) {
    throw new Error(`${form} framing minY ${first.minY} maxY ${first.maxY} h ${built.idle[0].h}`);
  }
  const idleSpan = spanY(built.idle);
  const joySpan = spanY(built.joyful);
  const shake = spanX(built.angry);
  if (idleSpan <= 0.08) throw new Error(`${form} idle span ${idleSpan}`);
  if (joySpan <= idleSpan) throw new Error(`${form} joy span ${joySpan} <= idle ${idleSpan}`);
  if (shake <= 0.04) throw new Error(`${form} shake ${shake}`);
  const hashes = new Set(built.idle.map((img) => img.rgba.toString("base64")));
  if (hashes.size < 6) throw new Error(`${form} idle unique ${hashes.size}`);
  console.log(
    `${form} canvas ${built.canvas.w}x${built.canvas.h} idle ${idleSpan.toFixed(3)} joy ${joySpan.toFixed(3)} shake ${shake.toFixed(3)} head ${first.minY} feet ${first.maxY}`,
  );
}

function duoBands(img) {
  const band = (x0, x1) => {
    let minY = img.h;
    let maxY = 0;
    for (let y = 0; y < img.h; y++) {
      for (let x = x0; x < x1; x++) {
        if (img.rgba[idx(img.w, x, y) + 3] > 40) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { minY, span: maxY - minY };
  };
  const left = band(Math.round(img.w * 0.22), Math.round(img.w * 0.42));
  const right = band(Math.round(img.w * 0.55), Math.round(img.w * 0.75));
  return { left, right };
}

function paintFrame(dest, frameImg, ox, oy) {
  for (let y = 0; y < frameImg.h; y++) {
    for (let x = 0; x < frameImg.w; x++) {
      const si = idx(frameImg.w, x, y);
      const a = frameImg.rgba[si + 3] / 255;
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= dest.w || dy >= dest.h) continue;
      const di = idx(dest.w, dx, dy);
      const bg = (Math.floor(dx / 12) + Math.floor(dy / 12)) % 2 === 0 ? 236 : 214;
      dest.rgba[di] = clampByte(frameImg.rgba[si] * a + bg * (1 - a));
      dest.rgba[di + 1] = clampByte(frameImg.rgba[si + 1] * a + bg * (1 - a));
      dest.rgba[di + 2] = clampByte(frameImg.rgba[si + 2] * a + (bg - 6) * (1 - a));
      dest.rgba[di + 3] = 255;
    }
  }
}

function sheet(frames, columns) {
  const cellW = Math.max(...frames.map((frameImg) => frameImg.w));
  const cellH = Math.max(...frames.map((frameImg) => frameImg.h));
  const rows = Math.ceil(frames.length / columns);
  const img = blank(cellW * columns, cellH * rows);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const di = idx(img.w, x, y);
      const bg = (Math.floor(x / 12) + Math.floor(y / 12)) % 2 === 0 ? 236 : 214;
      img.rgba[di] = bg;
      img.rgba[di + 1] = bg;
      img.rgba[di + 2] = bg - 6;
      img.rgba[di + 3] = 255;
    }
  }
  frames.forEach((frameImg, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    paintFrame(img, frameImg, col * cellW, row * cellH + (cellH - frameImg.h));
  });
  return img;
}

function listComponents(img) {
  const { w, h, rgba } = img;
  const id = new Int32Array(w * h);
  const comps = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (id[p] || rgba[p * 4 + 3] < 16) continue;
      const pixels = [];
      const stack = [p];
      id[p] = comps.length + 1;
      let x0 = x;
      let y0 = y;
      let x1 = x;
      let y1 = y;
      let reds = 0;
      let yellows = 0;
      let inks = 0;
      for (let qs = 0; qs < stack.length; qs++) {
        const cp = stack[qs];
        pixels.push(cp);
        const cx = cp % w;
        const cy = (cp / w) | 0;
        if (cx < x0) x0 = cx;
        if (cy < y0) y0 = cy;
        if (cx > x1) x1 = cx;
        if (cy > y1) y1 = cy;
        const i = cp * 4;
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];
        if (r > 150 && g < 130 && b < 130 && r > g + 35 && r > b + 35) reds++;
        if (r > 190 && g > 150 && b < 150) yellows++;
        if (r < 90 && g < 90 && b < 100 && Math.max(r, g, b) - Math.min(r, g, b) < 40) inks++;
        for (const np of [cp + 1, cp - 1, cp + w, cp - w]) {
          if (np < 0 || np >= w * h || id[np] || rgba[np * 4 + 3] < 16) continue;
          id[np] = comps.length + 1;
          stack.push(np);
        }
      }
      comps.push({ n: pixels.length, pixels, x0, y0, x1: x1 + 1, y1: y1 + 1, reds, yellows, inks });
    }
  }
  comps.sort((a, b) => b.n - a.n);
  return comps;
}

function boxGap(a, b) {
  const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
  const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
  return Math.hypot(dx, dy);
}

function eraseGroundApples(img) {
  const { w, h, rgba } = img;
  const seen = new Uint8Array(w * h);
  const blobs = [];
  const isRed = (i) => rgba[i + 3] > 140 && rgba[i] > 155 && rgba[i + 1] < 125 && rgba[i + 2] < 125 && rgba[i] > rgba[i + 1] + 40;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (seen[p] || !isRed(p * 4)) continue;
      const pixels = [];
      const stack = [p];
      seen[p] = 1;
      let x0 = x;
      let y0 = y;
      let x1 = x;
      let y1 = y;
      for (let qs = 0; qs < stack.length; qs++) {
        const cp = stack[qs];
        pixels.push(cp);
        const cx = cp % w;
        const cy = (cp / w) | 0;
        if (cx < x0) x0 = cx;
        if (cy < y0) y0 = cy;
        if (cx > x1) x1 = cx;
        if (cy > y1) y1 = cy;
        for (const np of [cp + 1, cp - 1, cp + w, cp - w]) {
          if (np < 0 || np >= w * h || seen[np] || !isRed(np * 4)) continue;
          seen[np] = 1;
          stack.push(np);
        }
      }
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      const fill = pixels.length / (bw * bh);
      const aspect = bw / bh;
      if (pixels.length > 280 && y0 > h * 0.7 && fill > 0.32 && aspect > 0.55 && aspect < 2.4) {
        blobs.push({ pixels, x0, y0, x1, y1 });
      }
    }
  }
  if (!blobs.length) return img;
  const kill = new Uint8Array(w * h);
  for (const blob of blobs) {
    for (let y = blob.y0 - 18; y <= blob.y1 + 8; y++) {
      for (let x = blob.x0 - 8; x <= blob.x1 + 8; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = y * w + x;
        const i = p * 4;
        if (rgba[i + 3] < 16) continue;
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];
        const luma = (r + g + b) / 3;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const dress = luma < 36 && chroma < 28;
        if (!dress) kill[p] = 1;
      }
    }
  }
  for (let pass = 0; pass < 10; pass++) {
    const add = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (kill[p] || rgba[p * 4 + 3] < 8) continue;
        let near = false;
        for (const np of [p + 1, p - 1, p + w, p - w]) if (kill[np]) near = true;
        if (!near) continue;
        const r = rgba[p * 4];
        const g = rgba[p * 4 + 1];
        const b = rgba[p * 4 + 2];
        const luma = (r + g + b) / 3;
        if (luma > 70 || (rgba[p * 4 + 3] < 210 && luma > 36) || (r > 70 && r > g + 12 && r > b + 12)) add.push(p);
      }
    }
    if (!add.length) break;
    for (const p of add) kill[p] = 1;
  }
  for (let p = 0; p < w * h; p++) if (kill[p]) rgba[p * 4 + 3] = 0;
  const leftover = listComponents(img);
  if (leftover.length > 1) {
    const body = leftover[0];
    for (const part of leftover.slice(1)) {
      const cy = (part.y0 + part.y1) / 2;
      let dark = 0;
      for (const p of part.pixels) {
        const luma = (rgba[p * 4] + rgba[p * 4 + 1] + rgba[p * 4 + 2]) / 3;
        if (luma < 42) dark++;
      }
      if (part.n < 2500 && cy > h * 0.68 && dark / part.n < 0.65) {
        for (const p of part.pixels) rgba[p * 4 + 3] = 0;
      }
    }
  }
  const body = boundsOf(img);
  const mid = (body.x0 + body.x1) / 2;
  for (let y = body.y0 + Math.round((body.y1 - body.y0) * 0.62); y < body.y1; y++) {
    for (let x = body.x0; x < body.x1; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (rgba[i + 3] < 12) continue;
      const luma = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
      const side = x < mid - w * 0.05 || x > mid + w * 0.05;
      if (!side || luma < 145) continue;
      let open = 0;
      for (const np of [p + 1, p - 1, p + w, p - w]) {
        if (np < 0 || np >= w * h || rgba[np * 4 + 3] < 48) open++;
      }
      if (open >= 1) rgba[i + 3] = 0;
    }
  }
  return img;
}

/** Drop overlay props that are not part of the character. */
function stripExtras(img, mode) {
  const comps = listComponents(img);
  if (comps.length < 2) return img;
  const main = comps[0];
  const mainH = main.y1 - main.y0;
  for (const part of comps.slice(1)) {
    const gap = boxGap(main, part);
    const redRatio = part.reds / part.n;
    const yellowRatio = part.yellows / part.n;
    const inkRatio = part.inks / part.n;
    const low = (part.y0 + part.y1) / 2 > main.y0 + mainH * 0.62;
    const high = part.y1 < main.y0 + mainH * 0.28;
    let drop = gap > 8 && part.n < main.n * 0.025;
    if (mode === "apple" && redRatio > 0.42 && low) drop = true;
    if (mode === "sparkle" && yellowRatio > 0.35 && part.n < main.n * 0.06) drop = true;
    if (mode === "zzz" && inkRatio > 0.45 && high && part.n < main.n * 0.08) drop = true;
    if (mode === "swirl" && gap > 3 && part.n < main.n * 0.04) drop = true;
    if (!drop) continue;
    for (const p of part.pixels) img.rgba[p * 4 + 3] = 0;
  }
  return trim(img);
}

function canvasFromIdle(form) {
  const idle = decodePacked(fs.readFileSync(path.join(outRoot, form, "idle", "01.png")));
  return { w: idle.w, h: idle.h, ground: Math.round(idle.h * 0.94), cx: Math.round(idle.w / 2) };
}

function fitPose(sprite, targetHead, canvas) {
  let fitted = fitHead(sprite, targetHead);
  const maxW = Math.round(canvas.w * 0.94);
  const maxH = Math.max(8, canvas.ground - 2);
  const scale = Math.min(1, maxW / fitted.w, maxH / fitted.h);
  return { sprite: fitted, scale };
}

const MOTION_NAMES = [
  "wave",
  "sit",
  "sleep",
  "stretch",
  "shy",
  "surprise",
  "headpat",
  "think",
  "dance",
  "bite",
  "nod",
  "refuse",
  "spin",
  "tease",
  "peek",
  "toss",
  "clap",
  "laugh",
  "work",
  "wait",
];

function extraMode(form, motion) {
  if (form === "dark" && motion === "sleep") return "zzz";
  if (form === "normal" && motion === "think") return "sparkle";
  if (form === "normal" && motion === "spin") return "swirl";
  if (motion === "clap" || motion === "work") return "apple";
  return "";
}

function packSheet(file, mode) {
  const keyed = keyPaper(loadJpeg(file));
  const poses = splitThree(keyed).map((pose) => stripExtras(pose, mode));
  if (poses.length !== 3) throw new Error(`${file} poses ${poses.length}`);
  return poses;
}

function packNewMotions() {
  const motionDir = path.join(srcDir, "motions");
  const art = "/opt/cursor/artifacts";
  fs.mkdirSync(art, { recursive: true });
  for (const form of ["normal", "dark"]) {
    const idle = loadCut(`${form}_idle.jpg`);
    const targetHead = headWidth(fitHeight(idle, CHAR_H));
    const canvas = canvasFromIdle(form);
    console.log(`${form} canvas ${canvas.w}x${canvas.h} head ${targetHead}`);
    const only = new Set((process.argv.find((arg) => arg.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean));
    for (const motion of MOTION_NAMES) {
      if (only.size && !only.has(motion)) continue;
      const file = path.join(motionDir, `${form}_${motion}.jpg`);
      const poses = packSheet(file, extraMode(form, motion)).map((pose) => fitPose(pose, targetHead, canvas));
      const beats = [
        { pose: 0, dy: 0 },
        { pose: 0, dy: -0.01 },
        { pose: 1, dy: 0 },
        { pose: 1, dy: -0.008 },
        { pose: 2, dy: 0 },
        { pose: 2, dy: 0.008 },
        { pose: 1, dy: 0.004 },
        { pose: 0, dy: 0 },
      ];
      const frames = beats.map((beat) => frame(canvas, poses[beat.pose].sprite, { ...beat, sx: poses[beat.pose].scale, sy: poses[beat.pose].scale }));
      if (extraMode(form, motion) === "apple") {
        for (const item of frames) eraseGroundApples(item);
      }
      writeClip(form, motion, frames);
      const preview = sheet(frames.map((item) => resample(item, Math.max(1, Math.round(item.w * 0.34)), Math.max(1, Math.round(item.h * 0.34)))), 4);
      writePng(path.join(art, `pixel_q_${form}_${motion}_v4.png`), preview);
      console.log(`  ${form}/${motion} scales ${poses.map((pose) => pose.scale.toFixed(2)).join(",")}`);
    }
  }
  if (process.argv.some((arg) => arg.startsWith("--only=")) && !process.argv.includes("--only=lean") && !(process.argv.find((arg) => arg.startsWith("--only=")) ?? "").includes("lean")) {
    return;
  }
  const duoIdle = loadCut("duo_idle.jpg");
  const duoHead = headWidth(fitHeight(duoIdle, CHAR_H));
  const duoCanvas = canvasFromIdle("duo");
  const leanPoses = packSheet(path.join(motionDir, "duo_lean.jpg"), "").map((pose) => fitPose(pose, duoHead, duoCanvas));
  const leanBeats = [
    { pose: 0, dy: 0 },
    { pose: 0, dy: -0.008 },
    { pose: 1, dy: 0 },
    { pose: 1, dy: -0.006 },
    { pose: 2, dy: 0 },
    { pose: 2, dy: 0.006 },
    { pose: 1, dy: 0.004 },
    { pose: 0, dy: 0 },
  ];
  const leanFrames = leanBeats.map((beat) =>
    frame(duoCanvas, leanPoses[beat.pose].sprite, { ...beat, sx: leanPoses[beat.pose].scale, sy: leanPoses[beat.pose].scale }),
  );
  writeClip("duo", "lean", leanFrames);
  writePng(
    path.join(art, "pixel_q_duo_lean_v4.png"),
    sheet(leanFrames.map((item) => resample(item, Math.max(1, Math.round(item.w * 0.34)), Math.max(1, Math.round(item.h * 0.34)))), 4),
  );
  console.log(`duo/lean scales ${leanPoses.map((pose) => pose.scale.toFixed(2)).join(",")}`);
}

function main() {
  const normal = buildSolo("normal");
  const dark = buildSolo("dark");
  const duo = buildDuo();
  assertMotion("normal", normal);
  assertMotion("dark", dark);
  const readClip = (form, clip) =>
    Array.from({ length: 8 }, (_, i) => {
      const png = fs.readFileSync(path.join(outRoot, form, clip, `${String(i + 1).padStart(2, "0")}.png`));
      return decodePacked(png);
    });
  const duoBuilt = {
    canvas: duo.canvas,
    idle: readClip("duo", "idle"),
    joyful: readClip("duo", "joyful"),
    angry: readClip("duo", "angry"),
  };
  assertMotion("duo", duoBuilt);
  const bands = duoBands(duoBuilt.idle[0]);
  console.log("duo bands", bands, "h", duoBuilt.idle[0].h);
  if (Math.abs(bands.left.minY - bands.right.minY) >= duoBuilt.idle[0].h * 0.06) {
    throw new Error("duo heads differ");
  }
  if (Math.abs(bands.left.span - bands.right.span) >= duoBuilt.idle[0].h * 0.08) {
    throw new Error("duo heights differ");
  }
  const art = "/opt/cursor/artifacts";
  fs.mkdirSync(art, { recursive: true });
  writePng(path.join(art, "pixel_q_normal_idle_v4.png"), sheet(normal.idle, 4));
  writePng(path.join(art, "pixel_q_dark_idle_v4.png"), sheet(dark.idle, 4));
  writePng(path.join(art, "pixel_q_duo_idle_v4.png"), sheet(duoBuilt.idle, 4));
  writePng(path.join(art, "pixel_q_normal_joy_cycle_v4.png"), sheet(normal.joyful, 4));
  writePng(path.join(art, "pixel_q_dark_joy_cycle_v4.png"), sheet(dark.joyful, 4));
  writePng(path.join(art, "pixel_q_normal_angry_cycle_v4.png"), sheet(normal.angry, 4));
  writePng(path.join(art, "pixel_q_dark_angry_cycle_v4.png"), sheet(dark.angry, 4));
  writePng(path.join(art, "pixel_q_sad_cycle_v4.png"), sheet([...normal.sad, ...dark.sad], 4));
  writePng(path.join(art, "pixel_q_normal_happy_v4.png"), sheet(normal.happy, 4));
  writePng(path.join(art, "pixel_q_dark_happy_v4.png"), sheet(dark.happy, 4));
}

function decodePacked(buf) {
  let offset = 8;
  const parts = [];
  let w = 0;
  let h = 0;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    offset += 4;
    const type = buf.subarray(offset, offset + 4).toString();
    offset += 4;
    const data = buf.subarray(offset, offset + len);
    offset += len + 4;
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    }
    if (type === "IDAT") parts.push(data);
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const rgba = Buffer.alloc(w * h * 4);
  let cursor = 0;
  for (let y = 0; y < h; y++) {
    cursor += 1;
    raw.copy(rgba, y * w * 4, cursor, cursor + w * 4);
    cursor += w * 4;
  }
  return { w, h, rgba };
}

if (process.argv.includes("--motions")) packNewMotions();
else main();
