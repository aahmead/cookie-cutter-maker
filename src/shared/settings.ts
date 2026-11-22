import { z } from "zod";

// Every length is stored in millimetres; inches are only how a field shows it.
export const cutterSettings = z
  .object({
    type: z.enum(["cutter", "imprint"]),
    units: z.enum(["mm", "in"]),
    sizeMode: z.enum(["longest", "dimensions"]),
    size: z.number(),
    width: z.number(),
    height: z.number(),
    keepProportions: z.boolean(),
    bladeDepth: z.number(),
    bladeThickness: z.number(),
    thicken: z.boolean(),
    thickenDepth: z.number(),
    thickenThickness: z.number(),
    sharpTip: z.boolean(),
    tipWidth: z.number(),
    tipHeight: z.number(),
    handleHeight: z.number(),
    handleWidth: z.number(),
    handleShape: z.enum(["rectangle", "round", "chamfer"]),
    imprintDepth: z.number(),
    imprintBaseWidth: z.number(),
  })
  .strict();

export type CutterSettings = z.infer<typeof cutterSettings>;

export const DEFAULT_SETTINGS: CutterSettings = {
  type: "cutter",
  units: "mm",
  sizeMode: "longest",
  size: 75,
  width: 75,
  height: 75,
  keepProportions: true,
  bladeDepth: 12.5,
  bladeThickness: 0.8,
  thicken: false,
  thickenDepth: 10,
  thickenThickness: 0.4,
  sharpTip: false,
  tipWidth: 0.4,
  tipHeight: 2,
  handleHeight: 3.5,
  handleWidth: 4,
  handleShape: "rectangle",
  imprintDepth: 4.5,
  imprintBaseWidth: 1.5,
};

/** The fields a profile carries only when it includes the size. */
export const SIZE_KEYS = [
  "sizeMode",
  "size",
  "width",
  "height",
  "keepProportions",
] as const satisfies readonly (keyof CutterSettings)[];

export type NumericKey = {
  [K in keyof CutterSettings]: CutterSettings[K] extends number ? K : never;
}[keyof CutterSettings];

export const LABELS: Record<NumericKey, string> = {
  size: "Longest side",
  width: "Width",
  height: "Height",
  bladeDepth: "Blade depth",
  bladeThickness: "Blade thickness",
  thickenDepth: "Thickening depth",
  thickenThickness: "Thickening thickness",
  tipWidth: "Tip width",
  tipHeight: "Tip height",
  handleHeight: "Handle height",
  handleWidth: "Handle width",
  imprintDepth: "Imprint depth",
  imprintBaseWidth: "Imprint base width",
};

export type SettingsProblems = Partial<Record<NumericKey, string>>;

const RANGES: Record<NumericKey, [number, number]> = {
  size: [10, 400],
  width: [10, 400],
  height: [10, 400],
  bladeDepth: [3, 60],
  bladeThickness: [0.3, 5],
  thickenDepth: [0.5, 60],
  thickenThickness: [0.1, 5],
  tipWidth: [0.1, 5],
  tipHeight: [0.2, 20],
  handleHeight: [0.5, 20],
  handleWidth: [0, 30],
  imprintDepth: [0, 60],
  imprintBaseWidth: [0, 10],
};

/** Field-by-field problems; an empty object means the model can be built. */
export function validateSettings(s: CutterSettings): SettingsProblems {
  const problems: SettingsProblems = {};
  const relevant = (key: NumericKey) => {
    if (key === "size") return s.sizeMode === "longest";
    if (key === "width" || key === "height") return s.sizeMode === "dimensions";
    if (key === "thickenDepth" || key === "thickenThickness") return s.thicken;
    if (key === "tipWidth" || key === "tipHeight") return s.sharpTip;
    if (key === "imprintDepth" || key === "imprintBaseWidth")
      return s.type === "imprint";
    return true;
  };
  for (const key of Object.keys(RANGES) as NumericKey[]) {
    if (!relevant(key)) continue;
    const [min, max] = RANGES[key];
    const value = s[key];
    if (!Number.isFinite(value) || value < min || value > max)
      problems[key] = `${LABELS[key]} must be between ${min} and ${max} mm.`;
  }
  if (!problems.handleHeight && s.handleHeight >= s.bladeDepth)
    problems.handleHeight = "Handle height must be less than the blade depth.";
  if (s.thicken && !problems.thickenDepth && s.thickenDepth > s.bladeDepth)
    problems.thickenDepth = "Thickening depth can't be more than the blade depth.";
  if (s.sharpTip && !problems.tipWidth && s.tipWidth > s.bladeThickness)
    problems.tipWidth = "Tip width can't be more than the blade thickness.";
  if (
    s.sharpTip &&
    !problems.tipHeight &&
    s.tipHeight >= s.bladeDepth - s.handleHeight
  )
    problems.tipHeight = "Tip height must be less than the blade below the handle.";
  if (
    s.type === "imprint" &&
    !problems.imprintDepth &&
    s.imprintDepth >= s.bladeDepth - s.handleHeight
  )
    problems.imprintDepth =
      "Imprint depth must leave some imprint below the handle.";
  return problems;
}

/** The settings a profile applies: everything, or everything but the size. */
function profileView(
  s: CutterSettings,
  includesSize: boolean,
): Partial<CutterSettings> {
  const view: Partial<CutterSettings> = { ...s };
  if (!includesSize) for (const key of SIZE_KEYS) delete view[key];
  return view;
}

export function sameProfileValues(
  current: CutterSettings,
  profile: CutterSettings,
  includesSize: boolean,
): boolean {
  const a = profileView(current, includesSize);
  const b = profileView(profile, includesSize);
  return (Object.keys(b) as (keyof CutterSettings)[]).every((key) => {
    const x = a[key];
    const y = b[key];
    return typeof x === "number" && typeof y === "number"
      ? Math.abs(x - y) < 1e-6
      : x === y;
  });
}

export const MM_PER_INCH = 25.4;

/** A stored millimetre value as the field shows it. */
export function displayLength(mm: number, units: CutterSettings["units"]) {
  const value = units === "in" ? mm / MM_PER_INCH : mm;
  return String(Number(value.toFixed(units === "in" ? 3 : 2)));
}
