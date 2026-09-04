import { and, asc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, coursesTable, tasksTable } from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { ensureDemoData } from "../lib/demo-data";

const router: IRouter = Router();

function dayOffset(base: Date, days: number): string {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function taskSelection() {
  return {
    id: tasksTable.id,
    title: tasksTable.title,
    courseId: tasksTable.courseId,
    courseName: coursesTable.name,
    courseCode: coursesTable.code,
    type: tasksTable.type,
    dueDate: tasksTable.dueDate,
    dueTime: tasksTable.dueTime,
    priority: tasksTable.priority,
    completed: tasksTable.completed,
    notes: tasksTable.notes,
    createdAt: tasksTable.createdAt,
    updatedAt: tasksTable.updatedAt,
  };
}

router.get("/dashboard", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await ensureDemoData(userId);
  const now = new Date();
  const today = dayOffset(now, 0);
  const weekStart = dayOffset(now, -((now.getDay() + 6) % 7));
  const weekEnd = dayOffset(now, 6 - ((now.getDay() + 6) % 7));

  const baseFilters = and(
    eq(tasksTable.ownerId, userId),
    eq(tasksTable.completed, false),
  );
  const [todayTasks, upcomingTasks, weekTasks, completedWeekTasks] =
    await Promise.all([
      db
        .select(taskSelection())
        .from(tasksTable)
        .innerJoin(coursesTable, eq(tasksTable.courseId, coursesTable.id))
        .where(and(baseFilters, eq(tasksTable.dueDate, today)))
        .orderBy(asc(tasksTable.dueTime)),
      db
        .select(taskSelection())
        .from(tasksTable)
        .innerJoin(coursesTable, eq(tasksTable.courseId, coursesTable.id))
        .where(and(baseFilters, gte(tasksTable.dueDate, today), lte(tasksTable.dueDate, dayOffset(now, 7))))
        .orderBy(asc(tasksTable.dueDate), asc(tasksTable.dueTime))
        .limit(6),
      db
        .select({ dueDate: tasksTable.dueDate, completed: tasksTable.completed })
        .from(tasksTable)
        .where(and(eq(tasksTable.ownerId, userId), gte(tasksTable.dueDate, weekStart), lte(tasksTable.dueDate, weekEnd))),
      db
        .select({ dueDate: tasksTable.dueDate, completed: tasksTable.completed })
        .from(tasksTable)
        .where(and(eq(tasksTable.ownerId, userId), eq(tasksTable.completed, true), gte(tasksTable.dueDate, weekStart), lte(tasksTable.dueDate, weekEnd))),
    ]);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = dayOffset(new Date(`${weekStart}T12:00:00`), index);
    const total = weekTasks.filter((task) => task.dueDate === date).length;
    const completed = completedWeekTasks.filter((task) => task.dueDate === date).length;
    return { date, completed, total };
  });
  const total = weekTasks.length;
  const completed = completedWeekTasks.length;
  res.json(
    GetDashboardResponse.parse({
      todayTasks,
      upcomingTasks,
      completion: {
        completed,
        total,
        percentage: total ? Math.round((completed / total) * 100) : 0,
        days,
      },
    }),
  );
});

export default router;