// Generates public/icon-192.png and public/icon-512.png
// Dark background (#0d0d0d) with orange dot (#e8440a) — minimal valid PNG
import * as zlib from "zlib";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";

const deflate = promisify(zlib.deflate);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

async function generatePNG(size, outputPath) {
  const w = size, h = size;
  const cx = w / 2, cy = h / 2;
  const dotR = size * 0.24;
  // inner "P" implied by two concentric circles
  const innerR = size * 0.10;

  const raw = Buffer.alloc(h * (1 + w * 3));

  for (let y = 0; y < h; y++) {
    const rowOff = y * (1 + w * 3);
    raw[rowOff] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const off = rowOff + 1 + x * 3;
      if (dist <= innerR) {
        // white center
        raw[off] = 255; raw[off + 1] = 255; raw[off + 2] = 255;
      } else if (dist <= dotR) {
        // pulse orange
        raw[off] = 232; raw[off + 1] = 68; raw[off + 2] = 10;
      } else {
        // ink dark
        raw[off] = 13; raw[off + 1] = 13; raw[off + 2] = 13;
      }
    }
  }

  const compressed = await deflate(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // RGB

  const png = Buffer.concat([
    sig,
    pngChunk("IHDR", ihdrData),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, png);
  console.log(`✓ ${path.basename(outputPath)}  (${png.length} bytes)`);
}

const pub = path.join(__dirname, "..", "public");
await generatePNG(192, path.join(pub, "icon-192.png"));
await generatePNG(512, path.join(pub, "icon-512.png"));
