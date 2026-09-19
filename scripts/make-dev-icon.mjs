// Original IDG development icon: a simple download arrow, no third-party assets.
// ICO contains a 32-bit BMP; keep this script to reproduce the resource exactly.
import { mkdirSync, writeFileSync } from "node:fs";
const size = 32,
  pixels = size * size * 4,
  mask = size * 4;
const dib = Buffer.alloc(40 + pixels + mask);
dib.writeUInt32LE(40);
dib.writeInt32LE(size, 4);
dib.writeInt32LE(size * 2, 8);
dib.writeUInt16LE(1, 12);
dib.writeUInt16LE(32, 14);
dib.writeUInt32LE(pixels, 20);
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const arrow =
      (x >= 14 && x <= 17 && y >= 7 && y <= 21) ||
      (y >= 16 && y <= 23 && Math.abs(x - 15.5) <= 23 - y) ||
      (y >= 26 && y <= 27 && x >= 8 && x <= 23);
    const i = 40 + ((size - 1 - y) * size + x) * 4;
    dib.set(arrow ? [239, 235, 232, 255] : [24, 22, 21, 255], i);
  }
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = size;
header[7] = size;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(dib.length, 14);
header.writeUInt32LE(22, 18);
mkdirSync("apps/desktop/src-tauri/icons", { recursive: true });
writeFileSync(
  "apps/desktop/src-tauri/icons/icon.ico",
  Buffer.concat([header, dib]),
);
