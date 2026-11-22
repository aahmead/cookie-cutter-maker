import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, validateSettings } from "@/shared/settings";
import { traceMasks, type Mask } from "./contours";
import { buildModel, overallSize, toStl } from "./model";

/** A 120 x 60 block with a 20 x 20 window in it, on a 2 px margin. */
function block(): Mask {
  const width = 124;
  const height = 64;
  const data = new Uint8Array(width * height);
  for (let y = 2; y < 62; y++)
    for (let x = 2; x < 122; x++)
      data[y * width + x] = x >= 50 && x < 70 && y >= 20 && y < 40 ? 0 : 1;
  return { width, height, data };
}

describe("tracing", () => {
  it("finds the outline and the interior path", () => {
    const trace = traceMasks(block(), block())!;
    expect(trace.interior).toHaveLength(1);
    const xs = trace.outline.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 1);
  });

  it("returns null for an empty image", () => {
    const empty = { width: 10, height: 10, data: new Uint8Array(100) };
    expect(traceMasks(empty, empty)).toBeNull();
  });
});

describe("model", () => {
  const trace = traceMasks(block(), block())!;

  it("is sized in mm with the rim outside the outline", () => {
    const g = buildModel(trace, DEFAULT_SETTINGS);
    const box = g.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(83, 0);
    expect(box.max.z - box.min.z).toBeCloseTo(12.5, 3);
    expect(overallSize(trace, DEFAULT_SETTINGS).width).toBeCloseTo(83, 5);
  });

  it("adds imprint lines for an imprint cutter", () => {
    const cutter = buildModel(trace, DEFAULT_SETTINGS);
    const imprint = buildModel(trace, { ...DEFAULT_SETTINGS, type: "imprint" });
    expect(imprint.getAttribute("position").count).toBeGreaterThan(
      cutter.getAttribute("position").count,
    );
  });

  it("writes a binary STL", () => {
    const g = buildModel(trace, { ...DEFAULT_SETTINGS, handleShape: "round", sharpTip: true });
    const stl = toStl(g);
    const count = new DataView(stl).getUint32(80, true);
    expect(stl.byteLength).toBe(84 + count * 50);
  });
});

describe("settings rules", () => {
  it("accepts the defaults", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({});
  });
  it("refuses thickening deeper than the blade and a tip wider than it", () => {
    const problems = validateSettings({
      ...DEFAULT_SETTINGS,
      thicken: true,
      thickenDepth: 20,
      sharpTip: true,
      tipWidth: 1.2,
    });
    expect(problems.thickenDepth).toBeTruthy();
    expect(problems.tipWidth).toBeTruthy();
  });
});
