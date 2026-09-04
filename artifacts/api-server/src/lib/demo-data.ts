import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { coursesTable, tasksTable } from "@workspace/db";

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function ensureDemoData(ownerId: string): Promise<void> {
  const existing = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.ownerId, ownerId))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  const courses = await db
    .insert(coursesTable)
    .values([
      { ownerId, name: "Human Computer Interaction", code: "CS 324", color: "#7c3aed" },
      { ownerId, name: "Design History", code: "DES 210", color: "#0f766e" },
      { ownerId, name: "Data Structures", code: "CS 240", color: "#e11d48" },
      { ownerId, name: "Communication Studies", code: "COM 118", color: "#d97706" },
    ])
    .returning();

  const [hci, design, data, comm] = courses;
  await db.insert(tasksTable).values([
    {
      ownerId,
      title: "Read chapter 6 and submit response",
      courseId: hci.id,
      type: "reading",
      dueDate: dateOffset(0),
      dueTime: "11:59 PM",
      priority: "high",
      notes: "Focus on participatory design methods.",
    },
    {
      ownerId,
      title: "Midterm exam",
      courseId: design.id,
      type: "exam",
      dueDate: dateOffset(1),
      dueTime: "10:00 AM",
      priority: "high",
      notes: "Review lectures 1–5.",
    },
    {
      ownerId,
      title: "Prototype critique",
      courseId: hci.id,
      type: "project",
      dueDate: dateOffset(3),
      dueTime: "2:30 PM",
      priority: "medium",
    },
    {
      ownerId,
      title: "Problem set 4",
      courseId: data.id,
      type: "assignment",
      dueDate: dateOffset(5),
      dueTime: "11:59 PM",
      priority: "medium",
    },
    {
      ownerId,
      title: "Discussion board response",
      courseId: comm.id,
      type: "assignment",
      dueDate: dateOffset(-2),
      priority: "low",
      completed: true,
    },
  ]);
}