import { createDeflate } from "zlib";
import { writeFileSync } from "fs";
import { promisify } from "util";
import { deflate } from "zlib";

const deflateAsync = promisify(deflate);

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

async function makePNG(size) {
  const cx = size / 2, cy = size / 2, r = size / 2;

  // background: #1C1714 = (28,23,20)
  const BG = [28, 23, 20];
  // leaf color: #F2EDE7 = (242,237,231)
  const FG = [242, 237, 231];

  const pixels = new Uint8Array(size * size * 4);

  // Fill with transparent
  pixels.fill(0);

  // Draw circle
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Anti-alias: soft edge
      const alpha = Math.max(0, Math.min(1, r - dist));
      const i = (y * size + x) * 4;
      pixels[i]     = BG[0];
      pixels[i + 1] = BG[1];
      pixels[i + 2] = BG[2];
      pixels[i + 3] = clamp(alpha * 255);
    }
  }

  // Draw leaf using SVG path approximation
  // Scale: lucide viewBox 0..24 → 0..size
  // Path 1: the main leaf shape (polygon approximation)
  // M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z
  // Path 2: the stem M2 21c0-3 1.85-5.36 5.08-6

  const scale = size / 24;

  function drawStroke(path, lineWidth) {
    // Rasterize polyline with lineWidth
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.ceil(len * 2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = x1 + dx * t, py = y1 + dy * t;
        // Draw a circle of radius lineWidth/2 at (px, py)
        const hw = lineWidth / 2;
        const x0 = Math.floor(px - hw - 1), xe = Math.ceil(px + hw + 1);
        const y0 = Math.floor(py - hw - 1), ye = Math.ceil(py + hw + 1);
        for (let qy = y0; qy <= ye; qy++) {
          for (let qx = x0; qx <= xe; qx++) {
            if (qx < 0 || qy < 0 || qx >= size || qy >= size) continue;
            const d = Math.sqrt((qx - px) ** 2 + (qy - py) ** 2);
            const a = Math.max(0, Math.min(1, hw - d + 0.5));
            if (a <= 0) continue;
            const idx = (qy * size + qx) * 4;
            // Check this pixel is inside circle first
            const circ = Math.sqrt((qx - cx) ** 2 + (qy - cy) ** 2);
            if (circ > r - 0.5) continue;
            // Blend over existing
            const existA = pixels[idx + 3] / 255;
            const newA = a;
            const outA = newA + existA * (1 - newA);
            if (outA < 0.001) continue;
            pixels[idx]     = clamp((FG[0] * newA + pixels[idx]     * existA * (1 - newA)) / outA);
            pixels[idx + 1] = clamp((FG[1] * newA + pixels[idx + 1] * existA * (1 - newA)) / outA);
            pixels[idx + 2] = clamp((FG[2] * newA + pixels[idx + 2] * existA * (1 - newA)) / outA);
            pixels[idx + 3] = clamp(outA * 255);
          }
        }
      }
    }
  }

  const lw = size * (1.8 / 24);

  // Approximate the leaf path with polyline points (in pixel coords)
  const leaf = [
    [11, 20], [9.8, 16], [9, 12], [9.2, 9], [9.8, 6.1],
    [12, 5.5], [14, 5.2], [15.5, 5], [17, 4.48], [18, 3.5], [19, 2],
    [20, 4], [21, 6.18], [21, 10],
    [20, 13], [18.5, 15.5], [16, 17.5], [13.5, 19], [11, 20]
  ].map(([x, y]) => [x * scale, y * scale]);

  const stem = [
    [2, 21], [3, 19.5], [4, 18.3], [5.08, 15]
  ].map(([x, y]) => [x * scale, y * scale]);

  drawStroke(leaf, lw);
  drawStroke(stem, lw);

  // Encode as PNG
  const width = size, height = size;
  const chunks = [];

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    const table = crc32.table || (crc32.table = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let v = i;
        for (let j = 0; j < 8; j++) v = (v & 1) ? (0xEDB88320 ^ (v >>> 1)) : (v >>> 1);
        t[i] = v;
      }
      return t;
    })());
    for (const b of buf) c = table[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.concat([typeBytes, data]);
    const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf));
    return Buffer.concat([len, typeBytes, data, crcVal]);
  }

  // PNG signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(chunk("IHDR", ihdr));

  // IDAT: build raw scanlines
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 4)] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + width * 4) + 1 + x * 4;
      scanlines[dst]     = pixels[src];
      scanlines[dst + 1] = pixels[src + 1];
      scanlines[dst + 2] = pixels[src + 2];
      scanlines[dst + 3] = pixels[src + 3];
    }
  }

  const compressed = await deflateAsync(scanlines, { level: 9 });
  chunks.push(chunk("IDAT", compressed));
  chunks.push(chunk("IEND", Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

const png192 = await makePNG(192);
writeFileSync("client/public/logo.png", png192);

const png512 = await makePNG(512);
writeFileSync("client/public/favicon-512.png", png512);

const png32 = await makePNG(32);
writeFileSync("client/public/favicon.png", png32);

console.log("Favicon PNGs generated.");
