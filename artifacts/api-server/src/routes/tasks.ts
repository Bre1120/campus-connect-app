import { and, asc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, coursesTable, tasksTable } from "@workspace/db";
import {
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  GetTaskParams,
  GetTaskResponse,
  ListTasksQueryParams,
  ListTasksResponse,
  ToggleTaskCompletionBody,
  ToggleTaskCompletionParams,
  ToggleTaskCompletionResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { ensureDemoData } from "../lib/demo-data";

const router: IRouter = Router();

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

async function findTask(userId: string, id: number) {
  const [task] = await db
    .select(taskSelection())
    .from(tasksTable)
    .innerJoin(coursesTable, eq(tasksTable.courseId, coursesTable.id))
    .where(and(eq(tasksTable.id, id), eq(tasksTable.ownerId, userId)));
  return task;
}

router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await ensureDemoData(userId);
  const rawQuery = {
    ...req.query,
    startDate: req.query.startDate
      ? new Date(String(req.query.startDate))
      : undefined,
    endDate: req.query.endDate
      ? new Date(String(req.query.endDate))
      : undefined,
  };
  const parsedQuery = ListTasksQueryParams.safeParse(rawQuery);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const filters = [eq(tasksTable.ownerId, userId)];
  if (parsedQuery.data.status === "active") {
    filters.push(eq(tasksTable.completed, false));
  } else if (parsedQuery.data.status === "completed") {
    filters.push(eq(tasksTable.completed, true));
  }
  if (parsedQuery.data.type) {
    filters.push(eq(tasksTable.type, parsedQuery.data.type));
  }
  if (parsedQuery.data.courseId) {
    filters.push(eq(tasksTable.courseId, parsedQuery.data.courseId));
  }
  if (parsedQuery.data.startDate) {
    filters.push(
      gte(tasksTable.dueDate, parsedQuery.data.startDate.toISOString().slice(0, 10)),
    );
  }
  if (parsedQuery.data.endDate) {
    filters.push(
      lte(tasksTable.dueDate, parsedQuery.data.endDate.toISOString().slice(0, 10)),
    );
  }

  const tasks = await db
    .select(taskSelection())
    .from(tasksTable)
    .innerJoin(coursesTable, eq(tasksTable.courseId, coursesTable.id))
    .where(and(...filters))
    .orderBy(asc(tasksTable.dueDate), asc(tasksTable.dueTime));

  res.json(ListTasksResponse.parse(tasks));
});

router.post("/tasks", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [course] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(and(eq(coursesTable.id, parsed.data.courseId), eq(coursesTable.ownerId, userId)));
  if (!course) {
    res.status(400).json({ error: "Course not found" });
    return;
  }

  const [created] = await db
    .insert(tasksTable)
    .values({
      ownerId: userId,
      title: parsed.data.title,
      courseId: parsed.data.courseId,
      type: parsed.data.type,
      dueDate: parsed.data.dueDate.toISOString().slice(0, 10),
      dueTime: parsed.data.dueTime ?? null,
      priority: parsed.data.priority,
      notes: parsed.data.notes ?? null,
    })
    .returning();
  const task = await findTask(userId, created.id);
  res.status(201).json(CreateTaskResponse.parse(task));
});

router.get("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const task = await findTask(res.locals.userId as string, params.data.id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(GetTaskResponse.parse(task));
});

router.patch("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates = {
    ...parsed.data,
    dueDate: parsed.data.dueDate
      ? parsed.data.dueDate.toISOString().slice(0, 10)
      : undefined,
    dueTime: parsed.data.dueTime ?? undefined,
    notes: parsed.data.notes ?? undefined,
  };
  const [updated] = await db
    .update(tasksTable)
    .set(updates)
    .where(
      and(
        eq(tasksTable.id, params.data.id),
        eq(tasksTable.ownerId, res.locals.userId as string),
      ),
    )
    .returning({ id: tasksTable.id });
  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const task = await findTask(res.locals.userId as string, updated.id);
  res.json(UpdateTaskResponse.parse(task));
});

router.delete("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(tasksTable)
    .where(
      and(
        eq(tasksTable.id, params.data.id),
        eq(tasksTable.ownerId, res.locals.userId as string),
      ),
    )
    .returning({ id: tasksTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.sendStatus(204);
});

router.patch("/tasks/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const params = ToggleTaskCompletionParams.safeParse(req.params);
  const parsed = ToggleTaskCompletionBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(tasksTable)
    .set({ completed: parsed.data.completed })
    .where(
      and(
        eq(tasksTable.id, params.data.id),
        eq(tasksTable.ownerId, res.locals.userId as string),
      ),
    )
    .returning({ id: tasksTable.id });
  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const task = await findTask(res.locals.userId as string, updated.id);
  res.json(ToggleTaskCompletionResponse.parse(task));
});

export default router;