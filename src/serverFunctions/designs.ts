import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as designs from "@/server/designs";
import { rememberUser } from "@/server/users";

// Each server function runs behind ensureUserMiddleware: `context.user` is
// the member the Gateway signed in, and every query takes their id.

export const getLibrary = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) =>
    z.object({ trashed: z.boolean() }).strict().parse(data),
  )
  .handler(({ data, context }) =>
    designs.listDesigns(context.user.id, data.trashed),
  );

export const getDesign = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => designs.idInput.parse(data))
  .handler(({ data, context }) => designs.getDesign(context.user.id, data.id));

/** FormData: `design` (JSON of designFields) and, for a new artwork, `artwork`. */
export const saveDesign = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data.");
    const fields = designs.designFields.parse(
      JSON.parse(String(data.get("design") ?? "null")),
    );
    const artwork = data.get("artwork");
    if (artwork !== null && !(artwork instanceof File))
      throw new Error("Artwork must be a file.");
    if (artwork) {
      if (!(designs.ARTWORK_TYPES as readonly string[]).includes(artwork.type))
        throw new Error("Artwork must be a PNG, JPG, WebP or SVG image.");
      if (artwork.size > designs.MAX_ARTWORK_BYTES)
        throw new Error("Artwork must be 10 MB or smaller.");
    }
    return { fields, artwork };
  })
  .handler(async ({ data, context }) => {
    await rememberUser(context.user);
    const saved = await designs.saveDesign(
      env.files,
      context.user.id,
      data.fields,
      data.artwork,
    );
    if (!saved) throw new Error("Design not found.");
    return saved;
  });

export const setFavorite = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => designs.favoriteInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!(await designs.setFavorite(context.user.id, data)))
      throw new Error("Design not found.");
  });

export const editTags = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => designs.tagsInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!(await designs.editTags(context.user.id, data)))
      throw new Error("Design not found.");
  });

export const moveToTrash = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => designs.idsInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!(await designs.setTrashed(context.user.id, data.ids, true)))
      throw new Error("Design not found.");
  });

export const restoreFromTrash = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => designs.idsInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!(await designs.setTrashed(context.user.id, data.ids, false)))
      throw new Error("Design not found.");
  });

export const deleteForever = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => designs.idsInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!(await designs.deleteForever(env.files, context.user.id, data.ids)))
      throw new Error("Design not found.");
  });
