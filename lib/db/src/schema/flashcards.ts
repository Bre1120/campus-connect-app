import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { coursesTable } from "./courses";

export const flashcardConfidenceValues = [
  "new",
  "learning",
  "mastered",
] as const;

export const flashcardDecksTable = pgTable("flashcard_decks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  courseId: integer("course_id").references(() => coursesTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const flashcardsTable = pgTable("flashcards", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  deckId: integer("deck_id")
    .notNull()
    .references(() => flashcardDecksTable.id, { onDelete: "cascade" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  confidence: text("confidence", { enum: flashcardConfidenceValues })
    .notNull()
    .default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFlashcardDeckSchema = createInsertSchema(
  flashcardDecksTable,
).pick({
  ownerId: true,
  title: true,
  description: true,
  courseId: true,
});
export const insertFlashcardSchema = createInsertSchema(flashcardsTable).pick({
  deckId: true,
  front: true,
  back: true,
  confidence: true,
});

export type InsertFlashcardDeck = z.infer<typeof insertFlashcardDeckSchema>;
export type InsertFlashcard = z.infer<typeof insertFlashcardSchema>;
export type FlashcardDeck = typeof flashcardDecksTable.$inferSelect;
export type Flashcard = typeof flashcardsTable.$inferSelect;