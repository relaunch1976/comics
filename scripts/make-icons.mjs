// PWA用のアイコンPNGを生成する。
//
// 画像ライブラリを足したくないので、Node標準の zlib だけで PNG を書き出す。
// 図柄は「積まれた背表紙。右の1冊だけ低い」= 未読の巻がある状態。
//
//   node scripts/make-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../public/icons/", import.meta.url));

const ACCENT = [0xb4, 0x46, 0x2a, 0xff]; // --accent
const CREAM = [0xfb, 0xfb, 0xfa, 0xff]; // --bg

// ---------------------------------------------------------------- PNG 書き出し

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA のピクセル配列を PNG バッファにする */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // 10-12: compression / filter / interlace = 0

  // 各スキャンラインの先頭にフィルタ種別 0 を置く
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 描画

function canvas(size, fill) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) buf.set(fill, i * 4);
  return buf;
}

/** 角丸の矩形を塗る。境界は4x4のスーパーサンプリングで滑らかにする */
function roundedRect(buf, size, x0, y0, w, h, r, color) {
  const inside = (px, py) => {
    if (px < x0 || px > x0 + w || py < y0 || py > y0 + h) return false;
    const cx = Math.min(Math.max(px, x0 + r), x0 + w - r);
    const cy = Math.min(Math.max(py, y0 + r), y0 + h - r);
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= r * r;
  };

  const yTop = Math.max(0, Math.floor(y0));
  const yBottom = Math.min(size - 1, Math.ceil(y0 + h));
  const xLeft = Math.max(0, Math.floor(x0));
  const xRight = Math.min(size - 1, Math.ceil(x0 + w));

  for (let y = yTop; y <= yBottom; y++) {
    for (let x = xLeft; x <= xRight; x++) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++)
          if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits++;
      if (hits === 0) continue;

      const a = hits / 16;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++)
        buf[i + c] = Math.round(buf[i + c] * (1 - a) + color[c] * a);
      buf[i + 3] = 255;
    }
  }
}

/**
 * 背表紙3本。右の1本だけ低い（＝未読の巻がある）
 * padding はアイコンの余白の割合。マスカブル用は大きめにする
 */
function drawIcon(size, padding) {
  const buf = canvas(size, ACCENT);

  const pad = size * padding;
  const inner = size - pad * 2;
  const gap = inner * 0.11;
  const barW = (inner - gap * 2) / 3;
  const radius = barW * 0.22;

  const heights = [1, 1, 0.6]; // 3本目だけ低い
  const bottom = pad + inner;

  for (let i = 0; i < 3; i++) {
    const h = inner * heights[i];
    roundedRect(
      buf,
      size,
      pad + i * (barW + gap),
      bottom - h,
      barW,
      h,
      radius,
      CREAM,
    );
  }
  return buf;
}

// ---------------------------------------------------------------- 出力

mkdirSync(OUT, { recursive: true });

const targets = [
  { name: "icon-192.png", size: 192, padding: 0.17 },
  { name: "icon-512.png", size: 512, padding: 0.17 },
  // マスカブルは端が切り落とされるので余白を厚くする
  { name: "icon-maskable-512.png", size: 512, padding: 0.28 },
  // iOS はマニフェストのアイコンを見ず apple-touch-icon を使う
  { name: "apple-touch-icon.png", size: 180, padding: 0.17 },
];

for (const t of targets) {
  const png = encodePng(t.size, t.size, drawIcon(t.size, t.padding));
  writeFileSync(OUT + t.name, png);
  console.log(`${t.name}  ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)}KB`);
}
