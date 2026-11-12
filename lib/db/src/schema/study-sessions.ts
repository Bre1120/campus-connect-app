import { date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { coursesTable } from "./courses";

export const studySessionsTable = pgTable("study_sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ownerId: text("owner_id").notNull(),
  courseId: integer("course_id")
    .notNull()
    .references(() => coursesTable.id, { onDelete: "cascade" }),
  minutes: integer("minutes").notNull(),
  note: text("note"),
  // The student's local calendar day, kept as "YYYY-MM-DD" like task due dates.
  studiedOn: date("studied_on", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StudySession = typeof studySessionsTable.$inferSelect;
