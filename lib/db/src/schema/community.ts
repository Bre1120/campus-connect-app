import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const communityMessagesTable = pgTable("community_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ownerId: text("owner_id").notNull(),
  room: text("room", { enum: ["students", "help"] }).notNull(),
  body: text("body").notNull(),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role", { enum: ["student", "tutor", "advisor"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityReportsTable = pgTable("community_reports", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  messageId: integer("message_id").notNull().references(() => communityMessagesTable.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id").notNull(),
  reason: text("reason", { enum: ["harassment", "spam", "unsafe", "other"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique("community_reports_message_reporter").on(table.messageId, table.reporterId)]);

export const insertCommunityMessageSchema = createInsertSchema(communityMessagesTable).pick({
  ownerId: true, room: true, body: true, authorName: true, authorRole: true,
});
export const insertCommunityReportSchema = createInsertSchema(communityReportsTable).pick({
  messageId: true, reporterId: true, reason: true,
});
export type InsertCommunityMessage = z.infer<typeof insertCommunityMessageSchema>;
export type InsertCommunityReport = z.infer<typeof insertCommunityReportSchema>;