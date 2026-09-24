import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, communityMessagesTable, communityReportsTable, profilesTable } from "@workspace/db";
import {
  CreateCommunityMessageBody,
  CreateCommunityMessageResponse,
  DeleteCommunityMessageParams,
  ListCommunityMessagesQueryParams,
  ListCommunityMessagesResponse,
  ReportCommunityMessageBody,
  ReportCommunityMessageParams,
  ReportCommunityMessageResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function presentMessage(message: typeof communityMessagesTable.$inferSelect, userId: string) {
  return {
    id: message.id,
    room: message.room,
    body: message.body,
    authorName: message.authorName,
    authorRole: message.authorRole,
    isMine: message.ownerId === userId,
    createdAt: message.createdAt,
  };
}

router.get("/community/messages", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListCommunityMessagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ownerId = res.locals.userId as string;
  const messages = await db.select().from(communityMessagesTable)
    .where(eq(communityMessagesTable.room, parsed.data.room))
    .orderBy(desc(communityMessagesTable.id)).limit(100);
  res.json(ListCommunityMessagesResponse.parse(
    messages.reverse().map(message => presentMessage(message, ownerId)),
  ));
});

router.post("/community/messages", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCommunityMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data.body.trim();
  if (!body) {
    res.status(400).json({ error: "Enter a message before sending" });
    return;
  }
  if (parsed.data.room === "students" && parsed.data.authorRole !== "student") {
    res.status(400).json({ error: "Use the Help room to post as a volunteer tutor or advisor" });
    return;
  }
  const ownerId = res.locals.userId as string;
  const [latest] = await db.select({ createdAt: communityMessagesTable.createdAt })
    .from(communityMessagesTable).where(eq(communityMessagesTable.ownerId, ownerId))
    .orderBy(desc(communityMessagesTable.id)).limit(1);
  if (latest && Date.now() - latest.createdAt.getTime() < 2000) {
    res.status(429).json({ error: "Please wait a moment before sending another message" });
    return;
  }
  const [profile] = await db.select({ displayName: profilesTable.displayName })
    .from(profilesTable).where(eq(profilesTable.ownerId, ownerId));
  const authorName = profile?.displayName.trim().slice(0, 60) || "Campus member";
  const [message] = await db.insert(communityMessagesTable).values({
    ownerId,
    room: parsed.data.room,
    body,
    authorName,
    authorRole: parsed.data.authorRole,
  }).returning();
  res.status(201).json(CreateCommunityMessageResponse.parse(presentMessage(message, ownerId)));
});

router.delete("/community/messages/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCommunityMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(communityMessagesTable)
    .where(and(
      eq(communityMessagesTable.id, params.data.id),
      eq(communityMessagesTable.ownerId, res.locals.userId as string),
    ))
    .returning({ id: communityMessagesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/community/messages/:id/report", requireAuth, async (req, res): Promise<void> => {
  const params = ReportCommunityMessageParams.safeParse(req.params);
  const parsed = ReportCommunityMessageBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const reporterId = res.locals.userId as string;
  const [message] = await db.select({ ownerId: communityMessagesTable.ownerId })
    .from(communityMessagesTable).where(eq(communityMessagesTable.id, params.data.id));
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (message.ownerId === reporterId) {
    res.status(400).json({ error: "You cannot report your own message" });
    return;
  }
  await db.insert(communityReportsTable)
    .values({ messageId: params.data.id, reporterId, reason: parsed.data.reason })
    .onConflictDoNothing();
  res.status(201).json(ReportCommunityMessageResponse.parse({ received: true }));
});

export default router;