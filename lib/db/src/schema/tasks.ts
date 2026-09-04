import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { coursesTable } from "./courses";

export const taskTypeValues = [
  "assignment",
  "exam",
  "project",
  "reading",
  "other",
] as const;
export const priorityValues = ["low", "medium", "high"] as const;

export const tasksTable = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  courseId: integer("course_id")
    .notNull()
    .references(() => coursesTable.id, { onDelete: "cascade" }),
  type: text("type", { enum: taskTypeValues }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  dueTime: text("due_time"),
  priority: text("priority", { enum: priorityValues }).notNull().default("medium"),
  completed: boolean("completed").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).pick({
  ownerId: true,
  title: true,
  courseId: true,
  type: true,
  dueDate: true,
  dueTime: true,
  priority: true,
  completed: true,
  notes: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;