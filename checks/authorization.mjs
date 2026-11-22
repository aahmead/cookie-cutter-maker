// Authorization: private paths, per-member designs and profiles, no sign-in of the app's own.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { designFromSample, openDesigner, pickOption } from "./lib.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/designer", "/trash", "/health"]);

  // The owner's design and profile.
  const owner = await (await runtime.context("owner")).newPage();
  const ownerId = await designFromSample(owner, "Heart", "Grandma's Heart", "Family recipe cutter");
  await owner.getByLabel("Blade thickness").fill("0.7");
  await owner.getByTestId("save-profile").click();
  await owner.getByRole("dialog").getByLabel("Profile name").fill("Owner secret profile");
  await owner.getByRole("dialog").getByTestId("save-profile-submit").click();
  await expect(owner.getByTestId("profile-select")).toContainText("Owner secret profile");

  // Anonymous and outsider callers never reach the artwork.
  for (const role of [undefined, "outsider"]) {
    const res = await runtime.fetch(`/api/designs/${ownerId}/artwork`, role ? { role } : {});
    expect([401, 403, 302, 303]).toContain(res.status);
    expect(await res.text()).not.toContain("<svg");
  }
  // Another member of the same organization can't read it either.
  const peek = await runtime.fetch(`/api/designs/${ownerId}/artwork`, { role: "member" });
  expect(peek.status).toBe(404);

  // The member sees none of the owner's designs or profiles.
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/");
  await expect(member.getByTestId("library-empty")).toBeVisible();
  await expect(member.getByText("Grandma's Heart")).toHaveCount(0);
  await member.goto("/trash");
  await expect(member.getByTestId("trash-empty")).toBeVisible();
  await member.goto(`/designer?design=${ownerId}`);
  await expect(member.getByTestId("design-not-found")).toBeVisible();
  await expect(member.getByText("Grandma's Heart")).toHaveCount(0);
  await openDesigner(member);
  await member.getByTestId("profile-select").click();
  await expect(member.getByRole("option", { name: "Default" })).toBeVisible();
  await expect(member.getByRole("option", { name: "Owner secret profile" })).toHaveCount(0);
  await member.keyboard.press("Escape");

  // A member who rewrites a request to name the owner's design changes nothing.
  const memberId = await designFromSample(member, "Star", "Team Star");
  await member.goto("/");
  let rewrites = 0;
  await member.route("**/_serverFn/**", async (route) => {
    const body = route.request().postData();
    if (body && body.includes(memberId)) {
      rewrites++;
      await route.continue({ postData: body.split(memberId).join(ownerId) });
    } else await route.continue();
  });
  await member.getByTestId("design-card").first().getByTestId("trash-design").click();
  await expect(member.getByText("Design not found.")).toBeVisible();
  await member.getByTestId("design-card").first().getByTestId("favorite-toggle").click();
  await expect.poll(() => rewrites).toBeGreaterThanOrEqual(2);
  await member.unroute("**/_serverFn/**");
  expect(rewrites).toBeGreaterThanOrEqual(2);
  await expect(member.getByTestId("design-card")).toHaveCount(1);

  // Saving over the owner's design through a rewritten request fails too.
  await member.goto(`/designer?design=${memberId}`);
  await member.route("**/_serverFn/**", async (route) => {
    const body = route.request().postData();
    if (body && body.includes(memberId)) {
      rewrites++;
      await route.continue({ postData: body.split(memberId).join(ownerId) });
    } else await route.continue();
  });
  await member.getByTestId("save-design").click();
  await member.getByRole("dialog").getByLabel("Name").fill("Hijacked");
  await member.getByRole("dialog").getByTestId("save-design-submit").click();
  await expect(member.getByRole("dialog").getByText("Design not found.")).toBeVisible();
  await member.unroute("**/_serverFn/**");
  expect(rewrites).toBeGreaterThanOrEqual(3);

  await owner.goto("/");
  const ownerCard = owner.getByTestId("design-card").filter({ hasText: "Grandma's Heart" });
  await expect(ownerCard).toHaveCount(1);
  await expect(ownerCard.getByTestId("favorite-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(owner.getByText("Hijacked")).toHaveCount(0);
  const ok = await runtime.fetch(`/api/designs/${ownerId}/artwork`, { role: "owner" });
  expect(ok.status).toBe(200);

  // Profiles stay their owner's: the member's own default is unchanged.
  await openDesigner(owner);
  await pickOption(owner, "profile-select", "Owner secret profile");
  await expect(owner.getByLabel("Blade thickness")).toHaveValue("0.7");

  // No sign-in page of the app's own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/register", "/logout", "/auth/login"]) {
    const res = await runtime.fetch(path, { role: "member" });
    const html = await res.text();
    expect(html).not.toMatch(/type=["']?password/i);
    expect(res.status).not.toBe(200);
  }
  const anon = await runtime.fetch("/login");
  expect(anon.status).not.toBe(200);
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
