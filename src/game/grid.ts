/**
 * Grid layout + expansion economy — docs §03 (constants/grid.ts mirror).
 * The garden is a square grid; plots are indexed row-major 0..(n*n-1).
 */
export type GridExpansion = {
  gridSize: number; // side length (2..6)
  cost: number; // $BLOOM to expand TO this size
  levelRequired: number;
};

export const GRID_EXPANSIONS: GridExpansion[] = [
  { gridSize: 2, cost: 0, levelRequired: 1 },
  { gridSize: 3, cost: 500, levelRequired: 5 },
  { gridSize: 4, cost: 1500, levelRequired: 10 },
  { gridSize: 5, cost: 3000, levelRequired: 18 },
  { gridSize: 6, cost: 5000, levelRequired: 25 },
];

export const MIN_GRID_SIZE = 2;
export const MAX_GRID_SIZE = 6;

export function plotCount(gridSize: number): number {
  return gridSize * gridSize;
}

export function getExpansion(gridSize: number): GridExpansion | undefined {
  return GRID_EXPANSIONS.find((e) => e.gridSize === gridSize);
}

/** Row/col for a row-major index within a square grid. */
export function indexToCoord(index: number, gridSize: number): { row: number; col: number } {
  return { row: Math.floor(index / gridSize), col: index % gridSize };
}

export function coordToIndex(row: number, col: number, gridSize: number): number {
  return row * gridSize + col;
}

/** Orthogonally-adjacent plot indices (Manhattan radius 1). */
export function neighbors4(index: number, gridSize: number): number[] {
  const { row, col } = indexToCoord(index, gridSize);
  const out: number[] = [];
  const deltas: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of deltas) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) out.push(coordToIndex(r, c, gridSize));
  }
  return out;
}

/**
 * Indices within Manhattan distance `radius` of `center` (excluding center).
 * `radius === Infinity` covers the entire grid (Godly sprinkler).
 */
export function manhattanCoverage(center: number, radius: number, gridSize: number): number[] {
  const { row, col } = indexToCoord(center, gridSize);
  const out: number[] = [];
  for (let i = 0; i < plotCount(gridSize); i++) {
    if (i === center) continue;
    const { row: r, col: c } = indexToCoord(i, gridSize);
    const dist = Math.abs(r - row) + Math.abs(c - col);
    if (dist <= radius) out.push(i);
  }
  return out;
}
