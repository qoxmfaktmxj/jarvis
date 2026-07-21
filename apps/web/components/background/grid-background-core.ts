export type GridMode = "blinking" | "kinetic";
export type GridEdge = readonly [from: number, to: number];

export function hashCell(i: number, j: number): number {
  const value = Math.sin((i * 997 + j) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function linearFalloff(distance: number, radius: number): number {
  if (radius <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - distance / radius));
}

export function quadraticFalloff(distance: number, radius: number): number {
  return linearFalloff(distance, radius) ** 2;
}

export function createOrthogonalEdges(cols: number, rows: number): GridEdge[] {
  const edges: GridEdge[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      if (col + 1 < cols) edges.push([index, index + 1]);
      if (row + 1 < rows) edges.push([index, index + cols]);
    }
  }
  return edges;
}

export function nextGridMode(previous: GridMode | null, randomValue: number): GridMode {
  if (previous === "blinking") return "kinetic";
  if (previous === "kinetic") return "blinking";
  return randomValue < 0.5 ? "blinking" : "kinetic";
}

export function capDpr(value: number): number {
  return Math.min(2, Math.max(1, Number.isFinite(value) ? value : 1));
}
