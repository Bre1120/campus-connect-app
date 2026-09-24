import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  coursesTable,
  db,
  profilesTable,
  tasksTable,
} from "@workspace/db";
import {
  AskStudyAssistantBody,
  AskStudyAssistantResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post(
  "/ai/study-assistant",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = AskStudyAssistantBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "AI assistant is not configured" });
      return;
    }

    const ownerId = res.locals.userId as string;
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.ownerId, ownerId));
    const courses = await db
      .select({
        id: coursesTable.id,
        name: coursesTable.name,
        code: coursesTable.code,
      })
      .from(coursesTable)
      .where(eq(coursesTable.ownerId, ownerId));

    if (
      parsed.data.courseId &&
      !courses.some((course) => course.id === parsed.data.courseId)
    ) {
      res.status(400).json({ error: "Course not found" });
      return;
    }

    const upcomingTasks = await db
      .select({
        title: tasksTable.title,
        dueDate: tasksTable.dueDate,
        type: tasksTable.type,
        courseId: tasksTable.courseId,
      })
      .from(tasksTable)
      .where(
        parsed.data.courseId
          ? and(
              eq(tasksTable.ownerId, ownerId),
              eq(tasksTable.courseId, parsed.data.courseId),
              eq(tasksTable.completed, false),
            )
          : and(
              eq(tasksTable.ownerId, ownerId),
              eq(tasksTable.completed, false),
            ),
      )
      .orderBy(asc(tasksTable.dueDate))
      .limit(8);

    const selectedCourse = courses.find(
      (course) => course.id === parsed.data.courseId,
    );
    const studentContext = {
      name: profile?.displayName || "Student",
      major: profile?.major || "Not provided",
      year: profile?.year || "Not provided",
      selectedCourse: selectedCourse ?? null,
      courses,
      upcomingTasks,
    };

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          max_completion_tokens: 8192,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are Campus Connect's supportive college study coach. Give focused, practical academic guidance using the provided student context. Return only valid JSON with exactly these keys: answer (string, concise and skimmable), suggestedTitle (string), suggestedCards (array of 3 to 6 objects with front and back strings). Flashcards must directly reinforce the user's request. Never invent course facts when the user has not supplied subject content; in that case make cards about study strategy or ask the student to paste notes.",
            },
            {
              role: "user",
              content: JSON.stringify({
                studentContext,
                request: parsed.data.prompt,
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        req.log.error(
          { status: response.status, body: errorText.slice(0, 500) },
          "OpenAI study assistant request failed",
        );
        res.status(502).json({ error: "The AI assistant could not respond" });
        return;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        res.status(502).json({ error: "The AI assistant returned no response" });
        return;
      }

      const result = AskStudyAssistantResponse.safeParse(JSON.parse(content));
      if (!result.success) {
        req.log.error(
          { issues: result.error.issues },
          "OpenAI study assistant response validation failed",
        );
        res.status(502).json({ error: "The AI response was not usable" });
        return;
      }

      res.json(result.data);
    } catch (error) {
      req.log.error({ error }, "OpenAI study assistant request failed");
      res.status(502).json({ error: "The AI assistant could not respond" });
    }
  },
);

export default router;