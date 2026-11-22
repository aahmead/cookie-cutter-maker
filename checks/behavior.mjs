// Behavior: every retained feature's main path, through the packaged release.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import {
  CLOUD_SVG, designFromSample, openDesigner, pickOption, readStl, saveDesign, uploadCloud,
} from "./lib.mjs";

const runtime = await startRuntime();
try {
  const page = await (await runtime.context("owner", { acceptDownloads: true })).newPage();

  // F004: a fresh library and trash show their empty states.
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Designs");
  await expect(page.getByTestId("library-empty")).toBeVisible();
  await page.goto("/trash");
  await expect(page.getByTestId("trash-empty")).toBeVisible();

  // F001: an unsupported file shows an error; another image then traces.
  await openDesigner(page);
  await runtime.assertBackLink(page);
  await page.getByTestId("artwork-input").setInputFiles({
    name: "shopping-list.txt", mimeType: "text/plain", buffer: Buffer.from("flour, sugar, butter"),
  });
  await expect(page.getByTestId("artwork-error")).toBeVisible();
  await uploadCloud(page);
  await expect(page.getByTestId("artwork-error")).toHaveCount(0);
  await expect(page.getByTestId("trace-summary")).toContainText("3 interior");
  await expect(page.getByTestId("trace-preview").locator("path").first()).toBeVisible();

  // Basic shapes trace too.
  await page.getByTestId("shape-picker").getByRole("button", { name: "Circle" }).click();
  await expect(page.getByTestId("trace-summary")).toHaveText(/Outline only/);
  await uploadCloud(page);

  // F002: defaults, overall size, unit conversion and validation.
  await expect(page.getByLabel("Longest side")).toHaveValue("75");
  await expect(page.getByLabel("Blade depth")).toHaveValue("12.5");
  await expect(page.getByLabel("Blade thickness")).toHaveValue("0.8");
  await expect(page.getByLabel("Handle height")).toHaveValue("3.5");
  await expect(page.getByLabel("Handle width")).toHaveValue("4");
  await expect(page.getByTestId("overall-size")).toContainText("83 ×");
  await page.getByLabel("Longest side").fill("90");
  await expect(page.getByTestId("overall-size")).toContainText("98 ×");
  await page.getByTestId("units-in").click();
  await expect(page.getByLabel("Longest side")).toHaveValue("3.543");
  await page.getByTestId("units-mm").click();
  await expect(page.getByLabel("Longest side")).toHaveValue("90");

  // Width and height with the aspect lock.
  await page.getByTestId("size-mode-dimensions").click();
  await page.getByLabel("Width", { exact: true }).fill("100");
  const lockedHeight = Number(await page.getByLabel("Height", { exact: true }).inputValue());
  expect(lockedHeight).toBeGreaterThan(30);
  expect(lockedHeight).toBeLessThan(80);
  await page.getByLabel("Keep proportions").click();
  await page.getByLabel("Height", { exact: true }).fill("70");
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("100");
  await expect(page.getByTestId("overall-size")).toContainText("108 × 78");

  await page.getByLabel("Thicker blade base").click();
  await expect(page.getByLabel("Thickening depth")).toHaveValue("10");
  await page.getByLabel("Thickening depth").fill("20");
  await expect(page.getByTestId("settings-error")).toContainText("Thickening depth");
  await expect(page.getByTestId("download-stl")).toBeDisabled();
  await page.getByLabel("Thickening depth").fill("10");
  await expect(page.getByTestId("settings-error")).toHaveCount(0);

  await page.getByLabel("Sharp tip").click();
  await expect(page.getByLabel("Tip width")).toHaveValue("0.4");
  await expect(page.getByLabel("Tip height")).toHaveValue("2");
  await page.getByLabel("Tip width").fill("1.2");
  await expect(page.getByTestId("settings-error")).toContainText("Tip width");
  await page.getByLabel("Tip width").fill("0.4");
  await pickOption(page, "handle-shape", "Round");

  // F003: the model shows and changes with the settings.
  await expect(page.getByTestId("preview-3d").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("model-stats")).toContainText("triangles");
  const cutterStats = await page.getByTestId("model-stats").textContent();
  await page.getByTestId("type-imprint").click();
  await expect(page.getByLabel("Imprint depth")).toHaveValue("4.5");
  await expect(page.getByLabel("Imprint base width")).toHaveValue("1.5");
  await expect(page.getByTestId("model-stats")).not.toHaveText(cutterStats);
  await page.getByTestId("fit-view").click();

  // Reset restores every default.
  await page.getByTestId("reset-settings").click();
  await expect(page.getByLabel("Longest side")).toHaveValue("75");
  await expect(page.getByTestId("type-cutter")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Thickening depth")).toHaveCount(0);

  // F004: save, then download named after the design and sized in mm.
  await page.getByTestId("type-imprint").click();
  const cloudId = await saveDesign(page, "Rain Cloud", "Smiling cloud for the spring bake sale");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-stl").click(),
  ]);
  expect(download.suggestedFilename()).toBe("Rain Cloud.stl");
  const stl = await readStl(await download.path());
  expect(stl.count).toBeGreaterThan(100);
  expect(stl.bytes).toBe(84 + stl.count * 50);
  expect(Math.abs(stl.size[0] - 83)).toBeLessThan(0.3);
  expect(Math.abs(stl.size[2] - 12.5)).toBeLessThan(0.05);

  // The artwork is kept with the design.
  const art = await runtime.fetch(`/api/designs/${cloudId}/artwork`, { role: "owner" });
  expect(art.status).toBe(200);
  expect(await art.text()).toContain("<svg");

  // Saving changes keeps the same design.
  await page.getByLabel("Blade depth").fill("14");
  await page.getByTestId("save-design").click();
  await expect(page.getByRole("dialog").getByLabel("Name")).toHaveValue("Rain Cloud");
  await page.getByRole("dialog").getByTestId("save-design-submit").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("design")).toBe(cloudId);

  // Reopening restores artwork, type and settings.
  await page.goto(`/designer?design=${cloudId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rain Cloud");
  await expect(page.getByTestId("trace-summary")).toContainText("3 interior");
  await expect(page.getByTestId("type-imprint")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Blade depth")).toHaveValue("14");

  // F005: profiles with and without size.
  await page.getByLabel("Blade thickness").fill("0.6");
  await page.getByTestId("save-profile").click();
  await page.getByRole("dialog").getByLabel("Profile name").fill("Fine blades");
  await page.getByRole("dialog").getByTestId("save-profile-submit").click();
  await expect(page.getByTestId("profile-select")).toContainText("Fine blades");
  await expect(page.getByTestId("profile-modified")).toHaveCount(0);
  await page.getByLabel("Blade thickness").fill("1");
  await expect(page.getByTestId("profile-modified")).toBeVisible();
  // Saving under the same name updates it.
  await page.getByTestId("save-profile").click();
  await page.getByRole("dialog").getByLabel("Profile name").fill("Fine blades");
  await page.getByRole("dialog").getByTestId("save-profile-submit").click();
  await expect(page.getByTestId("profile-modified")).toHaveCount(0);
  await pickOption(page, "profile-select", "Default");
  await expect(page.getByLabel("Blade thickness")).toHaveValue("0.8");
  await expect(page.getByTestId("delete-profile")).toHaveCount(0);
  await page.getByLabel("Longest side").fill("60");
  await pickOption(page, "profile-select", "Fine blades");
  await expect(page.getByLabel("Blade thickness")).toHaveValue("1");
  await expect(page.getByLabel("Longest side")).toHaveValue("60");

  await page.getByLabel("Longest side").fill("100");
  await page.getByTestId("save-profile").click();
  await page.getByRole("dialog").getByLabel("Profile name").fill("Large tray");
  await page.getByRole("dialog").getByLabel("Include size").click();
  await page.getByRole("dialog").getByTestId("save-profile-submit").click();
  await page.getByLabel("Longest side").fill("50");
  await pickOption(page, "profile-select", "Fine blades");
  await pickOption(page, "profile-select", "Large tray");
  await expect(page.getByLabel("Longest side")).toHaveValue("100");

  await page.getByTestId("delete-profile").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete profile" }).click();
  await page.getByTestId("profile-select").click();
  await expect(page.getByRole("option", { name: "Large tray" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Fine blades" })).toBeVisible();
  await page.keyboard.press("Escape");

  // More designs for the library.
  await designFromSample(page, "Star", "Birthday Star", "Gold star for Mia's party");
  await designFromSample(page, "Heart", "Valentine Heart");

  // F004: the library lists, searches, sorts, tags and favourites.
  await page.goto("/");
  const cards = page.getByTestId("design-card");
  await expect(cards).toHaveCount(3);
  await page.getByTestId("design-search").fill("party");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Birthday Star");
  await page.getByTestId("design-search").fill("pumpkin");
  await expect(page.getByTestId("library-no-results")).toBeVisible();
  await page.getByTestId("design-search").fill("");

  await pickOption(page, "design-sort", "Name A–Z");
  await expect(cards.first()).toContainText("Birthday Star");
  await expect(cards.last()).toContainText("Valentine Heart");
  await pickOption(page, "design-sort", "Newest first");
  await expect(cards.first()).toContainText("Valentine Heart");
  await pickOption(page, "design-sort", "Oldest first");
  await expect(cards.first()).toContainText("Rain Cloud");

  await page.getByRole("checkbox", { name: "Select Birthday Star" }).click();
  await page.getByRole("checkbox", { name: "Select Valentine Heart" }).click();
  await page.getByTestId("bulk-tags").click();
  await page.getByRole("dialog").getByLabel("Add tags").fill("party, gifts");
  await page.getByRole("dialog").getByTestId("bulk-tags-submit").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Select Valentine Heart" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Select Valentine Heart" }).click();
  await page.getByTestId("bulk-tags").click();
  await page.getByRole("dialog").getByLabel("Remove tags").fill("party");
  await page.getByRole("dialog").getByTestId("bulk-tags-submit").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByTestId("tag-filter-gifts").click();
  await expect(cards).toHaveCount(2);
  await page.getByTestId("tag-filter-party").click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Birthday Star");
  await page.getByTestId("tag-filter-party").click();
  await page.getByTestId("tag-filter-gifts").click();
  await expect(cards).toHaveCount(3);

  const heart = cards.filter({ hasText: "Valentine Heart" });
  await heart.getByTestId("favorite-toggle").click();
  await expect(heart.getByTestId("favorite-toggle")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("favorites-only").click();
  await expect(cards).toHaveCount(1);
  await page.getByTestId("favorites-only").click();

  // Trash: move, restore, delete forever.
  await cards.filter({ hasText: "Birthday Star" }).getByTestId("trash-design").click();
  await expect(cards).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Select Valentine Heart" }).click();
  await page.getByTestId("bulk-trash").click();
  await expect(cards).toHaveCount(1);
  await page.goto("/trash");
  const trashed = page.getByTestId("trash-card");
  await expect(trashed).toHaveCount(2);
  await trashed.filter({ hasText: "Valentine Heart" }).getByTestId("restore-design").click();
  await expect(trashed).toHaveCount(1);
  await trashed.first().getByTestId("delete-forever").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByTestId("trash-empty")).toBeVisible();
  await page.goto("/");
  await expect(cards).toHaveCount(2);

  // Bulk delete forever from the trash.
  await designFromSample(page, "Sun", "Summer Sun");
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Select Summer Sun" }).click();
  await page.getByTestId("bulk-trash").click();
  await page.goto("/trash");
  await page.getByRole("checkbox", { name: "Select Summer Sun" }).click();
  await page.getByTestId("bulk-delete-forever").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByTestId("trash-empty")).toBeVisible();

  // Phone-sized smoke.
  const phone = await (await runtime.context("member", {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  })).newPage();
  await phone.goto("/");
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("Designs");
  await phone.goto("/designer");
  await expect(phone.getByTestId("artwork-drop")).toBeVisible();
  await phone.getByTestId("sample-picker").getByRole("button", { name: "Star" }).click();
  await expect(phone.getByTestId("model-stats")).toContainText("triangles");

  // The journey's result: the cloud open in the designer.
  await page.goto(`/designer?design=${cloudId}`);
  await expect(page.getByTestId("model-stats")).toContainText("triangles");
  await page.getByTestId("preview-3d").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await runtime.screenshot(page);
  console.log("behavior: ok", CLOUD_SVG.length > 0);
} finally {
  await runtime.close();
}
