import { and, desc, eq, gte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, coursesTable, studySessionsTable } from "@workspace/db";
import {
  CreateStudySessionBody,
  CreateStudySessionResponse,
  DeleteStudySessionParams,
  ListStudySessionsQueryParams,
  ListStudySessionsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function sessionSelection() {
  return {
    id: studySessionsTable.id,
    courseId: studySessionsTable.courseId,
    courseName: coursesTable.name,
    courseCode: coursesTable.code,
    courseColor: coursesTable.color,
    minutes: studySessionsTable.minutes,
    note: studySessionsTable.note,
    studiedOn: studySessionsTable.studiedOn,
    createdAt: studySessionsTable.createdAt,
  };
}

router.get("/study-sessions", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const query = ListStudySessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const filters = [eq(studySessionsTable.ownerId, userId)];
  if (query.data.from) filters.push(gte(studySessionsTable.studiedOn, query.data.from));

  const sessions = await db
    .select(sessionSelection())
    .from(studySessionsTable)
    .innerJoin(coursesTable, eq(studySessionsTable.courseId, coursesTable.id))
    .where(and(...filters))
    .orderBy(desc(studySessionsTable.studiedOn), desc(studySessionsTable.createdAt));
  res.json(ListStudySessionsResponse.parse(sessions));
});

router.post("/study-sessions", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const parsed = CreateStudySessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [course] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(and(eq(coursesTable.id, parsed.data.courseId), eq(coursesTable.ownerId, userId)));
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const [created] = await db
    .insert(studySessionsTable)
    .values({
      ownerId: userId,
      courseId: parsed.data.courseId,
      minutes: parsed.data.minutes,
      note: parsed.data.note?.trim() || null,
      studiedOn: parsed.data.studiedOn,
    })
    .returning({ id: studySessionsTable.id });
  const [session] = await db
    .select(sessionSelection())
    .from(studySessionsTable)
    .innerJoin(coursesTable, eq(studySessionsTable.courseId, coursesTable.id))
    .where(eq(studySessionsTable.id, created.id));
  res.status(201).json(CreateStudySessionResponse.parse(session));
});

router.delete("/study-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteStudySessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(studySessionsTable)
    .where(
      and(
        eq(studySessionsTable.id, params.data.id),
        eq(studySessionsTable.ownerId, res.locals.userId as string),
      ),
    )
    .returning({ id: studySessionsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Study session not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
