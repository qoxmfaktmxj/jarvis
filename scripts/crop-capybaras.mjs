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

for (const src of sources) {
  await processFile(src);
}

console.log("\n✓ done — 16 capybaras written to apps/web/public/capybara/");
