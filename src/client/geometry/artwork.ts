import type { Trace } from "@/shared/trace";
import { traceMasks, type Mask } from "./contours";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};
const MAX_BYTES = 10 * 1024 * 1024;
const RESOLUTION = 400;
const PAD = 2;

export class ArtworkError extends Error {}

/** The file with a MIME type the app accepts, or an ArtworkError. */
export function acceptedArtwork(file: File): File {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = Object.values(TYPES).includes(file.type)
    ? file.type
    : TYPES[ext];
  if (!type)
    throw new ArtworkError(
      `${file.name || "That file"} isn't a PNG, JPG, WebP or SVG image.`,
    );
  if (file.size > MAX_BYTES)
    throw new ArtworkError("Images must be 10 MB or smaller.");
  return type === file.type
    ? file
    : new File([file], file.name, { type });
}

async function loadSvg(file: File): Promise<HTMLImageElement> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror"))
    throw new ArtworkError("That SVG couldn't be read.");
  const box = svg.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const width = parseFloat(svg.getAttribute("width") ?? "") || box?.[2] || 512;
  const height =
    parseFloat(svg.getAttribute("height") ?? "") || box?.[3] || 512;
  if (!svg.getAttribute("viewBox"))
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml",
  });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadRaster(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ArtworkError("That image couldn't be opened.");
  }
}

/** Draws the artwork small, then traces its outline and interior paths. */
export async function traceArtwork(file: File): Promise<Trace> {
  const source =
    file.type === "image/svg+xml" ? await loadSvg(file) : await loadRaster(file);
  const sw = source.width;
  const sh = source.height;
  if (!sw || !sh) throw new ArtworkError("That image is empty.");
  const k = RESOLUTION / Math.max(sw, sh);
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));
  const canvas = document.createElement("canvas");
  canvas.width = w + PAD * 2;
  canvas.height = h + PAD * 2;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ArtworkError("This browser can't read images.");
  ctx.drawImage(source, PAD, PAD, w, h);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const n = canvas.width * canvas.height;
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3]! < 128) transparent++;
  // With a see-through background the silhouette is every visible pixel;
  // otherwise it's the dark ones, as are the details in both cases.
  const seeThrough = transparent > n * 0.01;
  const silhouette = new Uint8Array(n);
  const detail = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3]!;
    const lum =
      0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    const dark = a >= 128 && lum < 160 ? 1 : 0;
    detail[i] = dark;
    silhouette[i] = seeThrough ? (a >= 128 ? 1 : 0) : dark;
  }
  const mask = (d: Uint8Array): Mask => ({
    width: canvas.width,
    height: canvas.height,
    data: d,
  });
  const trace = seeThrough
    ? traceMasks(mask(silhouette), mask(detail))
    : (() => {
        const m = mask(silhouette);
        return traceMasks(m, m);
      })();
  if (!trace)
    throw new ArtworkError(
      "No shape was found. Try an image with a dark shape on a light or clear background.",
    );
  return trace;
}

const svg = (body: string, w = 200, h = 200) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}">${body}</svg>`;

/** Plain shapes to start from. */
export const SHAPES: { name: string; svg: string }[] = [
  { name: "Circle", svg: svg('<circle cx="100" cy="100" r="96"/>') },
  { name: "Oval", svg: svg('<ellipse cx="100" cy="70" rx="96" ry="66"/>', 200, 140) },
  { name: "Square", svg: svg('<rect x="4" y="4" width="192" height="192"/>') },
  {
    name: "Rounded",
    svg: svg('<rect x="4" y="4" width="192" height="150" rx="36"/>', 200, 158),
  },
];

/** Ready-made designs with interior details. */
export const SAMPLES: { name: string; svg: string }[] = [
  {
    name: "Heart",
    svg: svg(
      '<path d="M100 186 C40 140 4 104 4 60 C4 28 28 6 56 6 C76 6 92 18 100 34 C108 18 124 6 144 6 C172 6 196 28 196 60 C196 104 160 140 100 186 Z"/>' +
        '<path d="M100 160 C56 126 26 98 26 64 C26 42 42 28 60 28 C78 28 92 42 100 58 C108 42 122 28 140 28 C158 28 174 42 174 64 C174 98 144 126 100 160 Z" fill="#fff"/>' +
        '<path d="M100 140 C70 116 50 96 50 72 C50 58 60 50 70 50 C84 50 94 60 100 74 C106 60 116 50 130 50 C140 50 150 58 150 72 C150 96 130 116 100 140 Z"/>',
    ),
  },
  {
    name: "Star",
    svg: svg(
      '<path d="M100 4 L126 70 L196 74 L142 118 L160 192 L100 152 L40 192 L58 118 L4 74 L74 70 Z"/>' +
        '<circle cx="84" cy="96" r="7" fill="#fff"/><circle cx="116" cy="96" r="7" fill="#fff"/>' +
        '<path d="M84 122 Q100 134 116 122" stroke="#fff" stroke-width="6" fill="none"/>',
    ),
  },
  {
    name: "Sun",
    svg: svg(
      '<g transform="translate(100 100)">' +
        Array.from(
          { length: 12 },
          (_, i) =>
            `<path d="M-10 -60 L0 -96 L10 -60 Z" transform="rotate(${i * 30})"/>`,
        ).join("") +
        '<circle r="66"/></g>' +
        '<circle cx="80" cy="88" r="8" fill="#fff"/><circle cx="120" cy="88" r="8" fill="#fff"/>' +
        '<path d="M74 114 Q100 138 126 114" stroke="#fff" stroke-width="7" fill="none"/>',
    ),
  },
];

export function svgFile(name: string, markup: string): File {
  return new File([markup], `${name.toLowerCase()}.svg`, {
    type: "image/svg+xml",
  });
}
