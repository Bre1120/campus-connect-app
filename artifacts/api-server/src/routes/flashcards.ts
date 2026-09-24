import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  coursesTable,
  db,
  flashcardDecksTable,
  flashcardsTable,
} from "@workspace/db";
import {
  CreateFlashcardDeckBody,
  CreateFlashcardDeckResponse,
  DeleteFlashcardDeckParams,
  GetFlashcardDeckParams,
  GetFlashcardDeckResponse,
  ListFlashcardDecksResponse,
  UpdateFlashcardConfidenceBody,
  UpdateFlashcardConfidenceParams,
  UpdateFlashcardConfidenceResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function getDeckDetail(ownerId: string, id: number) {
  const [deck] = await db
    .select({
      id: flashcardDecksTable.id,
      title: flashcardDecksTable.title,
      description: flashcardDecksTable.description,
      courseId: flashcardDecksTable.courseId,
      courseName: coursesTable.name,
      createdAt: flashcardDecksTable.createdAt,
    })
    .from(flashcardDecksTable)
    .leftJoin(coursesTable, eq(flashcardDecksTable.courseId, coursesTable.id))
    .where(
      and(
        eq(flashcardDecksTable.id, id),
        eq(flashcardDecksTable.ownerId, ownerId),
      ),
    );
  if (!deck) return undefined;

  const cards = await db
    .select({
      id: flashcardsTable.id,
      deckId: flashcardsTable.deckId,
      front: flashcardsTable.front,
      back: flashcardsTable.back,
      confidence: flashcardsTable.confidence,
      createdAt: flashcardsTable.createdAt,
    })
    .from(flashcardsTable)
    .where(eq(flashcardsTable.deckId, id))
    .orderBy(asc(flashcardsTable.id));

  return { ...deck, cardCount: cards.length, cards };
}

router.get("/flashcard-decks", requireAuth, async (_req, res): Promise<void> => {
  const ownerId = res.locals.userId as string;
  const decks = await db
    .select({
      id: flashcardDecksTable.id,
      title: flashcardDecksTable.title,
      description: flashcardDecksTable.description,
      courseId: flashcardDecksTable.courseId,
      courseName: coursesTable.name,
      createdAt: flashcardDecksTable.createdAt,
    })
    .from(flashcardDecksTable)
    .leftJoin(coursesTable, eq(flashcardDecksTable.courseId, coursesTable.id))
    .where(eq(flashcardDecksTable.ownerId, ownerId))
    .orderBy(asc(flashcardDecksTable.createdAt));

  const response = await Promise.all(
    decks.map(async (deck) => {
      const cards = await db
        .select({ id: flashcardsTable.id })
        .from(flashcardsTable)
        .where(eq(flashcardsTable.deckId, deck.id));
      return { ...deck, cardCount: cards.length };
    }),
  );

  res.json(ListFlashcardDecksResponse.parse(response));
});

router.post("/flashcard-decks", requireAuth, async (req, res): Promise<void> => {
  const ownerId = res.locals.userId as string;
  const parsed = CreateFlashcardDeckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.courseId) {
    const [course] = await db
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(
        and(
          eq(coursesTable.id, parsed.data.courseId),
          eq(coursesTable.ownerId, ownerId),
        ),
      );
    if (!course) {
      res.status(400).json({ error: "Course not found" });
      return;
    }
  }

  const deckId = await db.transaction(async (tx) => {
    const [deck] = await tx
      .insert(flashcardDecksTable)
      .values({
        ownerId,
        title: parsed.data.title,
        description: parsed.data.description ?? "",
        courseId: parsed.data.courseId ?? null,
      })
      .returning({ id: flashcardDecksTable.id });

    await tx.insert(flashcardsTable).values(
      parsed.data.cards.map((card) => ({
        deckId: deck.id,
        front: card.front,
        back: card.back,
      })),
    );
    return deck.id;
  });

  const detail = await getDeckDetail(ownerId, deckId);
  res.status(201).json(CreateFlashcardDeckResponse.parse(detail));
});

router.get("/flashcard-decks/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetFlashcardDeckParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const detail = await getDeckDetail(
    res.locals.userId as string,
    params.data.id,
  );
  if (!detail) {
    res.status(404).json({ error: "Flashcard deck not found" });
    return;
  }
  res.json(GetFlashcardDeckResponse.parse(detail));
});

router.delete(
  "/flashcard-decks/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteFlashcardDeckParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(flashcardDecksTable)
      .where(
        and(
          eq(flashcardDecksTable.id, params.data.id),
          eq(flashcardDecksTable.ownerId, res.locals.userId as string),
        ),
      )
      .returning({ id: flashcardDecksTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Flashcard deck not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.patch(
  "/flashcards/:id/confidence",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateFlashcardConfidenceParams.safeParse(req.params);
    const parsed = UpdateFlashcardConfidenceBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [ownedCard] = await db
      .select({ id: flashcardsTable.id })
      .from(flashcardsTable)
      .innerJoin(
        flashcardDecksTable,
        eq(flashcardsTable.deckId, flashcardDecksTable.id),
      )
      .where(
        and(
          eq(flashcardsTable.id, params.data.id),
          eq(flashcardDecksTable.ownerId, res.locals.userId as string),
        ),
      );
    if (!ownedCard) {
      res.status(404).json({ error: "Flashcard not found" });
      return;
    }

    const [card] = await db
      .update(flashcardsTable)
      .set({ confidence: parsed.data.confidence })
      .where(eq(flashcardsTable.id, params.data.id))
      .returning();
    res.json(UpdateFlashcardConfidenceResponse.parse(card));
  },
);

export default router;