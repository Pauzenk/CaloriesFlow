import { writeFileSync } from "fs";
import { deflate as _deflate } from "zlib";

const deflateAsync = (buf, opts) => new Promise((res, rej) => _deflate(buf, opts, (e, d) => e ? rej(e) : res(d)));

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function cubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return [
    mt**3*p0[0] + 3*mt**2*t*p1[0] + 3*mt*t**2*p2[0] + t**3*p3[0],
    mt**3*p0[1] + 3*mt**2*t*p1[1] + 3*mt*t**2*p2[1] + t**3*p3[1],
  ];
}

// Arc segment approximation: sweep from angle a0 to a1 on circle (cx,cy,r)
function arcPoints(cx, cy, r, a0, a1, steps=20) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// Point-in-polygon (ray casting)
function pip(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// Build the lucide Leaf polygon in 24x24 space
// Path: M11 20 A7 7 0 0 1 9.8 6.1 C15.5 5,17 4.48,19 2 C20 4,21 6.18,21 10 C21 15.5,16.22 20,11 20 Z
function buildLeafPoly(size) {
  const S = size / 24;
  const STEPS = 30;
  const pts = [];

  // Arc from (11,20) to (9.8,6.1): r=7, sweep=1 (CW)
  // Compute arc center: midpoint method
  // For this specific arc (nearly vertical left edge of leaf), approximate with cubic bezier
  // Arc approximated as cubic: start (11,20), ctrl1 (10.4,16), ctrl2 (9.9,10), end (9.8,6.1)
  const arcSeg = { p0:[11,20], p1:[10.4,16], p2:[9.9,10], p3:[9.8,6.1] };
  for (let i = 0; i < STEPS; i++) {
    const [x,y] = cubicBezier(arcSeg.p0, arcSeg.p1, arcSeg.p2, arcSeg.p3, i/STEPS);
    pts.push([x*S, y*S]);
  }

  // C 15.5 5, 17 4.48, 19 2
  const seg2 = { p0:[9.8,6.1], p1:[15.5,5], p2:[17,4.48], p3:[19,2] };
  for (let i = 0; i < STEPS; i++) {
    const [x,y] = cubicBezier(seg2.p0, seg2.p1, seg2.p2, seg2.p3, i/STEPS);
    pts.push([x*S, y*S]);
  }

  // C 20 4, 21 6.18, 21 10
  const seg3 = { p0:[19,2], p1:[20,4], p2:[21,6.18], p3:[21,10] };
  for (let i = 0; i < STEPS; i++) {
    const [x,y] = cubicBezier(seg3.p0, seg3.p1, seg3.p2, seg3.p3, i/STEPS);
    pts.push([x*S, y*S]);
  }

  // C 21 15.5, 16.22 20, 11 20
  const seg4 = { p0:[21,10], p1:[21,15.5], p2:[16.22,20], p3:[11,20] };
  for (let i = 0; i <= STEPS; i++) {
    const [x,y] = cubicBezier(seg4.p0, seg4.p1, seg4.p2, seg4.p3, i/STEPS);
    pts.push([x*S, y*S]);
  }

  return pts;
}

// Stem: M2 21 C2 18, 3.85 15.64, 7.08 15
function buildStemPoly(size) {
  const S = size / 24;
  const STEPS = 20;
  const pts = [];
  const seg = { p0:[2,21], p1:[2,18], p2:[3.85,15.64], p3:[7.08,15] };
  for (let i = 0; i <= STEPS; i++) {
    pts.push(cubicBezier(seg.p0, seg.p1, seg.p2, seg.p3, i/STEPS).map(v=>v*S));
  }
  return pts;
}

function drawStroke(pixels, size, pathPts, lineWidth, color) {
  for (let i = 0; i < pathPts.length - 1; i++) {
    const [x1, y1] = pathPts[i], [x2, y2] = pathPts[i+1];
    const dx = x2-x1, dy = y2-y1;
    const steps = Math.max(1, Math.ceil(Math.sqrt(dx*dx+dy*dy)*2));
    for (let s = 0; s <= steps; s++) {
      const t = s/steps;
      const px = x1+dx*t, py = y1+dy*t;
      const hw = lineWidth/2;
      for (let qy = Math.floor(py-hw-1); qy <= Math.ceil(py+hw+1); qy++) {
        for (let qx = Math.floor(px-hw-1); qx <= Math.ceil(px+hw+1); qx++) {
          if (qx < 0 || qy < 0 || qx >= size || qy >= size) continue;
          const d = Math.sqrt((qx-px)**2+(qy-py)**2);
          const a = Math.max(0, Math.min(1, hw-d+0.5));
          if (a <= 0) continue;
          const idx = (qy*size+qx)*4;
          if (pixels[idx+3] < 10) continue;
          pixels[idx]   = clamp(color[0]*a + pixels[idx]  *(1-a));
          pixels[idx+1] = clamp(color[1]*a + pixels[idx+1]*(1-a));
          pixels[idx+2] = clamp(color[2]*a + pixels[idx+2]*(1-a));
          pixels[idx+3] = Math.max(pixels[idx+3], clamp(a*255));
        }
      }
    }
  }
}

async function makePNG(size) {
  const cx = size/2, cy = size/2, r = size/2;
  const BG = [28,23,20], FG = [242,237,231];
  const pixels = new Uint8Array(size*size*4);

  const leafPoly = buildLeafPoly(size);

  // The leaf is defined in 24x24 space but the circle is 0..size
  // The SVG has transform="translate(4.5,3.5) scale(0.95)" — replicate that
  const tx = 4.5*(size/32), ty = 3.5*(size/32), sc = 0.95;
  const transformedLeaf = leafPoly.map(([x,y]) => [x*sc + tx, y*sc + ty]);
  const stemPts = buildStemPoly(size).map(([x,y]) => [x*sc + tx, y*sc + ty]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x-cx, dy = y-cy;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const ca = Math.max(0, Math.min(1, r-dist+0.5));
      if (ca <= 0) continue;
      const i = (y*size+x)*4;
      // Circle background
      pixels[i]=BG[0]; pixels[i+1]=BG[1]; pixels[i+2]=BG[2]; pixels[i+3]=clamp(ca*255);
      // Filled leaf
      if (pip(x+0.5, y+0.5, transformedLeaf)) {
        pixels[i]=FG[0]; pixels[i+1]=FG[1]; pixels[i+2]=FG[2];
      }
    }
  }

  // Draw stem as stroke
  const stemWidth = Math.max(1, size*2.2/32);
  drawStroke(pixels, size, stemPts, stemWidth, FG);

  // PNG encode
  function crc32(buf) {
    const table = (() => {
      const t = new Uint32Array(256);
      for (let i=0;i<256;i++){let v=i;for(let j=0;j<8;j++)v=(v&1)?(0xEDB88320^(v>>>1)):(v>>>1);t[i]=v;}
      return t;
    })();
    let c = 0xFFFFFFFF;
    for (const b of buf) c = table[(c^b)&0xFF]^(c>>>8);
    return (c^0xFFFFFFFF)>>>0;
  }
  function chunk(type, data) {
    const tb = Buffer.from(type,"ascii"), len=Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const cb=Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb,data])));
    return Buffer.concat([len,tb,data,cb]);
  }

  const out = [Buffer.from([137,80,78,71,13,10,26,10])];
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8]=8; ihdr[9]=6;
  out.push(chunk("IHDR",ihdr));
  const sl=Buffer.alloc(size*(1+size*4));
  for(let y=0;y<size;y++){
    sl[y*(1+size*4)]=0;
    for(let x=0;x<size;x++){
      const src=(y*size+x)*4, dst=y*(1+size*4)+1+x*4;
      sl[dst]=pixels[src]; sl[dst+1]=pixels[src+1]; sl[dst+2]=pixels[src+2]; sl[dst+3]=pixels[src+3];
    }
  }
  const comp = await deflateAsync(sl,{level:9});
  out.push(chunk("IDAT",comp));
  out.push(chunk("IEND",Buffer.alloc(0)));
  return Buffer.concat(out);
}

const p32  = await makePNG(32);  writeFileSync("client/public/favicon.png",     p32);
const p192 = await makePNG(192); writeFileSync("client/public/logo.png",        p192);
const p512 = await makePNG(512); writeFileSync("client/public/favicon-512.png", p512);
console.log("Done.");
