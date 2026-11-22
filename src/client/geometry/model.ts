import ClipperLib from "clipper-lib";
import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
  Vector2,
} from "three";
import type { CutterSettings } from "@/shared/settings";
import type { Point, Trace } from "@/shared/trace";

type Paths = ClipperLib.Paths;

/** Clipper works in integers: one unit is a micrometre. */
const SCALE = 1000;
const ARC_TOLERANCE = 0.03 * SCALE;
const PROFILE_STEPS = 4;

/** The artwork's footprint in mm before the rim: width and height. */
export function footprint(trace: Trace, s: CutterSettings) {
  const { w, h } = traceSize(trace);
  const { sx, sy } = scales(w, h, s);
  return { width: w * sx, height: h * sy };
}

/** Overall width and height in mm, rim included. */
export function overallSize(trace: Trace, s: CutterSettings) {
  const { width, height } = footprint(trace, s);
  const rim = Math.max(s.handleWidth, bladeReach(s));
  return { width: width + 2 * rim, height: height + 2 * rim };
}

function bladeReach(s: CutterSettings) {
  return s.bladeThickness + (s.thicken ? s.thickenThickness : 0);
}

function traceSize(trace: Trace) {
  let w = 0;
  let h = 0;
  for (const [x, y] of trace.outline) {
    w = Math.max(w, x);
    h = Math.max(h, y);
  }
  return { w: w || 1, h: h || 1 };
}

function scales(w: number, h: number, s: CutterSettings) {
  if (s.sizeMode === "longest") {
    const k = s.size / Math.max(w, h);
    return { sx: k, sy: k };
  }
  return { sx: s.width / w, sy: s.height / h };
}

function toClipper(path: Point[], sx: number, sy: number, h: number) {
  return path.map(([x, y]) => ({
    X: Math.round(x * sx * SCALE),
    Y: Math.round((h - y) * sy * SCALE),
  }));
}

function offset(paths: Paths, mm: number, closedLine = false): Paths {
  const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE);
  co.AddPaths(
    paths,
    ClipperLib.JoinType.jtRound,
    closedLine
      ? ClipperLib.EndType.etClosedLine
      : ClipperLib.EndType.etClosedPolygon,
  );
  const out: Paths = [];
  co.Execute(out, mm * SCALE);
  return out;
}

function clip(subject: Paths, clipPaths: Paths, type: ClipperLib.ClipType) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
  const out: Paths = [];
  c.Execute(
    type,
    out,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  return out;
}

const difference = (a: Paths, b: Paths) =>
  clip(a, b, ClipperLib.ClipType.ctDifference);
const intersection = (a: Paths, b: Paths) =>
  clip(a, b, ClipperLib.ClipType.ctIntersection);

function toShapes(paths: Paths): Shape[] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(
    ClipperLib.ClipType.ctUnion,
    tree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  const shapes: Shape[] = [];
  const v = (path: ClipperLib.Path) =>
    path.map((p) => new Vector2(p.X / SCALE, p.Y / SCALE));
  const walk = (node: ClipperLib.PolyNode) => {
    for (const outer of node.Childs()) {
      const shape = new Shape(v(outer.Contour()));
      for (const hole of outer.Childs()) {
        shape.holes.push(new Shape(v(hole.Contour())));
        walk(hole);
      }
      shapes.push(shape);
    }
  };
  walk(tree);
  return shapes;
}

interface Slab {
  region: Paths;
  z0: number;
  z1: number;
}

/**
 * The printable model in mm: the handle rim sits on the print bed (z = 0)
 * and the cutting edge is at the top (z = blade depth).
 */
export function buildModel(trace: Trace, s: CutterSettings): BufferGeometry {
  const { w, h } = traceSize(trace);
  const { sx, sy } = scales(w, h, s);
  const outline = ClipperLib.Clipper.SimplifyPolygons(
    [toClipper(trace.outline, sx, sy, h)],
    ClipperLib.PolyFillType.pftNonZero,
  );
  const slabs: Slab[] = [];
  const t = s.bladeThickness;
  const reach = bladeReach(s);
  const ring = (width: number) => difference(offset(outline, width), outline);
  const imprint = s.type === "imprint";

  // The handle: a rim reaching outward, shaped by its profile. An imprint
  // cutter's rim also covers the inside, holding the imprint lines.
  for (let k = 0; k < PROFILE_STEPS; k++) {
    const f = k / PROFILE_STEPS;
    const full = s.handleWidth;
    const width =
      s.handleShape === "rectangle"
        ? full
        : s.handleShape === "chamfer"
          ? full - (full - reach) * f
          : reach + (full - reach) * Math.sqrt(1 - f * f);
    const region = imprint
      ? offset(outline, Math.max(width, reach))
      : ring(Math.max(width, reach));
    slabs.push({
      region,
      z0: (s.handleHeight * k) / PROFILE_STEPS,
      z1: (s.handleHeight * (k + 1)) / PROFILE_STEPS,
    });
    if (s.handleShape === "rectangle") {
      slabs[slabs.length - 1]!.z1 = s.handleHeight;
      break;
    }
  }

  // The blade, its optional thicker base and its optional sharp tip.
  const bladeTop = s.sharpTip ? s.bladeDepth - s.tipHeight : s.bladeDepth;
  slabs.push({ region: ring(t), z0: 0, z1: bladeTop });
  if (s.thicken)
    slabs.push({ region: ring(reach), z0: 0, z1: s.thickenDepth });
  if (s.sharpTip) {
    const steps = 3;
    for (let k = 0; k < steps; k++)
      slabs.push({
        region: ring(t - ((t - s.tipWidth) * (k + 1)) / steps),
        z0: bladeTop + (s.tipHeight * k) / steps,
        z1: bladeTop + (s.tipHeight * (k + 1)) / steps,
      });
  }

  // Imprint lines: ridges along each interior path, set back from the edge.
  if (imprint && trace.interior.length) {
    const lines = trace.interior.map((p) => toClipper(p, sx, sy, h));
    const top = s.bladeDepth - s.imprintDepth;
    slabs.push({
      region: intersection(offset(lines, t / 2, true), outline),
      z0: 0,
      z1: top,
    });
    if (s.imprintBaseWidth > 0)
      slabs.push({
        region: intersection(
          offset(lines, t / 2 + s.imprintBaseWidth / 2, true),
          outline,
        ),
        z0: 0,
        z1: Math.min(top, s.handleHeight + s.imprintBaseWidth),
      });
  }

  const parts: BufferGeometry[] = [];
  for (const slab of slabs) {
    if (slab.z1 - slab.z0 <= 1e-6) continue;
    for (const shape of toShapes(slab.region)) {
      const g = new ExtrudeGeometry(shape, {
        depth: slab.z1 - slab.z0,
        bevelEnabled: false,
        curveSegments: 1,
      });
      g.translate(0, 0, slab.z0);
      parts.push(g.index ? g.toNonIndexed() : g);
    }
  }
  return merge(parts);
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.getAttribute("position").count;
  const positions = new Float32Array(count * 3);
  let at = 0;
  for (const p of parts) {
    const array = p.getAttribute("position").array as Float32Array;
    positions.set(array, at);
    at += array.length;
    p.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

/** A binary STL of the model, in mm. */
export function toStl(geometry: BufferGeometry): ArrayBuffer {
  const pos = geometry.getAttribute("position").array as Float32Array;
  const triangles = pos.length / 9;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles, true);
  for (let i = 0; i < triangles; i++) {
    const o = i * 9;
    const ux = pos[o + 3]! - pos[o]!,
      uy = pos[o + 4]! - pos[o + 1]!,
      uz = pos[o + 5]! - pos[o + 2]!;
    const vx = pos[o + 6]! - pos[o]!,
      vy = pos[o + 7]! - pos[o + 1]!,
      vz = pos[o + 8]! - pos[o + 2]!;
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const b = 84 + i * 50;
    view.setFloat32(b, nx, true);
    view.setFloat32(b + 4, ny, true);
    view.setFloat32(b + 8, nz, true);
    for (let k = 0; k < 9; k++)
      view.setFloat32(b + 12 + k * 4, pos[o + k]!, true);
  }
  return buffer;
}
