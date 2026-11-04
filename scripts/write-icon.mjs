import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const size = 32;
const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  const row = y * (size * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < size; x += 1) {
    const dx = x - 15.5;
    const dy = y - 16.5;
    const inApple = dx * dx + dy * dy < 11.5 * 11.5 && y > 8;
    const leaf = Math.abs(x - 20) + Math.abs(y - 8) < 5 && y < 12 && x > 16;
    const o = row + 1 + x * 4;
    if (leaf) {
      raw[o] = 110; raw[o + 1] = 150; raw[o + 2] = 90; raw[o + 3] = 255;
    } else if (inApple) {
      const light = dx < -2 && dy < -2;
      raw[o] = light ? 255 : 196;
      raw[o + 1] = light ? 150 : 49;
      raw[o + 2] = light ? 140 : 60;
      raw[o + 3] = 255;
    }
  }
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length - 4, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(out);
