import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, coursesTable } from "@workspace/db";
import {
  CreateCourseBody,
  CreateCourseResponse,
  DeleteCourseParams,
  ListCoursesResponse,
  UpdateCourseBody,
  UpdateCourseParams,
  UpdateCourseResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { ensureDemoData } from "../lib/demo-data";

const router: IRouter = Router();

router.get("/courses", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await ensureDemoData(userId);
  const courses = await db
    .select({
      id: coursesTable.id,
      name: coursesTable.name,
      code: coursesTable.code,
      color: coursesTable.color,
    })
    .from(coursesTable)
    .where(eq(coursesTable.ownerId, userId))
    .orderBy(asc(coursesTable.name));
  res.json(ListCoursesResponse.parse(courses));
});

router.post("/courses", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [course] = await db
    .insert(coursesTable)
    .values({ ...parsed.data, ownerId: res.locals.userId as string })
    .returning({
      id: coursesTable.id,
      name: coursesTable.name,
      code: coursesTable.code,
      color: coursesTable.color,
    });
  res.status(201).json(CreateCourseResponse.parse(course));
});

router.patch("/courses/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCourseParams.safeParse(req.params);
  const parsed = UpdateCourseBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [course] = await db
    .update(coursesTable)
    .set(parsed.data)
    .where(
      and(
        eq(coursesTable.id, params.data.id),
        eq(coursesTable.ownerId, res.locals.userId as string),
      ),
    )
    .returning({
      id: coursesTable.id,
      name: coursesTable.name,
      code: coursesTable.code,
      color: coursesTable.color,
    });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.json(UpdateCourseResponse.parse(course));
});

router.delete("/courses/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [course] = await db
    .delete(coursesTable)
    .where(
      and(
        eq(coursesTable.id, params.data.id),
        eq(coursesTable.ownerId, res.locals.userId as string),
      ),
    )
    .returning({ id: coursesTable.id });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;