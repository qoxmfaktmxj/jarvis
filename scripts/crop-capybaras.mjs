#!/usr/bin/env node
/**
 * crop-capybaras.mjs
 *
 * 4장의 Gemini 2×2 그리드 이미지를 16개 개별 원형 카피바라 아이콘으로 잘라낸다.
 *
 * 소스 매핑:
 *   gptpga → basic, onsen, reading, watermelon
 *   epir1x → surprise, bird, snorkel, cabbage
 *   qogaq4 → zen, armchair, garden, astronaut
 *   lu6d2n → chef, music, painter, diver
 *
 * 각 그리드의 각 셀에서 원형 영역을 트림해 512×512 투명 배경 PNG로 출력.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("C:/Users/sp20171217yw/Desktop/Devdev/jarvis/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");

// ─── 배경 투명 3×3 (7개) 이미지 전용 크롭 ─────────────────────────────────────
// C:/Users/sp20171217yw/Downloads/Gemini_Generated_Image_it4h0ait4h0ait4h.png
//   Row 1: diver · armchair · astronaut
//   Row 2: basic · bird · cabbage
//   Row 3: chef (col 0만)
async function processTransparentSheet() {
  const SRC_FILE = "C:/Users/sp20171217yw/Downloads/Gemini_Generated_Image_it4h0ait4h0ait4h.png";
  // 이 이미지는 실제로는 불투명이고 체크무늬 배경이 구워져 있음.
  // 1) 체크무늬 회색 (r≈g≈b ∈ [60,150])을 투명으로 변환
  // 2) 각 아이콘 영역을 수동 좌표로 extract
  // 3) trim으로 깔끔한 bbox 추출

  const meta = await sharp(SRC_FILE).metadata();
  const { width, height } = meta;
  console.log(`\n[transparent sheet] ${width}×${height}`);

  const { data, info } = await sharp(SRC_FILE).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const isGray = Math.abs(r - g) < 6 && Math.abs(g - b) < 6 && Math.abs(r - b) < 6;
    const gray = r >= 60 && r <= 150;
    const alpha = (isGray && gray) ? 0 : 255;
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = alpha;
  }
  const cleanedBuf = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();
  console.log(`  checker removed → transparent bg`);

  // 색상 기반 bbox 스캔 결과 (probe-capy-sheet.mjs):
  //   r1 y ≈ 64-689 (height 625, cy=376)
  //   r2 y ≈ 756-1274 + basic/cabbage 약간 늦음 → cy ≈ 1015-1039
  //   r3 y ≈ 1400-1880 (chef)
  //   col x centers ≈ 583, 1110, 1820
  // 각 icon은 원+환경(물고기/별 등)까지 포함 → bbox 더 넉넉히
  const CELLS = {
    diver:     { left: 80,   top: 60,   width: 800, height: 720 },
    armchair:  { left: 800,  top: 60,   width: 700, height: 720 },
    astronaut: { left: 1500, top: 60,   width: 630, height: 720 },
    basic:     { left: 180,  top: 780,  width: 700, height: 610 },
    bird:      { left: 880,  top: 700,  width: 500, height: 680 },
    cabbage:   { left: 1480, top: 780,  width: 700, height: 610 },
    chef:      { left: 120,  top: 1390, width: 780, height: 540 },
  };

  for (const [name, { left, top, width: w, height: h }] of Object.entries(CELLS)) {
    const cellBuf = await sharp(cleanedBuf)
      .extract({ left, top, width: w, height: h })
      .toBuffer();
    const trimmedBuf = await sharp(cellBuf).trim({ threshold: 10 }).toBuffer();
    const tMeta = await sharp(trimmedBuf).metadata();
    const sq = Math.round(Math.max(tMeta.width, tMeta.height) * 1.06);
    const padX = Math.floor((sq - tMeta.width) / 2);
    const padY = Math.floor((sq - tMeta.height) / 2);

    const outPath = path.join(
      "C:/Users/sp20171217yw/Desktop/Devdev/jarvis/apps/web/public/capybara",
      `${name}.png`
    );
    await sharp(trimmedBuf)
      .extend({
        top: padY,
        bottom: sq - tMeta.height - padY,
        left: padX,
        right: sq - tMeta.width - padX,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .resize(512, 512, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log(`  ${name}.png region=(${left},${top},${w}×${h}) trimmed=${tMeta.width}×${tMeta.height}`);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = "C:/Users/sp20171217yw/Downloads/jarvis/project";
const OUT = path.join(ROOT, "apps/web/public/capybara");

const sources = [
  {
    file: "Gemini_Generated_Image_gptpgagptpgagptp.png",
    layout: [
      ["basic", "onsen"],
      ["reading", "watermelon"],
    ],
  },
  {
    file: "Gemini_Generated_Image_epir1xepir1xepir.png",
    layout: [
      ["surprise", "bird"],
      ["snorkel", "cabbage"],
    ],
  },
  {
    file: "Gemini_Generated_Image_qogaq4qogaq4qoga (1).png",
    layout: [
      ["zen", "armchair"],
      ["garden", "astronaut"],
    ],
  },
  {
    file: "Gemini_Generated_Image_lu6d2nlu6d2nlu6d.png",
    layout: [
      ["chef", "music"],
      ["painter", "diver"],
    ],
  },
];

async function processFile(src) {
  const fullPath = path.join(SRC, src.file);
  const image = sharp(fullPath);
  const meta = await image.metadata();
  const { width, height } = meta;

  console.log(`\n[${src.file}] ${width}×${height}`);

  // 전략: 각 셀을 넓게 추출(좌우 2등분 + 상하 2등분) → 그 셀을 trim으로 불필요한 흰 배경 제거
  //   → 비정사각 결과를 padding해서 정사각으로 만든 뒤 512×512 리사이즈.
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const name = src.layout[row][col];

      const cellBuf = await sharp(fullPath)
        .extract({ left: col * halfW, top: row * halfH, width: halfW, height: halfH })
        .toBuffer();

      // trim으로 배경 제거 (배경이 밝고 일관되지 않을 수 있으니 threshold 크게)
      const trimmed = sharp(cellBuf).trim({
        background: { r: 245, g: 245, b: 245 },
        threshold: 30,
      });
      const trimmedBuf = await trimmed.toBuffer();
      const tMeta = await sharp(trimmedBuf).metadata();

      // 정사각 캔버스: 긴 변 기준 + 여분 패딩 5%
      const sq = Math.round(Math.max(tMeta.width, tMeta.height) * 1.05);
      const padX = Math.floor((sq - tMeta.width) / 2);
      const padY = Math.floor((sq - tMeta.height) / 2);

      const outPath = path.join(OUT, `${name}.png`);
      await sharp(trimmedBuf)
        .extend({
          top: padY,
          bottom: sq - tMeta.height - padY,
          left: padX,
          right: sq - tMeta.width - padX,
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .resize(512, 512, { fit: "cover" })
        .png({ compressionLevel: 9 })
        .toFile(outPath);
      const outMeta = await sharp(outPath).metadata();
      console.log(`  ${name}.png  trimmed=${tMeta.width}×${tMeta.height}  out=${outMeta.width}×${outMeta.height}`);
    }
  }
}

const mode = process.argv[2] ?? "all";

if (mode === "transparent" || mode === "all") {
  await processTransparentSheet();
}
if (mode === "all") {
  for (const src of sources) {
    await processFile(src);
  }
}

console.log("\n✓ done — capybara assets updated at apps/web/public/capybara/");
