import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { coursesTable, db, tasksTable } from "@workspace/db";
import { ImportAgendaBody, ImportAgendaResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { agendaEntryKey, isCalendarDate, normalizeCourseCode } from "../lib/agenda-import";

const router: IRouter = Router();

class ImportInputError extends Error {}

router.post("/tasks/import", requireAuth, async (req, res): Promise<void> => {
  const parsed = ImportAgendaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid import. Review the titles, dates, times, and course details." });
    return;
  }
  const input = parsed.data;
  if (!input.course.name.trim() || !normalizeCourseCode(input.course.code) ||
      input.tasks.some(task => !task.title.trim() || !isCalendarDate(task.dueDate))) {
    res.status(400).json({ error: "Every entry needs a title and a real due date. Course name and code are required." });
    return;
  }
  const ownerId = res.locals.userId as string;
  try {
    const result = await db.transaction(async tx => {
      // Serialize this account's imports so retries and simultaneous tabs cannot duplicate a batch.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`);
      const courses = await tx.select().from(coursesTable).where(eq(coursesTable.ownerId, ownerId));
      const matches = courses.filter(course =>
        normalizeCourseCode(course.code) === normalizeCourseCode(input.course.code));
      let course = input.course.courseId
        ? courses.find(candidate => candidate.id === input.course.courseId)
        : matches[0];
      if (input.course.courseId && !course) {
        throw new ImportInputError("The selected course does not belong to your account.");
      }
      if (!input.course.courseId && matches.length > 1) {
        throw new ImportInputError("More than one course has this code. Choose the existing course to use.");
      }
      if (!course) {
        [course] = await tx.insert(coursesTable).values({
          ownerId, code: input.course.code.trim(), name: input.course.name.trim(), color: "#278476",
        }).returning();
      }
      const existing = await tx.select({ title: tasksTable.title, dueDate: tasksTable.dueDate })
        .from(tasksTable).where(and(eq(tasksTable.ownerId, ownerId), eq(tasksTable.courseId, course.id)));
      const seen = new Set(existing.map(task => agendaEntryKey(task.title, task.dueDate)));
      const entries = [];
      for (const task of input.tasks) {
        const key = agendaEntryKey(task.title, task.dueDate);
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          ownerId, courseId: course.id, title: task.title.trim(), type: task.type,
          dueDate: task.dueDate, dueTime: task.dueTime ?? null, priority: task.priority,
          notes: task.notes?.trim() || null, completed: false,
        });
      }
      if (entries.length) await tx.insert(tasksTable).values(entries);
      return { insertedCount: entries.length, skippedCount: input.tasks.length - entries.length, courseId: course.id };
    });
    res.json(ImportAgendaResponse.parse(result));
  } catch (error) {
    if (error instanceof ImportInputError) {
      res.status(400).json({ error: error.message });
      return;
    }
    req.log.error({ errorType: error instanceof Error ? error.name : "Unknown" }, "Agenda import failed");
    res.status(500).json({ error: "Nothing was imported. Your review is still available—please try again." });
  }
});

export default router;