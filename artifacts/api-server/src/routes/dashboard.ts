import { and, asc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, coursesTable, tasksTable } from "@workspace/db";
import { GetDashboardQueryParams, GetDashboardResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { ensureDemoData } from "../lib/demo-data";

const router: IRouter = Router();

// Calendar dates are "YYYY-MM-DD" strings; the arithmetic runs in UTC so the
// server's own time zone never shifts a day.
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The student's local date when the browser sends one, else the server's UTC
// date. Trusted only within a day of the server's date (time zones span ±14h),
// so in the evening in Florida "today" is not already tomorrow.
function resolveToday(requested: string | undefined): string {
  const serverToday = new Date().toISOString().slice(0, 10);
  if (!requested) return serverToday;
  const offsetDays = (Date.parse(`${requested}T00:00:00Z`) - Date.parse(`${serverToday}T00:00:00Z`)) / 86_400_000;
  return Math.abs(offsetDays) <= 1 ? requested : serverToday;
}

function taskSelection() {
  return {
    id: tasksTable.id,
    title: tasksTable.title,
    courseId: tasksTable.courseId,
    courseName: coursesTable.name,
    courseCode: coursesTable.code,
    courseColor: coursesTable.color,
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

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const query = GetDashboardQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  await ensureDemoData(userId);
  const today = resolveToday(query.data.today);
  // Weeks run Monday through Sunday.
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = addDays(today, -weekday);
  const weekEnd = addDays(weekStart, 6);

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
        .where(and(baseFilters, gte(tasksTable.dueDate, today), lte(tasksTable.dueDate, addDays(today, 7))))
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
    const date = addDays(weekStart, index);
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