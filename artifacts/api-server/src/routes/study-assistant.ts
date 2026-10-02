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
import OpenAI from "openai";
import { buildStudyMessages, studyResponseFormat } from "../lib/study-coach";

const router: IRouter = Router();
const activeRequests = new Set<string>();
let client: OpenAI | undefined;

router.post(
  "/ai/study-assistant",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = AskStudyAssistantBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const managedBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const managedApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const useManagedAI = Boolean(managedBaseUrl && managedApiKey);
    const apiKey = useManagedAI ? managedApiKey : process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "AI assistant is not configured" });
      return;
    }

    const ownerId = res.locals.userId as string;
    if (activeRequests.has(ownerId)) {
      res.status(429).json({ error: "Your assistant is still answering. Please wait before asking again." });
      return;
    }
    if (parsed.data.prompt.trim().length < 3) {
      res.status(400).json({ error: "Please enter a question with at least 3 characters." });
      return;
    }
    if ((parsed.data.history ?? []).reduce((total, message) => total + message.content.length, 0) > 160000) {
      res.status(400).json({ error: "This conversation is too long. Start a new conversation and try again." });
      return;
    }
    activeRequests.add(ownerId);
    try {
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
      today: new Date().toISOString().slice(0, 10),
      name: profile?.displayName || "Student",
      major: profile?.major || "Not provided",
      year: profile?.year || "Not provided",
      selectedCourse: selectedCourse ?? null,
      courses,
      upcomingTasks,
    };

      client ??= new OpenAI({
        apiKey,
        ...(useManagedAI ? { baseURL: managedBaseUrl } : {}),
        timeout: 45000,
        maxRetries: 1,
      });
      const response = await client.chat.completions.create({
          model: "gpt-5-mini",
          reasoning_effort: "low",
          max_completion_tokens: 8192,
          response_format: studyResponseFormat,
          messages: buildStudyMessages(studentContext, parsed.data.prompt, parsed.data.history),
      });

      const choice = response.choices[0];
      const content = choice?.message.content;
      if (!content || choice.finish_reason !== "stop") {
        res.status(502).json({ error: "The assistant couldn't finish this answer. Try a shorter question or fewer notes." });
        return;
      }

      const decoded = JSON.parse(content);
      const result = AskStudyAssistantResponse.safeParse({
        ...decoded,
        answer: typeof decoded.answer === "string" ? decoded.answer.trim() : decoded.answer,
        suggestedTitle: typeof decoded.suggestedTitle === "string" ? decoded.suggestedTitle.trim() : decoded.suggestedTitle,
      });
      if (!result.success) {
        req.log.error(
          { issueCount: result.error.issues.length },
          "OpenAI study assistant response validation failed",
        );
        res.status(502).json({ error: "The AI response was not usable" });
        return;
      }

      res.json(result.data);
    } catch (error) {
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      req.log.error({ status, errorType: error instanceof Error ? error.name : "Unknown" }, "Study assistant request failed");
      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        res.status(504).json({ error: "The assistant took too long to answer. Try again with a shorter question." });
      } else if (status === 429) {
        res.status(503).json({ error: "The AI service is busy or its usage limit has been reached. Please try again later." });
      } else if (status === 401 || status === 403) {
        res.status(503).json({ error: "The AI service needs attention from the app owner. Please try again later." });
      } else {
        res.status(502).json({ error: "The assistant couldn't respond. Your question is still here—please try again." });
      }
    } finally {
      activeRequests.delete(ownerId);
    }
  },
);

export default router;