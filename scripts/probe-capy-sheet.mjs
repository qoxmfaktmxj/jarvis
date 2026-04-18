import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("C:/Users/sp20171217yw/Desktop/Devdev/jarvis/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp");

const src = "C:/Users/sp20171217yw/Downloads/Gemini_Generated_Image_it4h0ait4h0ait4h.png";
const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
console.log("dims:", info.width, "×", info.height, "channels:", info.channels);

// A pixel is "background" if it's grayscale (|r-g|<5 && |g-b|<5) — checker pattern
function isBg(x, y) {
  const i = (y * info.width + x) * info.channels;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && Math.abs(r - b) < 10;
}

function runsAtY(y) {
  const runs = [];
  let inIcon = false,
    startX = 0;
  for (let x = 0; x < info.width; x++) {
    const bg = isBg(x, y);
    if (!bg && !inIcon) {
      inIcon = true;
      startX = x;
    } else if (bg && inIcon) {
      // Require 20 consecutive bg pixels to close the run (tolerate small gaps)
      let bgRun = 1;
      let xf = x + 1;
      while (xf < info.width && isBg(xf, y) && bgRun < 20) {
        bgRun++;
        xf++;
      }
      if (bgRun >= 20) {
        inIcon = false;
        runs.push([startX, x - 1]);
      }
    }
  }
  if (inIcon) runs.push([startX, info.width - 1]);
  return runs;
}

function runsAtX(x) {
  const runs = [];
  let inIcon = false,
    startY = 0;
  for (let y = 0; y < info.height; y++) {
    const bg = isBg(x, y);
    if (!bg && !inIcon) {
      inIcon = true;
      startY = y;
    } else if (bg && inIcon) {
      let bgRun = 1;
      let yf = y + 1;
      while (yf < info.height && isBg(x, yf) && bgRun < 20) {
        bgRun++;
        yf++;
      }
      if (bgRun >= 20) {
        inIcon = false;
        runs.push([startY, y - 1]);
      }
    }
  }
  if (inIcon) runs.push([startY, info.height - 1]);
  return runs;
}

console.log("\n--- Horizontal (through center of each row) ---");
for (const y of [383, 1100, 1720]) {
  const r = runsAtY(y);
  console.log(`y=${y}:`, r, "— widths:", r.map(([a, b]) => b - a));
}

console.log("\n--- Vertical (through each column) ---");
for (const x of [583, 1110, 1820]) {
  const r = runsAtX(x);
  console.log(`x=${x}:`, r, "— heights:", r.map(([a, b]) => b - a));
}
