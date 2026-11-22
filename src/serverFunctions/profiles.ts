import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import * as profiles from "@/server/profiles";
import { rememberUser } from "@/server/users";

export const getProfiles = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => profiles.listProfiles(context.user.id));

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => {
    const input = profiles.saveProfileInput.parse(data);
    if (input.name.toLowerCase() === "default")
      throw new Error("Default is the built-in profile. Pick another name.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    return profiles.saveProfile(context.user.id, data);
  });

export const deleteProfile = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => profiles.deleteProfileInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!(await profiles.deleteProfile(context.user.id, data.id)))
      throw new Error("Profile not found.");
  });
