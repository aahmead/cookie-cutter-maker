// Shared helpers for the suites. Data here reads like real use.
import { readFile } from "node:fs/promises";
import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

/** A wide cloud with two eyes and a smile cut out of it: 200 x 120 units. */
export const CLOUD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="400" height="240">
<path d="M40 110 C10 110 5 75 30 68 C25 40 60 25 80 42 C90 10 145 10 150 45 C175 35 198 60 185 85 C198 100 185 112 165 110 Z" fill="#000"/>
<circle cx="80" cy="72" r="8" fill="#fff"/>
<circle cx="125" cy="72" r="8" fill="#fff"/>
<path d="M85 92 Q102 104 120 92" stroke="#fff" stroke-width="5" fill="none"/>
</svg>`;

export async function openDesigner(page, path = "/designer") {
  await page.goto(path);
  await expect(page.getByTestId("artwork-drop")).toBeVisible();
}

export async function uploadCloud(page) {
  await page.getByTestId("artwork-input").setInputFiles({
    name: "rain-cloud.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(CLOUD_SVG),
  });
  await expect(page.getByTestId("trace-summary")).toContainText("interior");
}

/** Saves the open design under a name; returns its id from the address. */
export async function saveDesign(page, name, description = "") {
  await page.getByTestId("save-design").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  if (description) await dialog.getByLabel("Description").fill(description);
  await dialog.getByTestId("save-design-submit").click();
  await expect(page).toHaveURL(/design=/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return new URL(page.url()).searchParams.get("design");
}

/** Starts a new design from a sample and saves it. */
export async function designFromSample(page, sample, name, description) {
  await openDesigner(page);
  await page.getByTestId("sample-picker").getByRole("button", { name: sample }).click();
  await expect(page.getByTestId("trace-summary")).toContainText("Outline");
  return saveDesign(page, name, description);
}

export async function pickOption(page, triggerTestId, option) {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Parses a binary STL: triangle count and the model's extent in mm. */
export async function readStl(path) {
  const bytes = await readFile(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12;
    for (let v = 0; v < 3; v++)
      for (let a = 0; a < 3; a++) {
        const value = view.getFloat32(base + v * 12 + a * 4, true);
        min[a] = Math.min(min[a], value);
        max[a] = Math.max(max[a], value);
      }
  }
  return {
    bytes: bytes.length,
    count,
    size: max.map((value, a) => value - min[a]),
  };
}
