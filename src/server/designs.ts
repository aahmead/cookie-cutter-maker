import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { designs } from "@/db/schema";
import { cutterSettings, type CutterSettings } from "@/shared/settings";
import { traceSchema, type Trace } from "@/shared/trace";

export const ARTWORK_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;
export const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

const tag = z.string().trim().toLowerCase().min(1).max(40);

export const designFields = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Name is required").max(120),
    description: z.string().trim().max(1000),
    trace: traceSchema,
    settings: cutterSettings,
  })
  .strict();

export const idsInput = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(500) })
  .strict();
export const idInput = z.object({ id: z.string().uuid() }).strict();
export const favoriteInput = z
  .object({ id: z.string().uuid(), favorite: z.boolean() })
  .strict();
export const tagsInput = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    add: z.array(tag).max(20),
    remove: z.array(tag).max(20),
  })
  .strict();

interface DesignSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
  favorite: boolean;
  outline: Trace["outline"];
  createdAt: string;
  trashedAt: string | null;
}

interface Design extends DesignSummary {
  trace: Trace;
  settings: CutterSettings;
  artworkType: string;
  artworkName: string;
}

const own = (userId: string, id: string) =>
  and(eq(designs.id, id), eq(designs.userId, userId));

function summary(row: typeof designs.$inferSelect): DesignSummary {
  const trace = JSON.parse(row.trace) as Trace;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: JSON.parse(row.tags) as string[],
    favorite: row.favorite,
    outline: trace.outline,
    createdAt: row.createdAt,
    trashedAt: row.trashedAt,
  };
}

/** The member's designs, in the library or in the trash. */
export async function listDesigns(
  userId: string,
  trashed: boolean,
): Promise<DesignSummary[]> {
  const rows = await db
    .select()
    .from(designs)
    .where(
      and(
        eq(designs.userId, userId),
        trashed ? isNotNull(designs.trashedAt) : isNull(designs.trashedAt),
      ),
    )
    .orderBy(desc(designs.createdAt));
  return rows.map(summary);
}

export async function getDesign(
  userId: string,
  id: string,
): Promise<Design | null> {
  const [row] = await db.select().from(designs).where(own(userId, id));
  if (!row) return null;
  return {
    ...summary(row),
    trace: JSON.parse(row.trace) as Trace,
    settings: cutterSettings.parse(JSON.parse(row.settings)),
    artworkType: row.artworkType,
    artworkName: row.artworkName,
  };
}

const artworkKey = (userId: string, id: string) => `artwork/${userId}/${id}`;

/** Creates a design, or saves changes to one of the member's own. Null when the id isn't theirs. */
export async function saveDesign(
  bucket: R2Bucket,
  userId: string,
  fields: z.infer<typeof designFields>,
  artwork: File | null,
): Promise<{ id: string } | null> {
  const now = new Date().toISOString();
  const values = {
    name: fields.name,
    description: fields.description,
    trace: JSON.stringify(fields.trace),
    settings: JSON.stringify(fields.settings),
    updatedAt: now,
    ...(artwork ? { artworkType: artwork.type, artworkName: artwork.name } : {}),
  };
  if (fields.id) {
    const [row] = await db
      .update(designs)
      .set(values)
      .where(own(userId, fields.id))
      .returning({ id: designs.id });
    if (!row) return null;
    if (artwork) await putArtwork(bucket, userId, row.id, artwork);
    return row;
  }
  if (!artwork) throw new Error("A new design needs its artwork.");
  const id = crypto.randomUUID();
  await putArtwork(bucket, userId, id, artwork);
  await db.insert(designs).values({
    id,
    userId,
    createdAt: now,
    artworkType: artwork.type,
    artworkName: artwork.name,
    ...values,
  });
  return { id };
}

async function putArtwork(
  bucket: R2Bucket,
  userId: string,
  id: string,
  artwork: File,
) {
  await bucket.put(artworkKey(userId, id), await artwork.arrayBuffer(), {
    httpMetadata: { contentType: artwork.type },
  });
}

/** The artwork of one of the member's designs, or null. */
export async function getArtwork(bucket: R2Bucket, userId: string, id: string) {
  const [row] = await db
    .select({ type: designs.artworkType })
    .from(designs)
    .where(own(userId, id));
  if (!row) return null;
  const object = await bucket.get(artworkKey(userId, id));
  return object ? { type: row.type, body: object.body } : null;
}

export async function setFavorite(
  userId: string,
  { id, favorite }: z.infer<typeof favoriteInput>,
) {
  const rows = await db
    .update(designs)
    .set({ favorite })
    .where(own(userId, id))
    .returning({ id: designs.id });
  return rows.length;
}

export async function editTags(
  userId: string,
  { ids, add, remove }: z.infer<typeof tagsInput>,
) {
  const rows = await db
    .select({ id: designs.id, tags: designs.tags })
    .from(designs)
    .where(and(eq(designs.userId, userId), inArray(designs.id, ids)));
  const [first, ...rest] = rows.map((row) => {
    const next = new Set(JSON.parse(row.tags) as string[]);
    for (const t of add) next.add(t);
    for (const t of remove) next.delete(t);
    return db
      .update(designs)
      .set({ tags: JSON.stringify([...next].sort()) })
      .where(own(userId, row.id));
  });
  if (!first) return 0;
  await db.batch([first, ...rest]);
  return rows.length;
}

export async function setTrashed(
  userId: string,
  ids: string[],
  trashed: boolean,
) {
  const rows = await db
    .update(designs)
    .set({ trashedAt: trashed ? new Date().toISOString() : null })
    .where(and(eq(designs.userId, userId), inArray(designs.id, ids)))
    .returning({ id: designs.id });
  return rows.length;
}

/** Deletes designs that are already in the member's trash, with their artwork. */
export async function deleteForever(
  bucket: R2Bucket,
  userId: string,
  ids: string[],
) {
  const rows = await db
    .delete(designs)
    .where(
      and(
        eq(designs.userId, userId),
        inArray(designs.id, ids),
        isNotNull(designs.trashedAt),
      ),
    )
    .returning({ id: designs.id });
  if (rows.length)
    await bucket.delete(rows.map((row) => artworkKey(userId, row.id)));
  return rows.length;
}
