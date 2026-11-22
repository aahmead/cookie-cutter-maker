import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { cutterSettings, type CutterSettings } from "@/shared/settings";

export const saveProfileInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60),
    settings: cutterSettings,
    includesSize: z.boolean(),
  })
  .strict();
export const deleteProfileInput = z.object({ id: z.string().uuid() }).strict();

interface Profile {
  id: string;
  name: string;
  settings: CutterSettings;
  includesSize: boolean;
}

export async function listProfiles(userId: string): Promise<Profile[]> {
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(asc(profiles.name));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    includesSize: row.includesSize,
    settings: cutterSettings.parse(JSON.parse(row.settings)),
  }));
}

/** Saves a profile; a name the member already uses updates that profile. */
export async function saveProfile(
  userId: string,
  input: z.infer<typeof saveProfileInput>,
): Promise<{ id: string }> {
  const values = {
    settings: JSON.stringify(input.settings),
    includesSize: input.includesSize,
    updatedAt: new Date().toISOString(),
  };
  const [row] = await db
    .insert(profiles)
    .values({ id: crypto.randomUUID(), userId, name: input.name, ...values })
    .onConflictDoUpdate({
      target: [profiles.userId, profiles.name],
      set: values,
    })
    .returning({ id: profiles.id });
  return row!;
}

export async function deleteProfile(userId: string, id: string) {
  const rows = await db
    .delete(profiles)
    .where(and(eq(profiles.id, id), eq(profiles.userId, userId)))
    .returning({ id: profiles.id });
  return rows.length;
}
