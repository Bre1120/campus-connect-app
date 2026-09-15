import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, preferencesTable, profilesTable } from "@workspace/db";
import {
  GetPreferencesResponse,
  GetProfileResponse,
  UpdatePreferencesBody,
  UpdatePreferencesResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function ensureProfile(ownerId: string) {
  const [profile] = await db
    .insert(profilesTable)
    .values({ ownerId })
    .onConflictDoNothing()
    .returning();
  if (profile) return profile;
  const [existing] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.ownerId, ownerId));
  return existing;
}

async function ensurePreferences(ownerId: string) {
  const [preferences] = await db
    .insert(preferencesTable)
    .values({ ownerId })
    .onConflictDoNothing()
    .returning();
  if (preferences) return preferences;
  const [existing] = await db
    .select()
    .from(preferencesTable)
    .where(eq(preferencesTable.ownerId, ownerId));
  return existing;
}

router.get("/profile", requireAuth, async (_req, res): Promise<void> => {
  const profile = await ensureProfile(res.locals.userId as string);
  res.json(GetProfileResponse.parse(profile));
});

router.patch("/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ownerId = res.locals.userId as string;
  await ensureProfile(ownerId);
  const [profile] = await db
    .update(profilesTable)
    .set(parsed.data)
    .where(eq(profilesTable.ownerId, ownerId))
    .returning();
  res.json(UpdateProfileResponse.parse(profile));
});

router.get("/preferences", requireAuth, async (_req, res): Promise<void> => {
  const preferences = await ensurePreferences(res.locals.userId as string);
  res.json(GetPreferencesResponse.parse(preferences));
});

router.patch("/preferences", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdatePreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ownerId = res.locals.userId as string;
  await ensurePreferences(ownerId);
  const [preferences] = await db
    .update(preferencesTable)
    .set(parsed.data)
    .where(eq(preferencesTable.ownerId, ownerId))
    .returning();
  res.json(UpdatePreferencesResponse.parse(preferences));
});

export default router;