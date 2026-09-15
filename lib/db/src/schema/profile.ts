import { createInsertSchema } from "drizzle-zod";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const profilesTable = pgTable("student_profiles", {
  ownerId: text("owner_id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  major: text("major").notNull().default(""),
  year: text("year").notNull().default(""),
});

export const insertProfileSchema = createInsertSchema(profilesTable);
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;

export const preferencesTable = pgTable("student_preferences", {
  ownerId: text("owner_id").primaryKey(),
  dailyFocus: boolean("daily_focus").notNull().default(true),
  deadlineReminders: boolean("deadline_reminders").notNull().default(true),
  weeklyReflection: boolean("weekly_reflection").notNull().default(false),
});

export const insertPreferencesSchema = createInsertSchema(preferencesTable);
export type InsertPreferences = z.infer<typeof insertPreferencesSchema>;
export type Preferences = typeof preferencesTable.$inferSelect;