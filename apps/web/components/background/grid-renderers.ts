import {
  createOrthogonalEdges,
  hashCell,
  linearFalloff,
  quadraticFalloff,
  type GridEdge,
} from "./grid-background-core";

export interface CanvasSize { width: number; height: number }
export interface PointerState { x: number; y: number; active: boolean }
export interface GridFrame { time: number; pointer: PointerState; isStatic: boolean }

export const BLINKING_CONFIG = {
  bgColor: "#ffffff",
  cellColor: "#315c4c",
  cellDivisions: 34,
  gap: 1.5,
  maxAlpha: 0.14,
  hoverBoost: 0.14,
  hoverRadiusFactor: 0.3,
};

type BlinkingConfig = typeof BLINKING_CONFIG;
interface BlinkingCell {
  x: number; y: number; centerX: number; centerY: number;
  size: number; phase: number; speed: number;
}
export interface BlinkingScene {
  size: CanvasSize;
  config: BlinkingConfig;
  cells: BlinkingCell[];
}

export function createBlinkingScene(size: CanvasSize, config: BlinkingConfig): BlinkingScene {
  const pitch = Math.max(8, Math.min(size.width, size.height) / config.cellDivisions);
  const cellSize = Math.max(1, pitch - config.gap);
  const cols = Math.ceil(size.width / pitch);
  const rows = Math.ceil(size.height / pitch);
  const cells: BlinkingCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const hash = hashCell(col, row);
      cells.push({
        x: col * pitch,
        y: row * pitch,
        centerX: col * pitch + cellSize / 2,
        centerY: row * pitch + cellSize / 2,
        size: cellSize,
        phase: hash * Math.PI * 2,
        speed: 0.35 + hashCell(row + 41, col + 73) * 0.8,
      });
    }
  }
  return { size, config, cells };
}

function resolvePointer(size: CanvasSize, frame: GridFrame): PointerState {
  if (frame.pointer.active) return frame.pointer;
  if (frame.isStatic) return { x: size.width / 2, y: size.height / 2, active: false };
  return {
    x: size.width * (0.5 + Math.sin(frame.time * 0.19) * 0.32),
    y: size.height * (0.5 + Math.cos(frame.time * 0.13) * 0.28),
    active: false,
  };
}

export function drawBlinkingFrame(
  ctx: CanvasRenderingContext2D,
  scene: BlinkingScene,
  frame: GridFrame,
): void {
  const { size, config } = scene;
  const pointer = resolvePointer(size, frame);
  const hoverRadius = Math.min(size.width, size.height) * config.hoverRadiusFactor;
  ctx.globalAlpha = 1;
  ctx.fillStyle = config.bgColor;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.fillStyle = config.cellColor;
  for (const cell of scene.cells) {
    const wave = frame.isStatic ? 0.5 : Math.max(0, Math.sin(frame.time * cell.speed + cell.phase)) ** 2;
    const distance = Math.hypot(cell.centerX - pointer.x, cell.centerY - pointer.y);
    const hover = linearFalloff(distance, hoverRadius) * config.hoverBoost;
    ctx.globalAlpha = Math.min(config.maxAlpha + config.hoverBoost, wave * config.maxAlpha + hover);
    ctx.fillRect(cell.x, cell.y, cell.size, cell.size);
  }
  ctx.globalAlpha = 1;
}

export const KINETIC_CONFIG = {
  bgColor: "#ffffff",
  lineColor: "#315c4c",
  dotColor: "#315c4c",
  cols: 28,
  rows: 17,
  wobbleAmp: 0.11,
  pointerRadiusFactor: 0.4,
  pushStrength: 1.2,
  lineBaseAlpha: 0.08,
  lineMaxAlpha: 0.42,
};

type KineticConfig = typeof KINETIC_CONFIG;
export interface KineticScene {
  size: CanvasSize;
  config: KineticConfig;
  edges: GridEdge[];
  baseX: Float32Array; baseY: Float32Array; phase: Float32Array;
  dots: Uint8Array; x: Float32Array; y: Float32Array; spacing: number;
}

export function createKineticScene(size: CanvasSize, config: KineticConfig): KineticScene {
  const count = config.cols * config.rows;
  const baseX = new Float32Array(count);
  const baseY = new Float32Array(count);
  const phase = new Float32Array(count);
  const dots = new Uint8Array(count);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const stepX = config.cols > 1 ? size.width / (config.cols - 1) : size.width;
  const stepY = config.rows > 1 ? size.height / (config.rows - 1) : size.height;
  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.cols; col += 1) {
      const index = row * config.cols + col;
      baseX[index] = col * stepX;
      baseY[index] = row * stepY;
      phase[index] = hashCell(col, row) * Math.PI * 2;
      dots[index] = hashCell(col + 17, row + 29) < 0.4 ? 1 : 0;
    }
  }
  return {
    size, config, edges: createOrthogonalEdges(config.cols, config.rows),
    baseX, baseY, phase, dots, x, y, spacing: Math.min(stepX, stepY),
  };
}

export function drawKineticFrame(
  ctx: CanvasRenderingContext2D,
  scene: KineticScene,
  frame: GridFrame,
): void {
  const { size, config } = scene;
  const pointer = resolvePointer(size, frame);
  const pointerRadius = Math.min(size.width, size.height) * config.pointerRadiusFactor;
  const wobble = scene.spacing * config.wobbleAmp;
  ctx.globalAlpha = 1;
  ctx.fillStyle = config.bgColor;
  ctx.fillRect(0, 0, size.width, size.height);

  for (let index = 0; index < scene.baseX.length; index += 1) {
    const phase = scene.phase[index]!;
    let x = scene.baseX[index]!;
    let y = scene.baseY[index]!;
    if (!frame.isStatic) {
      x += Math.sin(frame.time * 0.37 + phase) * wobble;
      y += Math.cos(frame.time * 0.31 + phase) * wobble;
    }
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0 && distance < pointerRadius) {
      const push = quadraticFalloff(distance, pointerRadius) * scene.spacing * config.pushStrength;
      x += (dx / distance) * push;
      y += (dy / distance) * push;
    }
    scene.x[index] = x;
    scene.y[index] = y;
  }

  ctx.strokeStyle = config.lineColor;
  ctx.lineWidth = 1;
  for (const [from, to] of scene.edges) {
    const midX = (scene.x[from]! + scene.x[to]!) / 2;
    const midY = (scene.y[from]! + scene.y[to]!) / 2;
    const glow = quadraticFalloff(Math.hypot(midX - pointer.x, midY - pointer.y), pointerRadius);
    ctx.globalAlpha = config.lineBaseAlpha + glow * (config.lineMaxAlpha - config.lineBaseAlpha);
    ctx.beginPath();
    ctx.moveTo(scene.x[from]!, scene.y[from]!);
    ctx.lineTo(scene.x[to]!, scene.y[to]!);
    ctx.stroke();
  }

  ctx.fillStyle = config.dotColor;
  for (let index = 0; index < scene.x.length; index += 1) {
    const glow = quadraticFalloff(Math.hypot(scene.x[index]! - pointer.x, scene.y[index]! - pointer.y), pointerRadius);
    ctx.globalAlpha = Math.min(0.6, 0.14 + glow * 0.46);
    ctx.beginPath();
    ctx.arc(scene.x[index]!, scene.y[index]!, scene.dots[index] ? 1.45 : 0.65, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
