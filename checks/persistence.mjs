// Persistence: designs, artwork and profiles survive a restart.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { openDesigner, pickOption, saveDesign, uploadCloud } from "./lib.mjs";

const runtime = await startRuntime();
try {
  let page = await (await runtime.context("member")).newPage();
  await openDesigner(page);
  await uploadCloud(page);
  await page.getByTestId("type-imprint").click();
  await page.getByLabel("Longest side").fill("88");
  const id = await saveDesign(page, "Puffy Cloud", "Baby shower set");
  await page.getByLabel("Handle width").fill("5");
  await page.getByTestId("save-profile").click();
  await page.getByRole("dialog").getByLabel("Profile name").fill("Wide rim");
  await page.getByRole("dialog").getByTestId("save-profile-submit").click();
  await expect(page.getByTestId("profile-select")).toContainText("Wide rim");
  await page.goto("/");
  await page.getByTestId("design-card").first().getByTestId("favorite-toggle").click();
  await expect(page.getByTestId("design-card").first().getByTestId("favorite-toggle")).toHaveAttribute("aria-pressed", "true");

  await runtime.restart();

  page = await (await runtime.context("member")).newPage();
  await page.goto("/");
  const card = page.getByTestId("design-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Puffy Cloud");
  await expect(card).toContainText("Baby shower set");
  await expect(card.getByTestId("favorite-toggle")).toHaveAttribute("aria-pressed", "true");
  const art = await runtime.fetch(`/api/designs/${id}/artwork`, { role: "member" });
  expect(art.status).toBe(200);
  expect(await art.text()).toContain("<svg");
  await page.goto(`/designer?design=${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Puffy Cloud");
  await expect(page.getByTestId("trace-summary")).toContainText("3 interior");
  await expect(page.getByTestId("type-imprint")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Longest side")).toHaveValue("88");
  await pickOption(page, "profile-select", "Default");
  await expect(page.getByLabel("Handle width")).toHaveValue("4");
  await pickOption(page, "profile-select", "Wide rim");
  await expect(page.getByLabel("Handle width")).toHaveValue("5");
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
