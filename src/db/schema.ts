import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Every row belongs to one member: `user_id` is the Gateway's user id, and
// every query filters by it.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const designs = sqliteTable(
  "designs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** JSON: the traced outline and interior paths, normalized to 0..1. */
    trace: text("trace").notNull(),
    /** JSON: CutterSettings (src/shared/settings.ts). */
    settings: text("settings").notNull(),
    /** JSON: string[] */
    tags: text("tags").notNull().default("[]"),
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    artworkType: text("artwork_type").notNull(),
    artworkName: text("artwork_name").notNull().default(""),
    trashedAt: text("trashed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("designs_user_idx").on(table.userId, table.trashedAt)],
);

export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    /** JSON: CutterSettings */
    settings: text("settings").notNull(),
    includesSize: integer("includes_size", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("profiles_user_name").on(table.userId, table.name)],
);
