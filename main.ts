// SOLMARA — a travel poster for a place that does not exist.
// A program that draws one travel poster to /output/entry.png.
// Node 22, standard library only. No network. Fully deterministic.
//
// The place: SOLMARA, a lagoon island where the sea keeps the sun.
// Its landmark is the Halo Arch — a giant ring of rose stone standing
// in the lagoon, framing the setting sun. Come for the light that
// never quite leaves; stay for the warm water and the quiet.

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- canvas
type RGB = [number, number, number];

const px = Buffer.alloc(W * H * 3);

function set(x: number, y: number, c: RGB): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function get(x: number, y: number): RGB {
  const i = (y * W + x) * 3;
  return [px[i], px[i + 1], px[i + 2]];
}

function blend(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Blend colour c over the pixel at (x, y) with opacity alpha (0..1).
function over(x: number, y: number, c: RGB, alpha: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || alpha <= 0) return;
  if (alpha >= 1) {
    set(x, y, c);
    return;
  }
  set(x, y, blend(get(x, y), c, alpha));
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) set(x, y, c);
  }
}

// Vertical gradient over rows y0..y1, through the given colour stops.
function vgrad(y0: number, y1: number, stops: RGB[]): void {
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    const lt = t * (stops.length - 1) - seg;
    const c = blend(stops[seg], stops[seg + 1], lt);
    for (let x = 0; x < W; x++) set(x, y, c);
  }
}

function disc(cx: number, cy: number, r: number, c: RGB, alpha = 1): void {
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) over(x, y, c, alpha);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, alpha = 1): void {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) over(x, y, c, alpha);
    }
  }
}

// Filled polygon (scanline fill).
function poly(points: [number, number][], c: RGB): void {
  let minY = H - 1;
  let maxY = 0;
  for (const [, y] of points) {
    minY = Math.min(minY, Math.floor(y));
    maxY = Math.max(maxY, Math.ceil(y));
  }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
        set(x, y, c);
      }
    }
  }
}

// Thick line drawn as a chain of small discs.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
  }
}

// Deterministic pseudo-random generator (fixed seed).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows of 5 bits, "#" = on.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawText(s: string, cx: number, y: number, scale: number, c: RGB): void {
  let x = Math.round(cx - textWidth(s, scale) / 2);
  for (const ch of s.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "1") {
          fillRect(x + col * scale, y + row * scale, x + col * scale + scale - 1, y + row * scale + scale - 1, c);
        }
      }
    }
    x += 6 * scale;
  }
}

// Draw text with a soft offset shadow for legibility.
function drawTextShadowed(s: string, cx: number, y: number, scale: number, c: RGB, shadow: RGB, dx = 3, dy = 4): void {
  drawText(s, cx + dx, y + dy, scale, shadow);
  drawText(s, cx, y, scale, c);
}

// ---------------------------------------------------------------- scene
const HORIZON = 580;
const SUN_X = 512;
const SUN_Y = 468;
const SUN_R = 108;
const ARCH_R_OUT = 212;
const ARCH_R_IN = 148;

const SKY: RGB[] = [
  [43, 27, 77], // deep indigo, top
  [96, 52, 110], // violet
  [198, 84, 110], // rose
  [238, 140, 92], // coral
  [247, 185, 92], // gold at the horizon
];
const SEA_TOP: RGB = [52, 122, 128];
const SEA_BOTTOM: RGB = [13, 42, 66];
const CREAM: RGB = [255, 243, 214];
const SHADOW: RGB = [46, 22, 58];
const STONE: RGB = [122, 59, 94];
const STONE_LIT: RGB = [206, 110, 96];
const STONE_DARK: RGB = [74, 34, 66];
const HEADLAND: RGB = [34, 18, 52];
const GOLD: RGB = [255, 214, 130];

function drawSky(): void {
  vgrad(0, HORIZON, SKY);
  // Early stars, fading toward the bright horizon.
  const rnd = mulberry32(20261121);
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * 300);
    const a = 0.25 + rnd() * 0.55;
    const s = rnd() < 0.12 ? 2 : 1;
    fillRect(x, y, x + s - 1, y + s - 1, blend(get(x, y), [255, 255, 255], a));
  }
  // Long soft clouds catching the sunset.
  ellipse(190, 238, 150, 15, [244, 158, 130], 0.5);
  ellipse(260, 252, 110, 11, [250, 190, 150], 0.45);
  ellipse(830, 300, 170, 16, [240, 150, 128], 0.5);
  ellipse(760, 316, 110, 11, [250, 196, 158], 0.4);
  ellipse(120, 400, 120, 12, [232, 130, 120], 0.35);
}

function drawSun(): void {
  // Warm glow around the sun: smooth radial falloff, computed per pixel
  // so no banding steps show.
  const GR = SUN_R + 230;
  for (let y = Math.max(0, SUN_Y - GR); y <= Math.min(H - 1, SUN_Y + GR); y++) {
    for (let x = Math.max(0, SUN_X - GR); x <= Math.min(W - 1, SUN_X + GR); x++) {
      const d = Math.hypot(x - SUN_X, y - SUN_Y);
      if (d <= SUN_R || d >= GR) continue;
      const t = 1 - (d - SUN_R) / (GR - SUN_R);
      over(x, y, [255, 176, 92], 0.38 * t * t);
    }
  }
  disc(SUN_X, SUN_Y, SUN_R, [255, 233, 168]);
  disc(SUN_X, SUN_Y, SUN_R - 14, [255, 244, 205]);
}

// The Halo Arch: a stone ring framing the sun.
function drawArch(): void {
  const cx = SUN_X;
  const cy = SUN_Y;
  for (let y = Math.max(0, Math.floor(cy - ARCH_R_OUT)); y <= Math.min(H - 1, Math.ceil(cy + ARCH_R_OUT)); y++) {
    for (let x = Math.max(0, Math.floor(cx - ARCH_R_OUT)); x <= Math.min(W - 1, Math.ceil(cx + ARCH_R_OUT)); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d < ARCH_R_IN || d > ARCH_R_OUT) continue;
      // Sunlit upper-left rim, shaded lower-right body.
      const ang = Math.atan2(dy, dx); // -PI..PI, -PI/2 is up
      let c: RGB = STONE;
      const rim = (d - ARCH_R_IN) / (ARCH_R_OUT - ARCH_R_IN);
      if (ang < -0.3 && ang > -2.9 && rim > 0.45) c = blend(STONE, STONE_LIT, 0.85);
      else if (ang > 0.4 && ang < 2.7) c = blend(STONE, STONE_DARK, 0.55);
      // Thin gold rim where the ring meets the sun.
      if (d < ARCH_R_IN + 5 && dy < 0) c = blend(c, GOLD, 0.55);
      set(x, y, c);
    }
  }
}

function drawSea(): void {
  vgrad(HORIZON, H - 1, [SEA_TOP, [30, 88, 104], SEA_BOTTOM]);
  // Sun path: shimmering gold on the water below the arch.
  const rnd = mulberry32(777);
  for (let y = HORIZON + 10; y < H - 60; y += 5) {
    const depth = (y - HORIZON) / (H - HORIZON);
    const half = 20 + depth * 110;
    const a = 0.42 * (1 - depth) + 0.05;
    let x = SUN_X - half;
    while (x < SUN_X + half) {
      const len = 8 + rnd() * 26;
      for (let xx = Math.floor(x); xx < Math.floor(x + len) && xx < SUN_X + half; xx++) {
        over(xx, y, GOLD, a * (0.4 + rnd() * 0.6));
      }
      x += len + 8 + rnd() * 22;
    }
  }
  // Gentle wave lines.
  for (let i = 0; i < 26; i++) {
    const y = HORIZON + 24 + i * 15;
    const x0 = 60 + ((i * 137) % 700);
    const len = 40 + ((i * 53) % 90);
    thickLine(x0, y, x0 + len, y, 2, [120, 190, 190]);
    // (alpha is baked in by drawing over the sea with a mid tone)
  }
}

function drawBoat(): void {
  // A small sailboat drifting on the lagoon, left of the sun path.
  const bx = 300;
  const by = 700;
  poly(
    [
      [bx - 34, by],
      [bx + 34, by],
      [bx + 22, by + 12],
      [bx - 22, by + 12],
    ],
    [30, 16, 44],
  );
  poly(
    [
      [bx, by - 52],
      [bx, by - 2],
      [bx + 30, by - 2],
    ],
    CREAM,
  );
  poly(
    [
      [bx - 4, by - 40],
      [bx - 4, by - 2],
      [bx - 26, by - 2],
    ],
    [238, 170, 140],
  );
  thickLine(bx, by - 56, bx, by, 3, [30, 16, 44]);
}

function drawHeadlands(): void {
  // Left headland.
  poly(
    [
      [0, H],
      [0, 880],
      [90, 830],
      [210, 872],
      [300, 940],
      [330, H],
    ],
    HEADLAND,
  );
  // Right headland, with palms.
  poly(
    [
      [W, H],
      [W, 862],
      [930, 822],
      [820, 868],
      [730, 936],
      [700, H],
    ],
    HEADLAND,
  );
  drawPalm(872, 836, 1.0);
  drawPalm(918, 852, 0.72);
  drawPalm(790, 872, 0.55);
}

function drawPalm(x: number, y: number, s: number): void {
  const topX = x + 14 * s;
  const topY = y - 78 * s;
  thickLine(x, y, topX, topY, Math.max(3, 7 * s), HEADLAND);
  // Drooping fronds: smooth quadratic curves, outward then down.
  const fronds: [number, number, number, number][] = [
    [-56, -8, -64, 16],
    [-48, -30, -60, -6],
    [-28, -42, -36, -12],
    [-4, -44, -6, -14],
    [24, -38, 32, -8],
    [46, -22, 58, 6],
    [54, 0, 62, 24],
  ];
  for (const [mx, my, ex, ey] of fronds) {
    let px0 = topX;
    let py0 = topY;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const qx = (1 - t) * (1 - t) * topX + 2 * (1 - t) * t * (topX + mx * s) + t * t * (topX + ex * s);
      const qy = (1 - t) * (1 - t) * topY + 2 * (1 - t) * t * (topY + my * s) + t * t * (topY + ey * s);
      thickLine(px0, py0, qx, qy, Math.max(2, 3.5 * s), HEADLAND);
      px0 = qx;
      py0 = qy;
    }
  }
  disc(topX, topY + 4 * s, Math.max(3, 5 * s), HEADLAND);
}

function drawBirds(): void {
  const rnd = mulberry32(4242);
  for (let i = 0; i < 7; i++) {
    const x = 120 + rnd() * 780;
    const y = 180 + rnd() * 180;
    const s = 7 + rnd() * 7;
    thickLine(x - s, y, x, y - s * 0.55, 3, [40, 20, 52]);
    thickLine(x, y - s * 0.55, x + s, y, 3, [40, 20, 52]);
  }
}

function drawFrame(): void {
  // Classic poster double rule.
  const m = 26;
  const c: RGB = CREAM;
  for (let i = 0; i < 3; i++) {
    for (let x = m; x < W - m; x++) {
      set(x, m + i, c);
      set(x, H - 1 - m - i, c);
    }
    for (let y = m; y < H - m; y++) {
      set(m + i, y, c);
      set(W - 1 - m - i, y, c);
    }
  }
}

function drawScene(): void {
  drawSky();
  drawSun();
  drawArch();
  drawSea();
  drawBoat();
  drawHeadlands();
  drawBirds();
  // Type, set with intent: the name rides the sky, the promise rides the sea.
  drawTextShadowed("SOLMARA", W / 2, 78, 13, CREAM, SHADOW);
  // Thin gold rules flanking the tagline.
  const tagY = 936;
  const tagW = textWidth("WHERE THE SEA KEEPS THE SUN", 4);
  const ruleY = tagY + 14;
  for (let x = W / 2 - tagW / 2 - 90; x < W / 2 - tagW / 2 - 18; x++) set(Math.round(x), ruleY, GOLD);
  for (let x = W / 2 + tagW / 2 + 18; x < W / 2 + tagW / 2 + 90; x++) set(Math.round(x), ruleY, GOLD);
  drawTextShadowed("WHERE THE SEA KEEPS THE SUN", W / 2, tagY, 4, CREAM, SHADOW, 2, 3);
  drawFrame();
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function encodePNG(): Buffer {
  const stride = W * 3;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- main
drawScene();
const png = encodePNG();
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/entry.png`, png);
console.log(`wrote ${outDir}/entry.png (${png.length} bytes, ${W}x${H})`);
