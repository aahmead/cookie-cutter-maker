import type { Point, Trace } from "@/shared/trace";

/** A binary image: 1 where the pixel belongs to the shape. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Every closed boundary between set and unset pixels, as loops along pixel
 * edges. Outer boundaries and holes come out with opposite winding.
 */
function traceLoops(mask: Mask): Point[][] {
  const { width: w, height: h, data } = mask;
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1;
  const starts: number[] = [];
  const ends: number[] = [];
  const out = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (w + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = out.get(k);
    const index = starts.length;
    starts.push(k);
    ends.push(key(x1, y1));
    if (list) list.push(index);
    else out.set(k, [index]);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) add(x + 1, y, x, y);
      if (!at(x - 1, y)) add(x, y, x, y + 1);
      if (!at(x, y + 1)) add(x, y + 1, x + 1, y + 1);
      if (!at(x + 1, y)) add(x + 1, y + 1, x + 1, y);
    }
  const used = new Uint8Array(starts.length);
  const loops: Point[][] = [];
  const xy = (k: number): Point => [k % (w + 1), Math.floor(k / (w + 1))];
  for (let first = 0; first < starts.length; first++) {
    if (used[first]) continue;
    const loop: Point[] = [];
    let edge = first;
    while (!used[edge]) {
      used[edge] = 1;
      loop.push(xy(starts[edge]!));
      const [ax, ay] = xy(starts[edge]!);
      const [bx, by] = xy(ends[edge]!);
      const next = (out.get(ends[edge]!) ?? []).filter((e) => !used[e]);
      if (next.length === 0) break;
      // At a corner where two pixels touch diagonally, turn the same way
      // every time so the loops never cross.
      edge = next.reduce((best, e) => {
        const [cx, cy] = xy(ends[e]!);
        const turn = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
        const [qx, qy] = xy(ends[best]!);
        const bestTurn = (bx - ax) * (qy - by) - (by - ay) * (qx - bx);
        return turn > bestTurn ? e : best;
      });
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

function signedArea(path: Point[]): number {
  let sum = 0;
  for (let i = 0; i < path.length; i++) {
    const [x0, y0] = path[i]!;
    const [x1, y1] = path[(i + 1) % path.length]!;
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

function bounds(path: Point[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of path) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function pointInPolygon([x, y]: Point, path: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const [xi, yi] = path[i]!;
    const [xj, yj] = path[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** Douglas–Peucker on a closed loop. */
function simplify(path: Point[], tolerance: number): Point[] {
  if (path.length < 8) return path;
  const keep = new Uint8Array(path.length);
  const far = path.reduce(
    (best, p, i) =>
      (p[0] - path[0]![0]) ** 2 + (p[1] - path[0]![1]) ** 2 > best.d
        ? { i, d: (p[0] - path[0]![0]) ** 2 + (p[1] - path[0]![1]) ** 2 }
        : best,
    { i: 0, d: -1 },
  ).i;
  const stack: [number, number][] = [
    [0, far],
    [far, path.length],
  ];
  keep[0] = 1;
  keep[far] = 1;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = path[a]!;
    const [bx, by] = path[b % path.length]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1;
    let worstD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = path[i]!;
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > worstD) {
        worst = i;
        worstD = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

/** One round of corner cutting: softens the pixel steps. */
function smooth(path: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < path.length; i++) {
    const [x0, y0] = path[i]!;
    const [x1, y1] = path[(i + 1) % path.length]!;
    out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
    out.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
  }
  return out;
}

const tidy = (path: Point[]) => smooth(simplify(path, 0.8));

/**
 * The outer outline (the largest shape of the silhouette) and the interior
 * paths: every boundary of the detail mask inside it, except the outline
 * itself. Null when nothing is found.
 */
export function traceMasks(silhouette: Mask, detail: Mask): Trace | null {
  const shapes = traceLoops(silhouette);
  if (!shapes.length) return null;
  const outlineRaw = shapes.reduce((a, b) =>
    Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a,
  );
  const outlineArea = Math.abs(signedArea(outlineRaw));
  if (outlineArea < 30) return null;
  const ob = bounds(outlineRaw);
  const detailLoops = detail === silhouette ? shapes : traceLoops(detail);
  const minArea = Math.max(8, outlineArea * 0.0004);
  const interiorRaw = detailLoops
    .filter((loop) => loop !== outlineRaw)
    .filter((loop) => {
      const area = Math.abs(signedArea(loop));
      if (area < minArea) return false;
      const b = bounds(loop);
      const sameAsOutline =
        Math.abs(b.minX - ob.minX) < 3 &&
        Math.abs(b.maxX - ob.maxX) < 3 &&
        Math.abs(b.minY - ob.minY) < 3 &&
        Math.abs(b.maxY - ob.maxY) < 3 &&
        Math.abs(area - outlineArea) < outlineArea * 0.03;
      if (sameAsOutline) return false;
      const step = Math.max(1, Math.floor(loop.length / 8));
      let inside = 0;
      let total = 0;
      for (let i = 0; i < loop.length; i += step) {
        total++;
        if (pointInPolygon(loop[i]!, outlineRaw)) inside++;
      }
      return inside * 2 > total;
    })
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))
    .slice(0, 300);
  const scale = 1 / Math.max(ob.maxX - ob.minX, ob.maxY - ob.minY);
  const norm = (path: Point[]): Point[] =>
    tidy(path).map(([x, y]) => [
      round((x - ob.minX) * scale),
      round((y - ob.minY) * scale),
    ]);
  return {
    outline: norm(outlineRaw),
    interior: interiorRaw.map(norm).filter((p) => p.length >= 3),
  };
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;
